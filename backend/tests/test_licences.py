import io
import json
import math
import zipfile
from datetime import date

import httpx
import pytest

from kopi.models import Registration
from kopi.sources import licences as lic
from kopi.sources.licences import (
    LiveRegistry,
    bca,
    bizsafe_rank,
    excel_date,
    gsr,
    licence_from_record,
    licence_record,
    licence_rules,
    normalise_bca_grade,
    normalise_gsr_grade,
    parse_bca_company,
    parse_bizsafe,
    parse_supply_heads,
    search_form,
    ssic_title,
    xlsx_rows,
)

# ---------------------------------------------------------------- reference tables


def test_gsr_table():
    table = gsr()
    assert len(table.heads) == 45
    assert list(table.capacity) == [f"S{n}" for n in range(2, 11)]
    assert table.capacity["S3"] == 250_000 and math.isinf(table.capacity["S10"])
    assert table.grade_for(250_000) == "S3"
    assert table.grade_for(260_000) == "S4"
    assert table.grade_for(None) is None
    assert table.rank("S10 >$30,000,000 (EPU S10)") > table.rank("EPU S3")
    assert table.heads["EPU/SER/43"].licence_note  # security services need a licence
    assert table.heads["EPU/CMP/10"].licence_note is None


def test_gsr_grade_normalisation():
    assert normalise_gsr_grade("EPU S3") == "S3"
    assert normalise_gsr_grade("S10 >$30,000,000 (EPU S10)") == "S10"
    assert normalise_gsr_grade("") is None
    assert normalise_gsr_grade("grade unknown") is None


def test_bca_limits_are_the_june_2026_figures():
    table = bca()
    assert table.limit("CW01", "A2") == 105_000_000  # third-party summaries still say 90m
    assert table.limit("CW02", "B1") == 50_000_000  # and 40m here
    assert math.isinf(table.limit("CW01", "A1"))
    assert table.limit("ME04", "L5") == 16_000_000
    assert math.isinf(table.limit("CR01", "single grade"))
    assert table.limit("FM01", "M2") == 30_000_000
    assert table.limit("FM03", "L1") == 800_000
    assert table.limit("SY01A", "L4") == 8_000_000
    assert table.group("TR01") is None and table.group("RW01") is None
    assert table.limit("CW01", None) is None
    assert len(table.titles) == 70


def test_bca_grade_normalisation():
    assert normalise_bca_grade("single%20grade") == "Single Grade"
    assert normalise_bca_grade(" l4 ") == "L4"


def test_ssic_titles_prefer_2025_and_fall_back_to_2020():
    assert ssic_title("62011") == "Development of software and applications (except games and cybersecurity)"
    raw = json.loads((lic.REFERENCE_DIR / "ssic.json").read_text())
    only_2020 = next(code for code in raw["ssic2020"] if code not in raw["ssic2025"])
    assert ssic_title(only_2020) == raw["ssic2020"][only_2020]
    assert ssic_title("00000") is None
    assert ssic_title(None) is None


def test_licence_rules_are_well_formed():
    rules = licence_rules()
    assert len(rules) == 15
    assert all(r.url.startswith("https://") for r in rules)
    assert {r.certainty for r in rules} == {"required", "check"}
    cleaning = next(r for r in rules if r.id == "nea-cleaning")
    assert cleaning.url.endswith("nea/cleaning-business-licence")
    assert cleaning.triggered_by("", "Services", {"EPU/SER/46"}) == "GRA supply head EPU/SER/46"
    assert cleaning.triggered_by("", "Facilities Management ⇒ Cleaning Services", set()).startswith("category")
    assert cleaning.triggered_by("daily office cleaning of the premises", "Services", set()) == "the words 'office cleaning'"
    assert cleaning.triggered_by("supply of laptops", "IT", set()) is None


def test_bizsafe_rank():
    assert bizsafe_rank("Level Star") > bizsafe_rank("Level 4") > bizsafe_rank("3")
    assert bizsafe_rank("Partner") is None
    assert bizsafe_rank(None) is None


# ---------------------------------------------------------------- GoBusiness RSC payloads


def rsc(*rows: str) -> str:
    return "\n".join(rows) + "\n"


def text_row(row_id: str, text: str) -> str:
    return f"{row_id}:T{len(text.encode()):x},{text}"


