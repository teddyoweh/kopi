import re
from datetime import datetime
from pathlib import Path

import httpx
import pytest

from kopi.sources import gebiz
from kopi.sources.gebiz import GebizClient, fetch_open, parse_detail, parse_listing, parse_partial

DATA = Path(__file__).parent / "data" / "gebiz"
EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PHONE = re.compile(r"(?<!\d)(?:\+?65\s?)?[3689]\d{3}\s?\d{4}(?!\d)")


def read(name: str) -> str:
    return (DATA / name).read_text()


def test_listing_cards():
    cards = parse_listing(read("listing_page1.html"))
    assert [c.doc_no for c in cards] == ["MOESCHETQ26990001", "TSTAGY0ETT26990002"]
    first = cards[0]
    assert first.type == "Quotation"
    assert first.title == "Supply of Instructors for Robotics CCA 2027"
    assert first.agency == "Ministry of Education - Schools"
    assert first.closing == datetime.fromisoformat("2026-10-08T13:00:00+08:00")
    assert first.published == datetime.fromisoformat("2026-09-29T16:20:00+08:00")
    assert first.category == "Administration & Training ⇒ Courses"


def test_reference_number_after_doc_no():
    page, state = parse_partial(read("listing_page2.xml"))
    assert state == "state-2"
    assert [c.doc_no for c in parse_listing(page)] == ["TSTSCH0ETT26990003"]


def test_next_page_request_carries_form_state_and_ajax_fields():
    request = dict(gebiz.next_page_request(read("listing_page1.html")))
    assert request["javax.faces.ViewState"] == "state-1"
    assert request["javax.faces.source"] == "contentForm:j_idt828:j_idt879_Next_2"
    assert request["javax.faces.partial.execute"] == "contentForm:j_idt828"
    assert request["javax.faces.partial.render"] == "contentForm:j_idt828:j_idt879 contentForm dialogForm"
    assert request["contentForm:j_idt800_select"] == "10"
    assert gebiz.next_page_request(parse_partial(read("listing_page2.xml"))[0]) is None


def test_detail_fields():
    notice = parse_detail(read("detail.html"))
    assert notice.doc_no == "TSTAGY0ETT26990002"
    assert notice.title == "Design and Build of a Case Management System"
    assert notice.description.startswith("To design, build and maintain")
    assert notice.agency == "Example Statutory Board"
    assert notice.two_envelope is True and notice.wto_gpa is True
    assert notice.procurement_method == "Open Tender"
    assert notice.procurement_nature == "Period Contract"
    assert notice.closing == datetime.fromisoformat("2026-10-23T16:00:00+08:00")
    assert notice.published == datetime.fromisoformat("2026-09-28T10:05:00+08:00")
    assert notice.items == ["Section A1 System design and build", "Section A2 Maintenance for 24 months"]
    assert notice.url.endswith("docCode=TSTAGY0ETT26990002")


def test_gra_and_bca_heads_parse_capacity_and_grade():
    notice = parse_detail(read("detail.html"))
    assert [(h.code, h.capacity_sgd, h.grade) for h in notice.gra_heads] == [("EPU/CMP/10", 3_000_000, "S6")]
    assert notice.gra_heads[0].label == "Computer Related Hardware, Software, and Services"
    assert [(w.code, w.grade) for w in notice.bca_workheads] == [("CW01", "C1")]


def test_no_contact_detail_survives():
    notice = parse_detail(read("detail.html"))
    text = notice.model_dump_json()
    assert not EMAIL.search(text)
    assert not PHONE.search(text)
    for name in ("JANE EXAMPLE", "JOHN SAMPLE"):
        assert name not in text


CLOSING = {
    "MOESCHETQ26990001": ("08 Oct 2026", "01:00PM"),
    "TSTAGY0ETT26990002": ("23 Oct 2026", "04:00PM"),
    "TSTSCH0ETT26990003": ("20 Oct 2026", "04:00PM"),
}


class FakeGebiz(httpx.BaseTransport):
    """Serves the synthetic pages: listing, one partial-ajax page, and a detail per doc."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(f"{request.method} {request.url.path}")
        if request.method == "POST":
            assert request.headers["Faces-Request"] == "partial/ajax"
            return httpx.Response(200, text=read("listing_page2.xml"))
        if request.url.path.endswith("BOListing.xhtml"):
            return httpx.Response(200, text=read("listing_page1.html"))
        doc = request.url.params["docCode"]
        closing_date, closing_time = CLOSING[doc]
        body = (
            read("detail.html")
            .replace("TSTAGY0ETT26990002", doc)
            .replace("<div>23 Oct 2026</div><div>04:00PM</div>", f"<div>{closing_date}</div><div>{closing_time}</div>")
        )
        return httpx.Response(200, text=body)


@pytest.fixture
def client(tmp_path) -> tuple[GebizClient, FakeGebiz]:
    transport = FakeGebiz()
    http = httpx.Client(transport=transport, base_url="https://www.gebiz.gov.sg")
    return GebizClient(cache_dir=tmp_path / "cache", delay=0, http=http), transport


def test_fetch_pages_through_every_card_and_writes_json(client, tmp_path):
    gebiz_client, transport = client
    notices = fetch_open(out_dir=tmp_path / "notices", client=gebiz_client)
    assert [n.doc_no for n in notices] == ["MOESCHETQ26990001", "TSTAGY0ETT26990002", "TSTSCH0ETT26990003"]
    assert len(list((tmp_path / "notices").glob("*.json"))) == 3
    assert sum(call.startswith("POST") for call in transport.calls) == 1


def test_fetch_is_incremental(client, tmp_path):
    gebiz_client, transport = client
    fetch_open(out_dir=tmp_path / "notices", client=gebiz_client)
    details_before = sum("directlink" in call for call in transport.calls)
    fetch_open(out_dir=tmp_path / "notices", client=gebiz_client)
    assert sum("directlink" in call for call in transport.calls) == details_before


def test_limit_stops_early(client, tmp_path):
    gebiz_client, transport = client
    assert len(fetch_open(limit=1, out_dir=tmp_path / "notices", client=gebiz_client)) == 1
    assert not any(call.startswith("POST") for call in transport.calls)
