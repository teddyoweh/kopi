"""Past GeBIZ awards from data.gov.sg ("Government Procurement via GeBIZ", Singapore Open Data Licence).

One tender can appear on several rows, one per supplier or per item, so the rows are
grouped by tender number before anything is counted.
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import defaultdict
from datetime import date
from pathlib import Path

import httpx

from kopi.config import DATA_DIR
from kopi.models import Award, AwardTender

log = logging.getLogger(__name__)

RESOURCE_ID = "d_acde1106003906a75c3fa052592f2fcb"
API = "https://data.gov.sg/api/action/datastore_search"
PAGE = 5000
CACHE = DATA_DIR / "cache" / "awards.json"
NO_SUPPLIER = "Awarded to No Suppliers"
# Panel and period contracts record a nominal $0 or $1 per supplier; that is not a price.
NOMINAL_AMOUNT = 1.0
PLACEHOLDER_SUPPLIERS = {"", "na", "unknown"}


def parse_date(text: str | None) -> date | None:
    if not text:
        return None
    try:
        day, month, year = (int(part) for part in text.split("/"))
        return date(year, month, day)
    except ValueError:
        return None


def parse_amount(value: str | float | None) -> float | None:
    if value in (None, "", "na", "NA"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_row(row: dict) -> Award:
    return Award(
        tender_no=row["tender_no"].strip(),
        tender_description=" ".join(row.get("tender_description", "").split()),
        agency=row.get("agency", "").strip(),
        award_date=parse_date(row.get("award_date")),
        tender_detail_status=row.get("tender_detail_status", "").strip(),
        supplier_name=(row.get("supplier_name") or "").strip(),
        awarded_amt=parse_amount(row.get("awarded_amt")),
    )


def group_tenders(awards: list[Award]) -> list[AwardTender]:
    """One AwardTender per tender number: real amounts summed, suppliers in first-seen order.

    A tender whose rows are all nominal ($0/$1 panel placeholders) gets `total_amount=None`.
    """
    rows: dict[str, list[Award]] = defaultdict(list)
    for award in awards:
        rows[award.tender_no].append(award)
    tenders = []
    for tender_no, group in rows.items():
        first = group[0]
        amounts = [a.awarded_amt for a in group if a.awarded_amt is not None and a.awarded_amt > NOMINAL_AMOUNT]
        suppliers = list(dict.fromkeys(a.supplier_name for a in group if a.supplier_name.casefold() not in PLACEHOLDER_SUPPLIERS))
        tenders.append(
            AwardTender(
                tender_no=tender_no,
                description=first.tender_description,
                agency=first.agency,
                award_date=max((a.award_date for a in group if a.award_date), default=None),
                status=first.tender_detail_status,
                suppliers=suppliers,
                total_amount=sum(amounts) if amounts else None,
            )
        )
    return tenders


def download(http: httpx.Client | None = None) -> list[dict]:
    """Every row of the dataset, paged at 5,000."""
    http = http or httpx.Client(timeout=60)
    rows: list[dict] = []
    offset = 0
    while True:
        response = http.get(API, params={"resource_id": RESOURCE_ID, "limit": PAGE, "offset": offset})
        response.raise_for_status()
        result = response.json()["result"]
        rows.extend(result["records"])
        offset += PAGE
        if offset >= result["total"]:
            return rows


def load_awards(cache: Path = CACHE, refresh: bool = False, http: httpx.Client | None = None) -> list[Award]:
    """Awards from the local cache, downloading once when it is missing or `refresh` is set."""
    if refresh or not cache.exists():
        rows = download(http)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(rows))
        log.info("cached %d award rows at %s", len(rows), cache)
    return [parse_row(row) for row in json.loads(cache.read_text())]


def main() -> None:
    parser = argparse.ArgumentParser(description="Download and summarise GeBIZ awards from data.gov.sg.")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    awards = load_awards(refresh=args.refresh)
    tenders = group_tenders(awards)
    years = sorted({a.award_date.year for a in awards if a.award_date})
    print(json.dumps({"rows": len(awards), "tenders": len(tenders), "years": [years[0], years[-1]] if years else []}))


if __name__ == "__main__":
    main()
