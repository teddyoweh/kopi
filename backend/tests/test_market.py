from datetime import date

from kopi.market import market_context
from kopi.models import AwardTender


def tender(no: str, amount: float | None, suppliers: list[str], agency: str = "GovTech", status: str = "Awarded to Suppliers") -> AwardTender:
    return AwardTender(tender_no=no, description=f"tender {no}", agency=agency, award_date=date(2025, 3, 1),
                       status=status, suppliers=suppliers, total_amount=amount)


SIMILAR = [
    tender("T1", 100_000, ["ACME"]),
    tender("T2", 300_000, ["ACME", "BETA"]),
    tender("T3", 200_000, ["GAMMA"], agency="MOH"),
    tender("T4", None, [], status="Awarded to No Suppliers"),
    tender("T5", 400_000, ["ACME"], agency="MOH"),
]


def test_amounts_are_quartiles_of_awarded_tenders():
    context = market_context(SIMILAR)
    assert context.similar_count == 5
    assert context.median_amount == 250_000
    assert context.p25_amount == 175_000 and context.p75_amount == 325_000


def test_top_suppliers_and_incumbents():
    context = market_context(SIMILAR, agency="moh")
    assert [(w.supplier, w.wins) for w in context.top_suppliers][:2] == [("ACME", 3), ("BETA", 1)]
    assert {(w.supplier, w.wins) for w in context.agency_incumbents} == {("GAMMA", 1), ("ACME", 1)}


def test_no_award_share_and_examples_skip_unawarded():
    context = market_context(SIMILAR)
    assert context.no_award_share == 0.2
    assert [e.tender_no for e in context.examples] == ["T1", "T2", "T3"]
    assert context.examples[0].year == 2025


def test_empty_and_single():
    empty = market_context([])
    assert empty.similar_count == 0 and empty.median_amount is None and empty.no_award_share is None
    single = market_context([SIMILAR[0]])
    assert single.median_amount == single.p25_amount == single.p75_amount == 100_000
