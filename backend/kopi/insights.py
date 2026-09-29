"""What a search card shows beyond the summary: eligibility at a glance, why it matched, and
what similar work sold for. Works over any Store."""

from __future__ import annotations

import logging
import re
import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Sequence
from concurrent.futures import Future, ThreadPoolExecutor, wait
from dataclasses import dataclass

from kopi.models import (
    EligibilityCheck,
    EligibilityStatus,
    EligibilitySummary,
    MarketBand,
    MarketContext,
    Notice,
    Profile,
    TenderInsight,
)
from kopi.store import NotFound, Store, tokens

log = logging.getLogger(__name__)

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


@dataclass(frozen=True)
class _Entry:
    lookup: Future[MarketBand | None]
    expires: float


class MarketBands:
    """One store's market bands by document number.

    A band depends on the notice and not on the profile, so one lookup serves every profile
    until `ttl` runs out (the live store re-reads notices every five minutes). Lookups run on
    a shared pool, and a batch waits at most `wait` seconds for them: a NeedleDB call that
    hangs leaves its card without a band instead of holding up every card, and still fills
    the cache for the next request. Pending lookups are cached too, so a request never
    repeats one already in flight. A failed lookup is not kept, so it is retried next time.
    """

    def __init__(
        self,
        store: Store,
        workers: int = 8,
        size: int = 2048,
        ttl: float = 300,
        wait: float = 2,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.store = store
        self.size = size
        self.ttl = ttl
        self.wait = wait
        self.clock = clock
        self._pool = ThreadPoolExecutor(workers, thread_name_prefix="market-band")
        self._entries: OrderedDict[str, _Entry] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, notices: Sequence[Notice]) -> dict[str, MarketBand | None]:
        lookups = {notice.doc_no: self._lookup(notice) for notice in notices}
        wait(lookups.values(), timeout=self.wait)
        return {doc_no: self._result(doc_no, lookup) for doc_no, lookup in lookups.items()}

    def _lookup(self, notice: Notice) -> Future[MarketBand | None]:
        now = self.clock()
        with self._lock:
            entry = self._entries.get(notice.doc_no)
            if entry is None or entry.expires <= now or _failed(entry.lookup):
                entry = _Entry(self._pool.submit(self._band, notice), now + self.ttl)
                self._entries[notice.doc_no] = entry
            self._entries.move_to_end(notice.doc_no)
            while len(self._entries) > self.size:
                self._entries.popitem(last=False)
            return entry.lookup

    def _band(self, notice: Notice) -> MarketBand | None:
        return band(self.store.market_for(notice))

    def _result(self, doc_no: str, lookup: Future[MarketBand | None]) -> MarketBand | None:
        if not lookup.done():
            log.info("market band for %s not ready after %.1f s; the card goes without", doc_no, self.wait)
            return None
        if (error := lookup.exception()) is not None:
            log.warning("market band for %s failed: %r", doc_no, error)
            return None
        return lookup.result()


def _failed(lookup: Future) -> bool:
    return lookup.done() and lookup.exception() is not None


def insight(notice: Notice, checks: Sequence[EligibilityCheck], market: MarketBand | None, query: str | None) -> TenderInsight:
    return TenderInsight(
        doc_no=notice.doc_no,
        eligibility=summarise_checks(checks),
        snippet=snippet(notice.description, query),
        items=len(notice.items),
        two_envelope=notice.two_envelope,
        procurement_method=notice.procurement_method or None,
        market=market,
    )


def insights(store: Store, bands: MarketBands, doc_nos: Sequence[str], profile: Profile, query: str | None) -> list[TenderInsight]:
    """One insight per known tender, in the order asked; unknown document numbers are skipped."""
    assessed: list[tuple[Notice, list[EligibilityCheck]]] = []
    for doc_no in dict.fromkeys(doc_nos):
        try:
            assessed.append((store.notice(doc_no), store.eligibility(doc_no, profile)))
        except NotFound:
            continue
    markets = bands.get([notice for notice, _ in assessed])
    return [insight(notice, checks, markets[notice.doc_no], query) for notice, checks in assessed]
