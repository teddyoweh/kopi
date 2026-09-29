"""The Store protocol every API route reads through, and the fixture-backed implementation.

The API never knows where data lives. `FixtureStore` serves the synthetic fixtures so the
web app and the tests run with no network; the live store (NeedleDB, Claude, Modal
sandboxes) implements the same protocol.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from functools import cached_property
from statistics import median
from typing import Protocol

from kopi.checklist import submission_checklist
from kopi.config import FIXTURES_DIR
from kopi.models import (
    Award,
    AwardExample,
    ChatEvent,
    ChatEventType,
    ChatRequest,
    ChecklistItem,
    EligibilityCheck,
    EligibilityStatus,
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
    SupplierWins,
    TenderDetail,
)


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
    def tender(self, doc_no: str, profile: Profile | None) -> TenderDetail: ...
    def eligibility(self, doc_no: str, profile: Profile) -> list[EligibilityCheck]: ...
    def overview(self, doc_no: str, profile: Profile) -> Overview: ...
    def checklist(self, doc_no: str, profile: Profile) -> list[ChecklistItem]: ...
    def similar_awards(self, query: str, agency: str | None, k: int) -> MarketContext: ...
    def licences(self, limit: int, offset: int) -> list[Licence]: ...
    def search_licences(self, query: str, limit: int) -> list[Licence]: ...
    def chat(self, request: ChatRequest, caller: str = "local") -> AsyncIterator[ChatEvent]: ...
    def session_files(self, session_id: str) -> list[SessionFile]: ...
    def session_file(self, session_id: str, name: str) -> bytes: ...


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

    def _notice(self, doc_no: str) -> Notice:
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
        notice = self._notice(doc_no)
        checks = self.eligibility(doc_no, profile) if profile else []
        return TenderDetail(notice=notice, eligibility=checks, market=self.similar_awards(notice.title, notice.agency, 25))

    def eligibility(self, doc_no: str, profile: Profile) -> list[EligibilityCheck]:
        notice = self._notice(doc_no)
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
        return submission_checklist(self._notice(doc_no), self.eligibility(doc_no, profile))

    def overview(self, doc_no: str, profile: Profile) -> Overview:
        notice = self._notice(doc_no)
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
                reasons=[Reason(point="What the notice asks for", quote=first_sentence, verified=True)],
            ),
            questions_for_agency=["Is there an incumbent vendor, and when does their contract end?"],
            model="fixture",
            generated_at=datetime.now(UTC),
        )

    def similar_awards(self, query: str, agency: str | None, k: int) -> MarketContext:
        terms = tokens(query)
        ranked = sorted(self.awards, key=lambda a: -overlap_score(terms, a.tender_description))[:k]
        ranked = [a for a in ranked if overlap_score(terms, a.tender_description) > 0]
        amounts = sorted(a.awarded_amt for a in ranked if a.awarded_amt)
        wins = Counter(a.supplier_name for a in ranked if a.supplier_name)
        incumbents = Counter(a.supplier_name for a in ranked if agency and a.agency == agency and a.supplier_name)
        return MarketContext(
            similar_count=len({a.tender_no for a in ranked}),
            median_amount=median(amounts) if amounts else None,
            p25_amount=amounts[len(amounts) // 4] if amounts else None,
            p75_amount=amounts[(3 * len(amounts)) // 4] if amounts else None,
            top_suppliers=[SupplierWins(supplier=s, wins=n) for s, n in wins.most_common(5)],
            agency_incumbents=[SupplierWins(supplier=s, wins=n) for s, n in incumbents.most_common(3)],
            no_award_share=None,
            examples=[
                AwardExample(
                    tender_no=a.tender_no,
                    description=a.tender_description,
                    agency=a.agency,
                    year=a.award_date.year if a.award_date else None,
                    amount=a.awarded_amt,
                    suppliers=[a.supplier_name],
                )
                for a in ranked[:3]
            ],
        )

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
        files = self._files.get(session_id, {})
        now = datetime.now(UTC)
        return [
            SessionFile(name=name, title=body.decode().splitlines()[0].lstrip("# "), size=len(body), modified=now)
            for name, body in files.items()
        ]

    def session_file(self, session_id: str, name: str) -> bytes:
        try:
            return self._files[session_id][name]
        except KeyError:
            raise NotFound(f"no file {name} in session {session_id}") from None


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
