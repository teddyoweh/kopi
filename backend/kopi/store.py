"""The Store protocol every API route reads through, and the fixture-backed implementation.

The API never knows where data lives. `FixtureStore` serves the synthetic fixtures so the
web app and the tests run with no network; the live store (NeedleDB, Claude, Modal
sandboxes) implements the same protocol.
"""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime
from functools import cached_property
from typing import Protocol

from kopi.checklist import submission_checklist
from kopi.config import FIXTURES_DIR
from kopi.market import market_context
from kopi.models import (
    Award,
    BidMemory,
    ChatEvent,
    ChatEventType,
    ChatRequest,
    ChecklistItem,
    EligibilityCheck,
    EligibilityStatus,
    Fit,
    Licence,
    MarketContext,
    MemoryNote,
    Notice,
    NoticeStatus,
    NoticeSummary,
    Overview,
    Profile,
    ProfileDraft,
    Reason,
    Recommendation,
    ResearchEvent,
    ResearchRequest,
    SearchHit,
    SearchResponse,
    SessionFile,
    TenderDetail,
)
from kopi.sources.awards import group_tenders

SIMILAR_AWARDS = 25  # a tender's market is its 25 nearest past awards


class NotFound(LookupError):
    """The requested tender, licence, session or file does not exist."""


class SearchFilters(Protocol):
    status: NoticeStatus | None
    agency: str | None
    category: str | None
    method: str | None
    closing_after: datetime | None
    closing_before: datetime | None


class Store(Protocol):
    def search(self, query: str, filters: SearchFilters, limit: int) -> SearchResponse: ...
    def list_tenders(self, filters: SearchFilters, limit: int, offset: int) -> list[NoticeSummary]: ...
    def notice(self, doc_no: str) -> Notice: ...
    def tender(self, doc_no: str, profile: Profile | None) -> TenderDetail: ...
    def market_for(self, notice: Notice) -> MarketContext: ...
    def eligibility(self, doc_no: str, profile: Profile) -> list[EligibilityCheck]: ...
    def overview(self, doc_no: str, profile: Profile) -> Overview: ...
    def checklist(self, doc_no: str, profile: Profile) -> list[ChecklistItem]: ...
    def similar_awards(self, query: str, agency: str | None, k: int) -> MarketContext: ...
    def licences(self, limit: int, offset: int) -> list[Licence]: ...
    def search_licences(self, query: str, limit: int) -> list[Licence]: ...
    def chat(self, request: ChatRequest, caller: str = "local") -> AsyncIterator[ChatEvent]: ...
    def session_files(self, session_id: str) -> list[SessionFile]: ...
    def session_file(self, session_id: str, name: str) -> bytes: ...
    def memory(self, session_id: str) -> BidMemory: ...
    def remember(self, session_id: str, text: str) -> BidMemory: ...
    def forget(self, session_id: str, note_id: str) -> BidMemory: ...
    def upload(self, session_id: str, name: str, body: bytes) -> SessionFile: ...
    def research_profile(self, request: ResearchRequest) -> Iterator[ResearchEvent]: ...


def tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def summarise(notice: Notice) -> NoticeSummary:
    return NoticeSummary(**notice.model_dump(include=set(NoticeSummary.model_fields)))


def matches(notice: Notice, filters: SearchFilters) -> bool:
    checks = [
        filters.status is None or notice.status == filters.status,
        filters.agency is None or filters.agency.lower() in notice.agency.lower(),
        filters.category is None or filters.category.lower() in notice.category.lower(),
        filters.method is None or filters.method.lower() in notice.procurement_method.lower(),
        filters.closing_after is None or notice.closing >= filters.closing_after,
        filters.closing_before is None or notice.closing <= filters.closing_before,
    ]
    return all(checks)


def overlap_score(query: list[str], text: str) -> float:
    if not query:
        return 0.0
    words = set(tokens(text))
    return sum(1 for term in query if term in words) / len(query)