def test_licence_record_resolves_references():
    fee = "<p>$130 before 1 April 2026<br>$180 from 1 April 2026</p>"
    record = {
        "licence": {
            "display_name": "Cleaning Business Licence",
            "agency_in_charge": 34,
            "short_description": "Businesses offering general cleaning services need a licence.",
            "fee_details": "$a",
            "estimated_processing_time": "within 14 working days",
            "licence_validity": "<p>2 Years</p>",
            "additional_eligibility_requirements": "<p>Related licences to apply at External Agency<br>ACRA - Registration for Companies</p>",
            "long_description": "$undefined",
            "documents": "$b",
        }
    }
    body = rsc('0:["$","div",null,{}]', text_row("a", fee), 'b:[{"title":"Checklist"}]', f"c:{json.dumps(record)}")
    found = licence_record(body)
    assert found["fee_details"] == fee
    assert found["documents"] == [{"title": "Checklist"}]
    assert found["long_description"] is None
    licence = licence_from_record(found, {"34": "National Environment Agency (NEA)"}, "https://licensing.gobusiness.gov.sg/licence-directory/nea/cleaning-business-licence")
    assert licence.id == "nea/cleaning-business-licence"
    assert licence.agency == "National Environment Agency (NEA)"
    assert licence.fee.splitlines() == ["$130 before 1 April 2026", "$180 from 1 April 2026"]
    assert licence.validity == "2 Years"
    assert licence.prerequisites == ["ACRA - Registration for Companies"]


def test_licence_record_absent():
    assert licence_record(rsc('0:["$","div",null,{}]')) is None


def test_fetch_gobusiness_skips_pages_without_a_licence(tmp_path, monkeypatch):
    monkeypatch.setattr(lic.time, "sleep", lambda _: None)
    record = {"licence": {"display_name": "Food Shop Licence", "agency_in_charge": 39, "estimated_processing_time": "7 working days"}}
    base = "https://licensing.gobusiness.gov.sg/licence-directory"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("0.xml"):
            locs = "".join(f"<url><loc>{base}/{slug}</loc></url>" for slug in ("sfa/food-shop-licence", "sfa/gone"))
            return httpx.Response(200, text=f"<urlset>{locs}</urlset>")
        assert request.headers["RSC"] == "1"
        if request.url.path.endswith("gone"):
            return httpx.Response(200, text=rsc('0:["$","div",null,{}]'))
        return httpx.Response(200, text=rsc(f"1:{json.dumps(record)}"))

    out = tmp_path / "licences.json"
    found = lic.fetch_gobusiness(httpx.Client(transport=httpx.MockTransport(handler)), out=out, delay=0)
    assert [x.id for x in found] == ["sfa/food-shop-licence"]
    assert found[0].agency == "Singapore Food Agency (SFA)"
    assert [x.name for x in lic.load_licences(out)] == ["Food Shop Licence"]
    assert lic.load_licences(tmp_path / "missing.json") == []


# ---------------------------------------------------------------- XLSX and bizSAFE


def make_xlsx(rows: list[list[str]], sheet: str = "Data") -> bytes:
    strings: list[str] = []

    def ref(value: str) -> int:
        if value not in strings:
            strings.append(value)
        return strings.index(value)

    cells = "".join(
        f'<row r="{r + 1}">'
        + "".join(f'<c r="{chr(65 + c)}{r + 1}" t="s"><v>{ref(v)}</v></c>' for c, v in enumerate(row) if v != "")
        + "</row>"
        for r, row in enumerate(rows)
    )
    main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as book:
        book.writestr("xl/workbook.xml", f'<workbook xmlns="{main}" xmlns:r="{rel}"><sheets><sheet name="Cover" r:id="rId1"/><sheet name="{sheet}" r:id="rId2"/></sheets></workbook>')
        book.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
        )
        book.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="{main}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>cover</t></is></c></row></sheetData></worksheet>')
        book.writestr("xl/worksheets/sheet2.xml", f'<worksheet xmlns="{main}"><sheetData>{cells}</sheetData></worksheet>')
        book.writestr("xl/sharedStrings.xml", f'<sst xmlns="{main}">' + "".join(f"<si><t>{s}</t></si>" for s in strings) + "</sst>")
    return buffer.getvalue()


