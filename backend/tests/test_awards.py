import json
from datetime import date
from pathlib import Path

import httpx

from kopi.sources.awards import group_tenders, load_awards, parse_amount, parse_date, parse_row

SAMPLE = Path(__file__).parent / "data" / "awards" / "sample.json"


def sample_rows() -> list[dict]:
    return json.loads(SAMPLE.read_text())


def test_parse_values():
    assert parse_date("7/6/2021") == date(2021, 6, 7)
    assert parse_date("") is None and parse_date("31/2/2024") is None
    assert parse_amount("2321600") == 2_321_600.0
    assert parse_amount("na") is None and parse_amount(None) is None


def test_rows_group_by_tender():
    tenders = {t.tender_no: t for t in group_tenders([parse_row(r) for r in sample_rows()])}
    assert len(tenders) == 40 - 10 - 3 - 3
    materials = tenders["BCA000ETT21000010"]
    assert materials.total_amount == 600 + 1090 + 500 + 620
    assert len(materials.suppliers) == 4
    assert materials.agency == "Building and Construction Authority"


def test_nominal_panel_amounts_are_not_prices():
    tenders = {t.tender_no: t for t in group_tenders([parse_row(r) for r in sample_rows()])}
    panel = tenders["AGC000ETT23000001"]
    assert len(panel.suppliers) == 11
    assert panel.total_amount is None


def test_no_supplier_awards_keep_their_status_and_no_suppliers():
    tenders = {t.tender_no: t for t in group_tenders([parse_row(r) for r in sample_rows()])}
    none = tenders["AGC000ETT23000006"]
    assert none.status == "Awarded to No Suppliers"
    assert none.suppliers == [] and none.total_amount is None


class FakeDataGov(httpx.BaseTransport):
    def __init__(self, rows: list[dict]) -> None:
        self.rows, self.calls = rows, 0

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        offset, limit = int(request.url.params["offset"]), int(request.url.params["limit"])
        return httpx.Response(200, json={"result": {"records": self.rows[offset : offset + limit], "total": len(self.rows)}})


def test_download_pages_and_caches(tmp_path, monkeypatch):
    monkeypatch.setattr("kopi.sources.awards.PAGE", 15)
    transport = FakeDataGov(sample_rows())
    http = httpx.Client(transport=transport)
    cache = tmp_path / "awards.json"
    assert len(load_awards(cache, http=http)) == 40
    assert transport.calls == 3
    assert len(load_awards(cache, http=http)) == 40
    assert transport.calls == 3, "second load must come from the cache"