class FixtureStore:
    """Serves backend/fixtures/. Search is word overlap; everything is deterministic."""

    def __init__(self, fixtures_dir=FIXTURES_DIR) -> None:
        self.dir = fixtures_dir
        self._files: dict[str, dict[str, bytes]] = {}
        self._uploads: dict[str, dict[str, bytes]] = {}
        self._memory: dict[str, BidMemory] = {}

    @cached_property
    def notices(self) -> dict[str, Notice]:
        raw = json.loads((self.dir / "notices.json").read_text())
        return {n["doc_no"]: Notice.model_validate(n) for n in raw}

    @cached_property
    def awards(self) -> list[Award]:
        rows = json.loads((self.dir / "awards.json").read_text())
        return [Award.model_validate(_award_row(r)) for r in rows]

    @cached_property
    def _licences(self) -> list[Licence]:
        return [Licence.model_validate(x) for x in json.loads((self.dir / "licences.json").read_text())]

    def notice(self, doc_no: str) -> Notice:
        try:
            return self.notices[doc_no]
        except KeyError:
            raise NotFound(f"no tender {doc_no}") from None

    def search(self, query: str, filters: SearchFilters, limit: int) -> SearchResponse:
        terms = tokens(query)
        scored = []
        for notice in self.notices.values():
            if not matches(notice, filters):
                continue
            text = f"{notice.title} {notice.title} {notice.agency} {notice.category} {notice.description}"
            score = overlap_score(terms, text)
            if score > 0 or not terms:
                scored.append(SearchHit(notice=summarise(notice), score=round(score, 3)))
        scored.sort(key=lambda hit: (-hit.score, hit.notice.closing))
        return SearchResponse(query=query, total=len(scored), hits=scored[:limit])

    def list_tenders(self, filters: SearchFilters, limit: int, offset: int) -> list[NoticeSummary]:
        found = [summarise(n) for n in self.notices.values() if matches(n, filters)]
        found.sort(key=lambda s: s.published, reverse=True)
        return found[offset : offset + limit]

    def tender(self, doc_no: str, profile: Profile | None) -> TenderDetail:
        notice = self.notice(doc_no)
        checks = self.eligibility(doc_no, profile) if profile else []
        return TenderDetail(notice=notice, eligibility=checks, market=self.market_for(notice))

    def market_for(self, notice: Notice) -> MarketContext:
        return self.similar_awards(notice.title, notice.agency, SIMILAR_AWARDS)

    def eligibility(self, doc_no: str, profile: Profile) -> list[EligibilityCheck]:
        notice = self.notice(doc_no)
        open_ = notice.closing > datetime.now(UTC)
        checks = [
            EligibilityCheck(
                kind="closing",
                requirement=f"Closes {notice.closing:%d %b %Y %H:%M}",
                status=EligibilityStatus.MET if open_ else EligibilityStatus.UNMET,
                reason="Still open" if open_ else "Closing date has passed",
            )
        ]
        held = {r.code for r in profile.gra_registrations or []}
        for head in notice.gra_heads:
            if profile.gra_registrations is None:
                status, reason = EligibilityStatus.UNKNOWN, "Profile does not list GRA registrations"
            elif head.code in held:
                status, reason = EligibilityStatus.MET, f"Registered under {head.code}"
            else:
                status, reason = EligibilityStatus.UNMET, f"Not registered under {head.code}"
            checks.append(EligibilityCheck(kind="gra", requirement=f"{head.code} {head.grade or ''}".strip(), status=status, reason=reason))
        return checks

    def checklist(self, doc_no: str, profile: Profile) -> list[ChecklistItem]:
        return submission_checklist(self.notice(doc_no), self.eligibility(doc_no, profile))

    def overview(self, doc_no: str, profile: Profile) -> Overview:
        notice = self.notice(doc_no)
        first_sentence = notice.description.split(". ")[0].rstrip(".")
        score = int(100 * overlap_score(tokens(" ".join(profile.capabilities)), notice.description + notice.title))
        return Overview(
            doc_no=doc_no,
            profile_id=profile.id,
            summary=f"{notice.agency} is buying: {notice.title}.",
            buying=first_sentence + ".",
            who_can_bid=", ".join(f"{h.code} {h.grade or ''}".strip() for h in notice.gra_heads) or "Any registered GeBIZ trading partner",
            fit=Fit(
                score=min(score, 100),
                recommendation=Recommendation.MAYBE,
                reasons=[Reason(point="What the notice asks for", quote=first_sentence, verified=True, found_in="notice")],
            ),
            questions_for_agency=["Is there an incumbent vendor, and when does their contract end?"],
            model="fixture",
            generated_at=datetime.now(UTC),
        )

    def similar_awards(self, query: str, agency: str | None, k: int) -> MarketContext:
        """Word-overlap ranking over the fixture awards, then the same market maths as live."""
        terms = tokens(query)
        scored = [(overlap_score(terms, t.description), t) for t in group_tenders(self.awards)]
        ranked = [t for score, t in sorted(scored, key=lambda pair: -pair[0]) if score > 0][:k]
        return market_context(ranked, agency)

    def licences(self, limit: int, offset: int) -> list[Licence]:
        return self._licences[offset : offset + limit]

    def search_licences(self, query: str, limit: int) -> list[Licence]:
        terms = tokens(query)
        ranked = sorted(self._licences, key=lambda x: -overlap_score(terms, f"{x.name} {x.description} {x.who_needs_it}"))
        return [x for x in ranked if overlap_score(terms, f"{x.name} {x.description} {x.who_needs_it}") > 0][:limit]

    async def chat(self, request: ChatRequest, caller: str = "local") -> AsyncIterator[ChatEvent]:
        """A scripted conversation, so the copilot UI can be built without Claude or Modal."""
        session = request.session_id or "fixture-session"
        results = self.search(request.message, _NoFilters(), 3)
        yield ChatEvent(type=ChatEventType.TOOL_CALL, tool="search_tenders", input={"query": request.message}, session_id=session)
        yield ChatEvent(type=ChatEventType.TOOL_RESULT, tool="search_tenders", summary=f"{results.total} tenders found", session_id=session)
        titles = "; ".join(h.notice.title for h in results.hits) or "nothing matching"
        yield ChatEvent(type=ChatEventType.TEXT, text=f"Closest open tenders: {titles}.", session_id=session)
        name = "clarification-questions.md"
        body = f"# Clarification questions\n\n1. Is there an incumbent vendor for: {titles}?\n"
        self._files.setdefault(session, {})[name] = body.encode()
        yield ChatEvent(type=ChatEventType.FILE, file=name, session_id=session)
        yield ChatEvent(type=ChatEventType.DONE, session_id=session, cost_usd=0.0)

    def session_files(self, session_id: str) -> list[SessionFile]:
        now = datetime.now(UTC)
        drafts = [
            SessionFile(name=name, title=body.decode().splitlines()[0].lstrip("# "), size=len(body), modified=now)
            for name, body in self._files.get(session_id, {}).items()
        ]
        uploads = [
            SessionFile(name=name, title=name, size=len(body), modified=now, kind="upload")
            for name, body in self._uploads.get(session_id, {}).items()
        ]
        return drafts + uploads

    def session_file(self, session_id: str, name: str) -> bytes:
        for shelf in (self._files, self._uploads):
            if name in shelf.get(session_id, {}):
                return shelf[session_id][name]
        raise NotFound(f"no file {name} in session {session_id}")

    def memory(self, session_id: str) -> BidMemory:
        return self._memory.get(session_id, BidMemory())

    def remember(self, session_id: str, text: str) -> BidMemory:
        now = datetime.now(UTC)
        note = MemoryNote(id=uuid.uuid4().hex[:12], text=text, source="you", created=now)
        memory = self.memory(session_id)
        self._memory[session_id] = memory.model_copy(update={"notes": [*memory.notes, note], "updated": now})
        return self._memory[session_id]

    def forget(self, session_id: str, note_id: str) -> BidMemory:
        memory = self.memory(session_id)
        kept = [n for n in memory.notes if n.id != note_id]
        if len(kept) == len(memory.notes):
            raise NotFound(f"no note {note_id} in session {session_id}")
        self._memory[session_id] = memory.model_copy(update={"notes": kept, "updated": datetime.now(UTC)})
        return self._memory[session_id]

    def upload(self, session_id: str, name: str, body: bytes) -> SessionFile:
        self._uploads.setdefault(session_id, {})[name] = body
        return SessionFile(name=name, title=name, size=len(body), modified=datetime.now(UTC), kind="upload")

    def research_profile(self, request: ResearchRequest) -> Iterator[ResearchEvent]:
        """Fixtures never touch the network: the draft keeps the profile and records the website."""
        yield ResearchEvent(type="step", text="Fixture mode reads no websites, registers or awards")
        draft = ProfileDraft(profile=request.profile.model_copy(update={"website": request.website}), filled=["website"], sources=[], pages=[], awards=0)
        yield ResearchEvent(type="done", text="Recorded the website. The live service fills the rest.", draft=draft)

class _NoFilters:
    status = NoticeStatus.OPEN
    agency = category = method = closing_after = closing_before = None


def _award_row(row: dict) -> dict:
    """data.gov.sg rows carry d/m/yyyy dates and amounts as strings."""
    day, month, year = (int(x) for x in row["award_date"].split("/")) if row.get("award_date") else (None,) * 3
    amount = row.get("awarded_amt")
    return {
        **row,
        "award_date": f"{year:04d}-{month:02d}-{day:02d}" if year else None,
        "awarded_amt": float(amount) if amount not in (None, "", "na") else None,
    }