BIZSAFE_ROWS = [
    ["UEN", "COMPANY_NAME", "EXPIRY", "STATUS", "LEVEL"],
    ["200000001A", "EXAMPLE CLEANING PTE. LTD.", "2025-01-01", "Expired", "Level 4"],
    ["200000001A", "EXAMPLE CLEANING PTE. LTD.", "2027-06-30", "Approved", "Level 3"],
    ["200000002B", "EXAMPLE BUILD PTE. LTD.", "46000", "Approved", "Level Star"],
    ["", "NO UEN", "2027-01-01", "Approved", "Level 1"],
]


def test_xlsx_rows_reads_the_named_sheet():
    rows = xlsx_rows(make_xlsx([["a", "", "c"]]), sheet="Data")
    assert rows == [["a", "", "c"]]
    assert xlsx_rows(make_xlsx([["a"]]))[0] == ["cover"]


def test_parse_bizsafe_prefers_current_approved_records():
    register = parse_bizsafe(make_xlsx(BIZSAFE_ROWS))
    assert set(register) == {"200000001A", "200000002B"}
    assert register["200000001A"].level == "Level 3" and register["200000001A"].status == "Approved"
    assert register["200000002B"].expires == date(2025, 12, 9)


def test_excel_date():
    assert excel_date("2027-06-30T00:00:00") == date(2027, 6, 30)
    assert excel_date("45658") == date(2025, 1, 1)
    assert excel_date("") is None
    assert excel_date("soon") is None


# ---------------------------------------------------------------- directory pages (synthetic markup)


SUPDIR_FORM = """<html><body><form id="contentForm" name="contentForm" method="post">
<input type="hidden" name="contentForm" value="contentForm" />
<input type="submit" name="contentForm:j_id39" value="For Companies" />
<input type="text" name="contentForm:j_idt264_listButton2_HIDDEN-INPUT" value="" />
<input type="submit" name="contentForm:j_idt264_listButton2_HIDDEN-INPUT_inputButton" value="" />
<input type="text" name="contentForm:j_idt179" value="" />
<input type="submit" name="contentForm:j_idt179_inputButton" value="" />
<input type="submit" name="contentForm:search" value="Search" />
<input type="hidden" name="javax.faces.ViewState" value="vs-1" />
</form></body></html>"""

SUPDIR_RESULTS = '<a href="/ptn/supplier/directory/searchDetail.xhtml?code=abc123" class="commandLink_TITLE-BLUE"><span>EXAMPLE PTE. LTD.</span></a>'

SUPDIR_DETAIL = "<html><body>" + "".join(
    f"<div>{x}</div>"
    for x in [
        "EXAMPLE PTE. LTD.", "Trading Partner Ref. No. 200000001A", "SUPPLY HEADS", "S/N", "Supply Head", "Financial Grade", "Expiry Date", "Status",
        "1.", "EPU/CMP/10 - Computer Related Hardware, Software, and Services", "S4 $500,000 (EPU S4)", "06 May 2027", "APPROVED",
        "2.", "EPU/SER/46 - Service (Cleaning)", "S2 $100,000 (EPU S2)", "01 Jan 2027", "PENDING",
    ]
) + "</body></html>"

BCA_DETAIL = "<html><body>" + "".join(
    f"<div>{x}</div>"
    for x in [
        "Company Information", "EXAMPLE BUILD PTE. LTD.", "UEN:", "200000002B", "Registered Contractors", "Workhead", "Description", "Grade", "Expiry Date",
        "CW01", "General Building", "General Building", "B2", "01/04/2029",
        "ME05", "Electrical Engineering", "Electrical Engineering", "L3", "01/07/2027",
        "CR99", "Not a row", "no grade here",
    ]
) + "</body></html>"


def test_search_form_fills_the_free_text_field():
    fields = dict(search_form(SUPDIR_FORM, "200000001A"))
    assert fields["contentForm:j_idt179"] == "200000001A"
    assert fields["contentForm:search"] == "Search"
    assert fields["javax.faces.ViewState"] == "vs-1"
    assert "contentForm:j_idt264_listButton2_HIDDEN-INPUT" not in fields
    with pytest.raises(ValueError):
        search_form("<form id=\"contentForm\"></form>", "x")


