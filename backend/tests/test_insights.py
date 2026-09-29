"""Search insights: the snippet and eligibility summary, and market bands that are looked up in
parallel, cached per tender, and never fail the batch. No network: fixture stores and fakes."""

import threading
import time
from collections import Counter

import numpy as np
import pytest

from kopi.api.live import LiveStore
from kopi.embed import notice_text
from kopi.index import AWARDS, DIMENSION, NOTICES, award_metadata
from kopi.insights import MarketBands, band, clip, insights, snippet, summarise_checks
from kopi.models import EligibilityCheck, EligibilityStatus, MarketContext, Notice
from kopi.sources.awards import group_tenders
from kopi.store import FixtureStore

FIRST, SECOND, THIRD = "NLB000ETQ26000089", "GVT000ETT26000101", "MOESCHETQ26004355"


class Lookups(FixtureStore):
    """Fixture data, with market lookups counted and, on request, failed or held back."""

    def __init__(self) -> None:
        super().__init__()
        self.count: Counter[str] = Counter()
        self.broken: set[str] = set()
        self.held: dict[str, threading.Event] = {}
        self.delay = 0.0

    def market_for(self, notice: Notice) -> MarketContext:
        self.count[notice.doc_no] += 1
        if notice.doc_no in self.held:
            self.held[notice.doc_no].wait(5)
        time.sleep(self.delay)
        if notice.doc_no in self.broken:
            raise ConnectionError("NeedleDB is unreachable")
        return super().market_for(notice)


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def lookups() -> Lookups:
    return Lookups()


def check(kind: str, status: EligibilityStatus) -> EligibilityCheck:
    return EligibilityCheck(kind=kind, requirement=kind, status=status, reason=kind)


# ---------------------------------------------------------------- the card's text


DESCRIPTION = (
    "The agency invites quotations for office cleaning. "
    "The vendor shall build a chatbot that answers citizen enquiries in four languages. "
    "Delivery is within 30 days."
)


def test_the_snippet_is_the_sentence_sharing_most_words_with_the_query():
    assert snippet(DESCRIPTION, "citizen chatbot languages") == "The vendor shall build a chatbot that answers citizen enquiries in four languages."


def test_the_snippet_falls_back_to_the_first_sentence():
    first = "The agency invites quotations for office cleaning."
    assert snippet(DESCRIPTION, None) == first
    assert snippet(DESCRIPTION, "submarine") == first
    assert snippet("", "cleaning") is None


def test_clip_cuts_at_a_word_boundary_within_240_characters():
    clipped = clip(" ".join(["procurement"] * 40))
    assert len(clipped) <= 240 and clipped.endswith("…")
    assert set(clipped.removesuffix("…").split()) == {"procurement"}, "no word is cut in half"
    assert clip(("maintenance, " * 30).strip()).endswith("maintenance…"), "a dangling comma is dropped"
    assert clip("  two\n\n words ") == "two words"


def test_the_summary_names_the_first_blocker_and_the_first_open_question():
    checks = [
        check("closing", EligibilityStatus.MET),
        check("bca", EligibilityStatus.UNKNOWN),
        check("gra", EligibilityStatus.UNMET),
        check("licence", EligibilityStatus.UNMET),
        check("company", EligibilityStatus.UNKNOWN),
    ]
    summary = summarise_checks(checks)
    assert (summary.met, summary.unmet, summary.unknown) == (1, 2, 2)
    assert summary.blocker.kind == "gra" and summary.open_question.kind == "bca"
    clear = summarise_checks(checks[:1])
    assert clear.blocker is None and clear.open_question is None


# ---------------------------------------------------------------- the batch


def test_unknown_tenders_are_skipped_and_the_asked_order_is_kept(lookups, pragnition):
    found = insights(lookups, MarketBands(lookups), [THIRD, "NOPE", FIRST, THIRD, SECOND], pragnition, "chatbot")
    assert [x.doc_no for x in found] == [THIRD, FIRST, SECOND]
    assert all(x.market is not None for x in found)


def test_a_failing_market_lookup_leaves_only_that_card_without_a_band(lookups, pragnition):
    lookups.broken = {SECOND}
    first, second = insights(lookups, MarketBands(lookups), [FIRST, SECOND], pragnition, None)
    assert first.market is not None
    assert second.market is None
    assert second.eligibility.met + second.eligibility.unmet + second.eligibility.unknown > 0, "the rest of the card is intact"


def test_a_batch_of_25_looks_its_bands_up_in_parallel(lookups, pragnition):
    docs = list(lookups.notices)[:25]
    lookups.delay = 0.05
    started = time.perf_counter()
    found = insights(lookups, MarketBands(lookups), docs, pragnition, "cleaning services")
    assert [x.doc_no for x in found] == docs
    assert all(x.market is not None for x in found)
    assert time.perf_counter() - started < 0.6, "25 lookups of 50 ms each ran in series"


# ---------------------------------------------------------------- the band cache


