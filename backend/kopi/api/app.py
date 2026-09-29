"""The Kopi HTTP API. Every route reads through a `Store`, so fixtures and live data share one contract."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from kopi.api.auth import AppOnly, Authed, check_code, issue, require_token
from kopi.api.limits import LIMITS, RateLimiter, limited
from kopi.config import Settings
from kopi.models import (
    AuthRequest,
    AuthResponse,
    ChatEvent,
    ChatRequest,
    EligibilityCheck,
    EligibilityRequest,
    Licence,
    MarketContext,
    NoticeStatus,
    NoticeSummary,
    Overview,
    OverviewRequest,
    SearchResponse,
    SessionFile,
    TenderDetail,
)
from kopi.sandbox import CopilotUnavailable, LimitReached
from kopi.store import FixtureStore, NotFound, Store


@dataclass
class Filters:
    status: NoticeStatus | None = NoticeStatus.OPEN
    agency: str | None = None
    category: str | None = None
    method: str | None = None
    closing_after: datetime | None = None
    closing_before: datetime | None = None


def sse(event: ChatEvent) -> str:
    return f"event: {event.type.value}\ndata: {event.model_dump_json(exclude_none=True)}\n\n"


def caller_of(request: Request) -> str:
    """Who is chatting, for per-caller caps: the token itself (each sign-in gets its own)."""
    header = request.headers.get("authorization", "")
    return header.removeprefix("Bearer ").strip() or (request.client.host if request.client else "local")


def default_store(settings: Settings) -> Store:
    if settings.store == "live":
        from kopi.api.live import from_environment

        return from_environment()
    return FixtureStore()


def create_app(store: Store | None = None, settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    if settings.auth_required and not settings.signing_key:
        raise ValueError("KOPI_ACCESS_CODES is set but KOPI_SIGNING_KEY is not: refusing to start with a forgeable gate")
    app = FastAPI(title="Kopi API", version="0.1.0", description="A copilot for Singapore government tenders.")
    app.state.settings = settings
    app.state.store = store or default_store(settings)
    app.state.limiters = {kind: RateLimiter(*rule) for kind, rule in LIMITS.items()}
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(NotFound)
    async def not_found(_: Request, exc: NotFound) -> Response:
        return Response(json.dumps({"detail": str(exc)}), status.HTTP_404_NOT_FOUND, media_type="application/json")

    Read = limited("read")

    def db(request: Request) -> Store:
        return request.app.state.store

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "auth": settings.auth_required}

    @app.post("/auth", response_model=AuthResponse)
    def auth(body: AuthRequest) -> AuthResponse:
        if not settings.auth_required:
            token, expires = issue("local", "local")
            return AuthResponse(token=token, expires_at=expires)
        if not settings.signing_key or not check_code(settings, body.code):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "that access code is not valid")
        token, expires = issue(settings.signing_key, f"code:{body.code[:4]}")
        return AuthResponse(token=token, expires_at=expires)

    @app.get("/search", response_model=SearchResponse, dependencies=[Authed, Read])
    def search(request: Request, q: str = Query(min_length=1, max_length=300), limit: int = Query(20, le=100),
               status_: NoticeStatus | None = Query(NoticeStatus.OPEN, alias="status"), agency: str | None = None,
               category: str | None = None, method: str | None = None,
               closing_after: datetime | None = None, closing_before: datetime | None = None) -> SearchResponse:
        f = Filters(status_, agency, category, method, closing_after, closing_before)
        return db(request).search(q, f, limit)

    @app.get("/tenders", response_model=list[NoticeSummary], dependencies=[Authed, Read])
    def tenders(request: Request, limit: int = Query(50, le=200), offset: int = Query(0, ge=0),
                status_: NoticeStatus | None = Query(NoticeStatus.OPEN, alias="status"), agency: str | None = None,
                category: str | None = None, method: str | None = None,
                closing_after: datetime | None = None, closing_before: datetime | None = None) -> list[NoticeSummary]:
        f = Filters(status_, agency, category, method, closing_after, closing_before)
        return db(request).list_tenders(f, limit, offset)

    @app.get("/tenders/{doc_no}", response_model=TenderDetail, dependencies=[Authed, Read])
    def tender(request: Request, doc_no: str) -> TenderDetail:
        return db(request).tender(doc_no, None)

    @app.post("/tenders/{doc_no}/detail", response_model=TenderDetail, dependencies=[Authed, Read])
    def tender_for_profile(request: Request, doc_no: str, body: OverviewRequest) -> TenderDetail:
        return db(request).tender(doc_no, body.profile)

    @app.post("/tenders/{doc_no}/overview", response_model=Overview, dependencies=[AppOnly, limited("overview")])
    def overview(request: Request, doc_no: str, body: OverviewRequest) -> Overview:
        return db(request).overview(doc_no, body.profile)

    @app.post("/eligibility", response_model=list[EligibilityCheck], dependencies=[Authed, Read])
    def eligibility(request: Request, body: EligibilityRequest) -> list[EligibilityCheck]:
        return db(request).eligibility(body.doc_no, body.profile)

    @app.get("/awards/similar", response_model=MarketContext, dependencies=[Authed, Read])
    def similar_awards(request: Request, q: str = Query(min_length=1, max_length=300),
                       agency: str | None = None, k: int = Query(25, le=100)) -> MarketContext:
        return db(request).similar_awards(q, agency, k)

    @app.get("/licences", response_model=list[Licence], dependencies=[Authed, Read])
    def licences(request: Request, limit: int = Query(50, le=400), offset: int = Query(0, ge=0)) -> list[Licence]:
        return db(request).licences(limit, offset)

    @app.get("/licences/search", response_model=list[Licence], dependencies=[Authed, Read])
    def search_licences(request: Request, q: str = Query(min_length=1, max_length=300),
                        limit: int = Query(10, le=50)) -> list[Licence]:
        return db(request).search_licences(q, limit)

    @app.post("/chat", dependencies=[AppOnly, limited("chat")], response_class=StreamingResponse,
              responses={200: {"content": {"text/event-stream": {}}, "description": "ChatEvent per SSE message"}})
    async def chat(request: Request, body: ChatRequest) -> StreamingResponse:
        events = db(request).chat(body, caller=caller_of(request))
        try:
            first = await anext(events)
        except CopilotUnavailable as error:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from None
        except LimitReached as error:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(error)) from None
        except StopAsyncIteration:
            first = None

        async def stream():
            if first is None:
                return
            yield sse(first)
            async for event in events:
                yield sse(event)

        return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

    @app.get("/sessions/{session_id}/files", response_model=list[SessionFile], dependencies=[AppOnly])
    def session_files(request: Request, session_id: str) -> list[SessionFile]:
        return db(request).session_files(session_id)

    @app.get("/sessions/{session_id}/files/{name}", dependencies=[AppOnly], response_class=Response)
    def session_file(request: Request, session_id: str, name: str) -> Response:
        if "/" in name or name.startswith("."):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad file name")
        body = db(request).session_file(session_id, name)
        return Response(body, media_type="text/markdown; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{name}"'})

    return app