def test_parse_supply_heads_keeps_approved_rows_only():
    assert parse_supply_heads(SUPDIR_DETAIL) == [Registration(code="EPU/CMP/10", grade="S4", expires=date(2027, 5, 6))]
    assert parse_supply_heads("<div>nothing</div>") == []


def test_parse_bca_company():
    assert parse_bca_company(BCA_DETAIL) == [
        Registration(code="CW01", grade="B2", expires=date(2029, 4, 1)),
        Registration(code="ME05", grade="L3", expires=date(2027, 7, 1)),
    ]


# ---------------------------------------------------------------- LiveRegistry against a fake web


class FakeRegisters:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.fail = False

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(f"{request.method} {request.url.host}{request.url.path}")
        if self.fail:
            return httpx.Response(503)
        path = request.url.path
        if path.endswith("directory/index.xhtml"):
            if request.method == "POST":
                assert b"200000001A" in request.content
                return httpx.Response(200, text=SUPDIR_RESULTS)
            return httpx.Response(200, text=SUPDIR_FORM)
        if path.endswith("searchDetail.xhtml"):
            return httpx.Response(200, text=SUPDIR_DETAIL)
        if path.endswith("CompanyDetails"):
            return httpx.Response(200, text=BCA_DETAIL)
        if path.endswith("bizsafe-e-services"):
            return httpx.Response(200, text='<a href="/-/media/files/bizsafe-self-help_20260923.xlsx">Download</a>')
        if path.endswith(".xlsx"):
            return httpx.Response(200, content=make_xlsx(BIZSAFE_ROWS))
        if path.endswith("datastore_search"):
            resource = request.url.params["resource_id"]
            if resource == "d_3f960c10fed6145404ca7b821f263b87":
                record = {"uen": "200000001A", "entity_name": "EXAMPLE PTE. LTD.", "uen_status_desc": "Registered"}
            else:
                assert resource == "d_8575e84912df3c28995b8e6e0e05205a" or resource.startswith("d_")
                record = {"entity_status_description": "Live Company", "primary_ssic_code": "62011", "secondary_ssic_code": "na"}
            return httpx.Response(200, json={"result": {"records": [record]}})
        return httpx.Response(404)


@pytest.fixture
def web():
    return FakeRegisters()


@pytest.fixture
def registry(web, tmp_path):
    return LiveRegistry(httpx.Client(transport=httpx.MockTransport(web)), cache_dir=tmp_path)


def test_gsr_lookup_walks_the_jsf_session(registry, web):
    assert registry.gsr("200000001A") == [Registration(code="EPU/CMP/10", grade="S4", expires=date(2027, 5, 6))]
    assert [c.split(" ")[0] for c in web.calls] == ["GET", "POST", "GET"]


def test_lookups_are_cached(registry, web):
    registry.gsr("200000001A")
    calls = len(web.calls)
    assert registry.gsr("200000001A")[0].code == "EPU/CMP/10"
    assert len(web.calls) == calls


def test_bca_lookup(registry):
    assert [(r.code, r.grade) for r in registry.bca("200000002B")] == [("CW01", "B2"), ("ME05", "L3")]


def test_company_lookup_maps_ssic_codes(registry):
    company = registry.company("200000001A")
    assert company.name == "EXAMPLE PTE. LTD."
    assert company.live is True
    assert company.activities == [("62011", "Development of software and applications (except games and cybersecurity)")]


def test_bizsafe_lookup_downloads_the_current_export(registry, web):
    assert registry.bizsafe("200000002b").level == "Level Star"
    assert registry.bizsafe("200000009Z") is lic.NOT_LISTED
    assert sum(".xlsx" in c for c in web.calls) == 1


def test_unreachable_bizsafe_register_answers_none(registry, web):
    web.fail = True
    assert registry.bizsafe("200000001A") is None


def test_failed_lookups_answer_none(registry, web):
    web.fail = True
    assert registry.gsr("200000001A") is None
    assert registry.bca("200000002B") is None
    assert registry.company("200000001A") is None


def test_company_status_words():
    assert lic.Company("1", "A", "Struck Off").live is False
    assert lic.Company("1", "A", "Live Company").live is True
    assert lic.Company("1", "A", "In Liquidation - Members' Voluntary").live is None
