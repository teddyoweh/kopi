"""What similar tenders were actually awarded for, and to whom.

Pure functions over AwardTenders. Finding the similar tenders is the caller's job
(NeedleDB in production, anything in tests), so this module never searches.
"""

from __future__ import annotations

from collections import Counter
from statistics import quantiles

from kopi.models import AwardExample, AwardTender, MarketContext, SupplierWins
from kopi.sources.awards import NO_SUPPLIER


def _percentiles(amounts: list[float]) -> tuple[float | None, float | None, float | None]:
    if not amounts:
        return None, None, None
    if len(amounts) == 1:
        return amounts[0], amounts[0], amounts[0]
    p25, p50, p75 = quantiles(amounts, n=4, method="inclusive")
    return p25, p50, p75


def _wins(tenders: list[AwardTender], limit: int) -> list[SupplierWins]:
    counts = Counter(supplier for tender in tenders for supplier in tender.suppliers)
    return [SupplierWins(supplier=name, wins=n) for name, n in counts.most_common(limit)]


def _example(tender: AwardTender) -> AwardExample:
    return AwardExample(
        tender_no=tender.tender_no,
        description=tender.description,
        agency=tender.agency,
        year=tender.award_date.year if tender.award_date else None,
        amount=tender.total_amount,
        suppliers=tender.suppliers,
    )


def market_context(similar: list[AwardTender], agency: str | None = None, examples: int = 3) -> MarketContext:
    """Summarise `similar`, which must be ordered closest first.

    Amounts are per tender (rows already summed). Tenders awarded to no supplier count
    towards the no-award share but not towards amounts or wins.
    """
    awarded = [t for t in similar if t.status != NO_SUPPLIER]
    p25, median, p75 = _percentiles(sorted(t.total_amount for t in awarded if t.total_amount))
    same_agency = [t for t in awarded if agency and t.agency.casefold() == agency.casefold()]
    return MarketContext(
        similar_count=len(similar),
        median_amount=median,
        p25_amount=p25,
        p75_amount=p75,
        top_suppliers=_wins(awarded, 5),
        agency_incumbents=_wins(same_agency, 3),
        no_award_share=round((len(similar) - len(awarded)) / len(similar), 3) if similar else None,
        examples=[_example(t) for t in awarded[:examples]],
    )