def test_bands_are_cached_across_calls_and_profiles(lookups, pragnition, brightclean):
    bands = MarketBands(lookups)
    once = insights(lookups, bands, [FIRST, SECOND], pragnition, None)
    again = insights(lookups, bands, [SECOND, FIRST], brightclean, None)
    assert lookups.count == {FIRST: 1, SECOND: 1}
    assert {x.doc_no: x.market for x in once} == {x.doc_no: x.market for x in again}


def test_a_band_is_looked_up_again_once_it_expires(lookups):
    clock = Clock()
    bands = MarketBands(lookups, ttl=300, clock=clock)
    notice = lookups.notice(FIRST)
    bands.get([notice])
    clock.now = 299
    bands.get([notice])
    assert lookups.count[FIRST] == 1
    clock.now = 301
    bands.get([notice])
    assert lookups.count[FIRST] == 2


def test_the_cache_keeps_the_most_recently_used_bands(lookups):
    bands = MarketBands(lookups, size=2)
    first, second, third = (lookups.notice(d) for d in (FIRST, SECOND, THIRD))
    bands.get([first, second])
    bands.get([first])
    bands.get([third])
    bands.get([first, second])
    assert lookups.count == {FIRST: 1, SECOND: 2, THIRD: 1}


def test_a_failed_lookup_is_retried_on_the_next_call(lookups):
    bands = MarketBands(lookups)
    notice = lookups.notice(FIRST)
    lookups.broken = {FIRST}
    assert bands.get([notice]) == {FIRST: None}
    lookups.broken = set()
    assert bands.get([notice])[FIRST] is not None
    assert lookups.count[FIRST] == 2


def test_a_slow_lookup_is_left_behind_and_fills_the_cache(lookups):
    lookups.held = {SECOND: threading.Event()}
    bands = MarketBands(lookups, wait=0.5)
    first, second = lookups.notice(FIRST), lookups.notice(SECOND)
    started = time.perf_counter()
    found = bands.get([first, second])
    assert time.perf_counter() - started < 2, "the batch did not wait out the held lookup"
    assert found[FIRST] is not None and found[SECOND] is None
    lookups.held[SECOND].set()
    bands.wait = 5
    assert bands.get([second])[SECOND] is not None
    assert lookups.count[SECOND] == 1, "the lookup already in flight was reused, not repeated"


# ---------------------------------------------------------------- the live store's market


class FakeIndex:
    def __init__(self, records: dict[str, dict] | None = None, matches: list[dict] | None = None) -> None:
        self.records = records or {}
        self.matches = matches or []
        self.queried: list[list[float]] = []

    def get(self, id: str) -> dict | None:
        return self.records.get(id)

    def query(self, vector, top_k, filter=None, include_metadata=False) -> dict:
        self.queried.append(vector)
        return {"matches": self.matches[:top_k]}


class FakeNeedle:
    def __init__(self, indexes: dict[str, FakeIndex]) -> None:
        self.indexes = indexes

    def Index(self, name: str) -> FakeIndex:
        return self.indexes[name]


def unit(i: int) -> np.ndarray:
    return np.eye(DIMENSION, dtype=np.float32)[i]


@pytest.fixture
def live(tmp_path) -> tuple[LiveStore, FakeNeedle, list[str]]:
    """A live store over the fixture notices, where only FIRST is in the notices index."""
    fixtures = FixtureStore()
    (tmp_path / "notices").mkdir()
    for notice in fixtures.notices.values():
        (tmp_path / "notices" / f"{notice.doc_no}.json").write_text(notice.model_dump_json())
    awards = [{"id": t.tender_no, "score": 0.9, "metadata": award_metadata(t, t.description)} for t in group_tenders(fixtures.awards)]
    db = FakeNeedle({
        NOTICES: FakeIndex(records={FIRST: {"id": FIRST, "values": unit(0).tolist()}}),
        AWARDS: FakeIndex(matches=awards),
    })
    embedded: list[str] = []

    def embed_document(text: str) -> np.ndarray:
        embedded.append(text)
        return unit(1)

    return LiveStore(db, embed_query=None, embed_document=embed_document, data_dir=tmp_path), db, embedded


def test_the_live_market_starts_from_the_notices_stored_vector(live):
    store, db, embedded = live
    market = store.market_for(store.notice(FIRST))
    assert embedded == [], "a notice in the index is not embedded again"
    assert db.indexes[AWARDS].queried == [unit(0).tolist()]
    assert market.similar_count == 25


def test_a_notice_missing_from_the_index_is_embedded_from_its_ingest_text(live):
    store, db, embedded = live
    notice = store.notice(SECOND)
    store.market_for(notice)
    assert embedded == [notice_text(notice)]
    assert db.indexes[AWARDS].queried == [unit(1).tolist()]


def test_the_card_band_is_the_detail_pages_band(live, pragnition):
    store, _, embedded = live
    (card,) = insights(store, MarketBands(store), [FIRST], pragnition, None)
    assert card.market is not None
    assert card.market == band(store.tender(FIRST, pragnition).market)
    assert embedded == []
