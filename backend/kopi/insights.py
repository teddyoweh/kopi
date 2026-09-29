"""What a search card shows beyond the summary: eligibility at a glance, why it matched, and
what similar work sold for. Works over any Store, through `Store.tender`."""

from __future__ import annotations

import re
from collections.abc import Sequence

from kopi.models import (
    EligibilityCheck,
    EligibilityStatus,
    EligibilitySummary,
    MarketBand,
    MarketContext,
    Profile,
    TenderDetail,
    TenderInsight,
)
from kopi.store import NotFound, Store, tokens

SNIPPET_CHARS = 240
SENTENCES = re.compile(r"(?<=[.!?;])\s+|\n+")


def summarise_checks(checks: Sequence[EligibilityCheck]) -> EligibilitySummary:
    def first(status: EligibilityStatus) -> EligibilityCheck | None:
        return next((c for c in checks if c.status == status), None)

    count = {status: sum(1 for c in checks if c.status == status) for status in EligibilityStatus}
    return EligibilitySummary(
        met=count[EligibilityStatus.MET],
        unmet=count[EligibilityStatus.UNMET],
        unknown=count[EligibilityStatus.UNKNOWN],
        blocker=first(EligibilityStatus.UNMET),
        open_question=first(EligibilityStatus.UNKNOWN),
    )


def clip(text: str, limit: int = SNIPPET_CHARS) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0]
    return cut.rstrip(",;:") + "…"


def snippet(description: str, query: str | None) -> str | None:
    """The sentence sharing the most words with the query; the first sentence without one."""
    sentences = [s.strip() for s in SENTENCES.split(description or "") if len(s.strip()) > 3]
    if not sentences:
        return None
    wanted = set(tokens(query or ""))
    best = max(sentences, key=lambda s: len(wanted & set(tokens(s)))) if wanted else sentences[0]
    return clip(best)


def band(market: MarketContext | None) -> MarketBand | None:
    if market is None or market.similar_count == 0:
        return None
    return MarketBand(
        similar_count=market.similar_count,
        median_amount=market.median_amount,
        p25_amount=market.p25_amount,
        p75_amount=market.p75_amount,
    )


def insight(detail: TenderDetail, query: str | None) -> TenderInsight:
    notice = detail.notice
    return TenderInsight(
        doc_no=notice.doc_no,
        eligibility=summarise_checks(detail.eligibility),
        snippet=snippet(notice.description, query),
        items=len(notice.items),
        two_envelope=notice.two_envelope,
        procurement_method=notice.procurement_method or None,
        market=band(detail.market),
    )


def insights(store: Store, doc_nos: Sequence[str], profile: Profile, query: str | None) -> list[TenderInsight]:
    """One insight per known tender, in the order asked; unknown document numbers are skipped."""
    found = []
    for doc_no in dict.fromkeys(doc_nos):
        try:
            found.append(insight(store.tender(doc_no, profile), query))
        except NotFound:
            continue
    return found
