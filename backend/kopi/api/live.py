"""The live Store: NeedleDB for search, the Volume for full notices and licences, rules for eligibility.

NeedleDB holds vectors and the fields search filters on. The full notice (description,
GRA heads, items) and the licence catalogue live as JSON on the Modal Volume, which
ingest keeps current; this store re-reads them at most every `refresh_seconds`.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime
from functools import partial
from pathlib import Path
from typing import Any

import anyio
import numpy as np

from kopi import eligibility, market
from kopi.bundle import read_bundle
from kopi.checklist import submission_checklist
from kopi.config import DATA_DIR
from kopi.index import AWARDS, LICENCES, NOTICES, notice_filter, query
from kopi.models import (
    ChatEvent,
    ChatRequest,
    ChecklistItem,
    EligibilityCheck,
    Fit,
    Licence,
    MarketContext,
    Notice,
    NoticeStatus,
    NoticeSummary,
    Overview,
    Profile,
    Reason,
    Recommendation,
    SearchHit,
    SearchResponse,
    SessionFile,
    TenderDetail,
)
from kopi.overview import generate_overview
from kopi.sandbox import Copilot, CopilotUnavailable
from kopi.search import (
    BM25,
    DENSE_DEPTH,
    as_doc_no,
    award_from,
    distinct_awards,
    rerank,
)
from kopi.store import NotFound, SearchFilters, matches, summarise

log = logging.getLogger(__name__)
log.setLevel(logging.INFO)

EmbedOne = Callable[[str], np.ndarray]


class LiveStore:
    def __init__(
        self,
        db,
        embed_query: EmbedOne,
        embed_document: EmbedOne,
        data_dir: Path = DATA_DIR,
        reload: Callable[[], None] | None = None,
        registry: eligibility.Registry | None = None,
        refresh_seconds: float = 300,
        copilot: Copilot | None = None,
        claude: bool = False,
        overview_cache: Path | None = None,
    ) -> None:
        self.db = db
        self.embed_query = embed_query
        self.embed_document = embed_document
        self.data_dir = data_dir
        self.reload = reload
        self.registry = registry
        self.refresh_seconds = refresh_seconds
        self.copilot = copilot
        self.claude = claude
        self.overview_cache = overview_cache
        self._loaded_at = 0.0
        self.notices: dict[str, Notice] = {}
        self.catalogue: list[Licence] = []
        self._bm25 = BM25({})
        self._lock = threading.Lock()

    # ------------------------------------------------------------ data on the Volume

    def _fresh(self) -> None:
        if time.monotonic() - self._loaded_at < self.refresh_seconds and self.notices:
            return
        with self._lock:  # one reload at a time: a reload while another thread reads fails
            if time.monotonic() - self._loaded_at < self.refresh_seconds and self.notices:
                return
            self._load()

    def _load(self) -> None:
        started = time.perf_counter()
        if self.reload:
            try:
                self.reload()
            except Exception as error:  # a failed reload leaves yesterday's data, never an outage
                log.warning("volume reload failed: %s", error)
        self.notices = self._read_notices()
        self.catalogue = self._read_catalogue()
        self._bm25 = BM25({doc: f"{n.title} {n.agency} {n.category}" for doc, n in self.notices.items()})
        self._loaded_at = time.monotonic()
        log.info("loaded %d notices and %d licences in %.0f ms", len(self.notices), len(self.catalogue), (time.perf_counter() - started) * 1000)

    def _read_notices(self) -> dict[str, Notice]:
        folder = self.data_dir / "notices"
        listing = folder / "_open.json"
        open_now = set(json.loads(listing.read_text())) if listing.exists() else None
        now = datetime.now(UTC)
        found = read_bundle(folder) or {
            p.stem: Notice.model_validate_json(p.read_text()) for p in folder.glob("*.json") if not p.name.startswith("_")
        }
        notices = {}
        for notice in found.values():
            left_listing = open_now is not None and notice.doc_no not in open_now
            if notice.status == NoticeStatus.OPEN and (left_listing or notice.closing <= now):
                notice = notice.model_copy(update={"status": NoticeStatus.CLOSED})
            notices[notice.doc_no] = notice
        return notices

    def _read_catalogue(self) -> list[Licence]:
        path = self.data_dir / "licences" / "gobusiness.json"
        return [Licence.model_validate(x) for x in json.loads(path.read_text())] if path.exists() else []

    def _notice(self, doc_no: str) -> Notice:
        self._fresh()
        try:
            return self.notices[doc_no]
        except KeyError:
            raise NotFound(f"no tender {doc_no}") from None

    # ------------------------------------------------------------ search

    def search(self, query_text: str, filters: SearchFilters, limit: int) -> SearchResponse:
        self._fresh()
        exact = as_doc_no(query_text)
        if exact and exact in self.notices:
            return SearchResponse(query=query_text, total=1, hits=[SearchHit(notice=summarise(self.notices[exact]), score=1.0, highlights=[exact])])
        started = time.perf_counter()
        vector = self.embed_query(query_text)
        embedded = time.perf_counter()
        found = query(self.db.Index(NOTICES), vector, top_k=DENSE_DEPTH, filter=needle_filter(filters))
        log.info("search %r: embed %.0f ms, needledb %.0f ms", query_text, (embedded - started) * 1000, (time.perf_counter() - embedded) * 1000)
        # NeedleDB's status is as fresh as the last ingest; the Volume's notice is fresher.
        found = [m for m in found if m.id in self.notices and matches(self.notices[m.id], filters)]
        ranked = rerank(query_text, found, self._bm25, lambda m: m.metadata.get("title", ""))
        hits = [SearchHit(notice=summarise(self.notices[r.match.id]), score=round(r.score, 4), highlights=r.highlights) for r in ranked[:limit]]
        return SearchResponse(query=query_text, total=len(ranked), hits=hits)

    def list_tenders(self, filters: SearchFilters, limit: int, offset: int) -> list[NoticeSummary]:
        self._fresh()
        found = [summarise(n) for n in self.notices.values() if matches(n, filters)]
        found.sort(key=lambda s: s.published, reverse=True)
        return found[offset : offset + limit]

    # ------------------------------------------------------------ one tender

    def tender(self, doc_no: str, profile: Profile | None) -> TenderDetail:
        notice = self._notice(doc_no)
        checks = self.eligibility(doc_no, profile) if profile else []
        text = f"{notice.title}\n{notice.agency}\n{notice.description}"
        return TenderDetail(notice=notice, eligibility=checks, market=self._market(self.embed_document(text), notice.agency, 25))

    def eligibility(self, doc_no: str, profile: Profile) -> list[EligibilityCheck]:
        notice = self._notice(doc_no)
        return eligibility.check(notice, profile, registry=self.registry, catalogue=self.catalogue)

    def checklist(self, doc_no: str, profile: Profile) -> list[ChecklistItem]:
        return submission_checklist(self._notice(doc_no), self.eligibility(doc_no, profile))

    def overview(self, doc_no: str, profile: Profile) -> Overview:
        """Claude's verified triage brief, or the notice's own words when Claude is unavailable."""
        notice = self._notice(doc_no)
        if not self.claude:
            return extractive_overview(notice, profile)
        checks = self.eligibility(doc_no, profile)
        market = self._market(self.embed_document(f"{notice.title}\n{notice.agency}\n{notice.description}"), notice.agency, 25)
        brief = partial(generate_overview, notice, profile, checks, market, cache_dir=self.overview_cache)
        try:
            return run_async(brief)
        except Exception as error:  # the page still gets the notice's own words, and the log says why
            log.warning("overview for %s fell back to extractive: %s", doc_no, error)
            return extractive_overview(notice, profile)

    # ------------------------------------------------------------ awards and licences

    def similar_awards(self, query_text: str, agency: str | None, k: int) -> MarketContext:
        return self._market(self.embed_query(query_text), agency, k)

    def _market(self, vector: np.ndarray, agency: str | None, k: int) -> MarketContext:
        """Stats over every similar award; examples with repeated descriptions collapsed."""
        found = query(self.db.Index(AWARDS), vector, top_k=k)
        context = market.market_context([award_from(m) for m in found], agency)
        examples = market.market_context(distinct_awards(found), agency).examples
        return context.model_copy(update={"examples": examples})

    def licences(self, limit: int, offset: int) -> list[Licence]:
        self._fresh()
        return self.catalogue[offset : offset + limit]

    def search_licences(self, query_text: str, limit: int) -> list[Licence]:
        self._fresh()
        by_id = {lic.id: lic for lic in self.catalogue}
        found = query(self.db.Index(LICENCES), self.embed_query(query_text), top_k=limit)
        return [by_id[m.id] for m in found if m.id in by_id]

    # ------------------------------------------------------------ copilot (KP-11/KP-12)

    async def chat(self, request: ChatRequest, caller: str = "local") -> AsyncIterator[ChatEvent]:
        """One copilot turn. The sandbox API is blocking, so each event is pulled on a worker thread."""
        if self.copilot is None:
            raise CopilotUnavailable("the copilot is not configured on this deployment")
        events = self.copilot.turn(request, caller)
        while (event := await anyio.to_thread.run_sync(next, events, None)) is not None:
            yield event

    def session_files(self, session_id: str) -> list[SessionFile]:
        if self.copilot is None:
            return []
        return self.copilot.files(session_id)

    def session_file(self, session_id: str, name: str) -> bytes:
        if self.copilot is None:
            raise NotFound(f"no file {name} in session {session_id}")
        return self.copilot.file(session_id, name)


def extractive_overview(notice: Notice, profile: Profile) -> Overview:
    """The notice's own words, no model; shown when Claude is not configured or fails."""
    first = notice.description.split(". ")[0].rstrip(".") or notice.title
    return Overview(
        doc_no=notice.doc_no,
        profile_id=profile.id,
        summary=f"{notice.agency}: {notice.title}.",
        buying=f"{first}.",
        who_can_bid=", ".join(f"{h.code} {h.grade or ''}".strip() for h in notice.gra_heads) or "Any GeBIZ trading partner",
        fit=Fit(score=0, recommendation=Recommendation.MAYBE, reasons=[Reason(point="What the notice asks for", quote=first, verified=True, found_in="notice")]),
        model="extractive",
        generated_at=datetime.now(UTC),
    )


def run_async(fn: Callable[[], Any]) -> Any:
    """Run a coroutine function from sync code: via the event loop's portal inside a request, else a fresh loop."""
    try:
        return anyio.from_thread.run(fn)
    except RuntimeError:  # not in an anyio worker thread (tests, scripts)
        return anyio.run(fn)


def needle_filter(filters: SearchFilters) -> dict | None:
    """API filters → NeedleDB filter. Text fields match exactly; a category without '⇒' is a group."""
    category = filters.category
    base = notice_filter(
        status=filters.status,
        agency=filters.agency,
        category_group=category if category and "⇒" not in category else None,
        method=filters.method,
        closing_after=filters.closing_after,
        closing_before=filters.closing_before,
    ) or {}
    if category and "⇒" in category:
        base["category"] = category
    return base or None


def from_environment(reload: Callable[[], None] | None = None, copilot: Copilot | None = None) -> LiveStore:
    """The store the deployed API uses: NeedleDB from NEEDLEDB_URL/NEEDLEDB_API_KEY, Qwen3 on CPU."""
    import os
    from functools import lru_cache

    import httpx
    import torch
    from needledb import NeedleDB

    from kopi.embed import Embedder
    from kopi.sources.licences import BROWSER_UA, LiveRegistry

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    threads = int(os.environ.get("KOPI_TORCH_THREADS", "0"))
    if threads:
        torch.set_num_threads(threads)
    embedder = Embedder(device=os.environ.get("KOPI_EMBED_DEVICE"))

    @lru_cache(maxsize=512)
    def embed_query(text: str) -> np.ndarray:
        return embedder.embed_query(text)

    http = httpx.Client(headers={"User-Agent": BROWSER_UA}, follow_redirects=True, timeout=20)
    return LiveStore(
        db=NeedleDB(os.environ["NEEDLEDB_URL"], api_key=os.environ["NEEDLEDB_API_KEY"], timeout=20),
        embed_query=embed_query,
        embed_document=lambda text: embedder.embed_documents([text])[0],
        reload=reload,
        # Local disk, not the Volume: an open file on the Volume blocks `reload()`.
        registry=LiveRegistry(http, cache_dir=Path("/tmp/kopi-registers")),
        copilot=copilot,
        claude=bool(os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY")),
        overview_cache=Path("/tmp/kopi-overviews"),
    )
