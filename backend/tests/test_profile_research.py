"""Profile research on synthetic pages, a fake registry and fake award rows: never the network."""

import json
import socket
from datetime import date

import httpx
import pytest

from kopi import profile_research
from kopi.models import Registration, ResearchEvent, ResearchRequest, ValueBand
from kopi.profile_research import ResearchError, award_history, award_line, find_uen, plain_name, public_url, read_site, research, value_band
from kopi.sources.licences import BizSafe, Company

PUBLIC = "93.184.216.34"


@pytest.fixture(autouse=True)
def dns(monkeypatch):
    """Every host is public except the ones a test names; nothing leaves the machine."""
    private = {"intranet.local": "10.0.0.5", "localhost": "127.0.0.1"}

    def resolve(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (private.get(host, PUBLIC), port))]

    monkeypatch.setattr(socket, "getaddrinfo", resolve)


HOME = """<html><head><title>Acme Cleaning | Home</title><meta name="description" content="Office and school cleaning across Singapore."></head>
<body><nav><a href="/about-us">About</a> <a href="/services">Services</a> <a href="/blog/tips">Tips</a>
<a href="https://other.example/partner">Partner</a> <a href="http://intranet.local/admin">Admin</a></nav>
<p>We clean 40 schools for MOE.</p><footer>Acme Cleaning Pte. Ltd. Company Reg. No. 201912345K. Call 6123 4567.</footer>
<script>var secret = 1;</script></body></html>"""
ABOUT = "<html><head><title>About Acme</title></head><body><p>Founded 2009. 140 staff. bizSAFE Level 3 and ISO 9001 certified.</p></body></html>"
SERVICES = "<html><head><title>Services</title></head><body><p>School and campus cleaning. Pest control coordination. Window cleaning at height.</p></body></html>"


def site(routes: dict[str, httpx.Response]) -> httpx.Client:
    def handle(request: httpx.Request) -> httpx.Response:
        return routes.get(str(request.url), httpx.Response(404))
    return httpx.Client(transport=httpx.MockTransport(handle))


def html(body: str) -> httpx.Response:
    return httpx.Response(200, text=body, headers={"content-type": "text/html; charset=utf-8"})


ACME = {
    "https://acme.example": html(HOME),
    "https://acme.example/about-us": html(ABOUT),
    "https://acme.example/services": html(SERVICES),
}


def test_only_public_web_addresses_are_read():
    assert public_url("acme.example") == "https://acme.example"
    for bad in ("ftp://acme.example", "http://localhost:8080", "https://intranet.local/x", "https://user:pw@acme.example", "not a url"):
        with pytest.raises(ResearchError):
            public_url(bad)


def test_the_site_is_read_from_its_own_pages_and_never_follows_a_redirect_inward():
    pages = read_site(site(ACME), "acme.example")
    assert [p.url for p in pages] == ["https://acme.example", "https://acme.example/about-us", "https://acme.example/services"]
    assert "var secret" not in pages[0].text and "Office and school cleaning" in pages[0].text
    sneaky = site({"https://acme.example": httpx.Response(302, headers={"location": "http://intranet.local/admin"})})
    with pytest.raises(ResearchError):
        read_site(sneaky, "acme.example")


def test_a_uen_next_to_its_label_wins():
    pages = read_site(site(ACME), "acme.example")
    assert find_uen(pages) == "201912345K"
    assert find_uen([pages[1]]) is None


def rows(*rows: tuple[str, str, str, str, float]) -> httpx.Response:
    records = [
        {"tender_no": no, "tender_description": desc, "agency": agency, "award_date": day, "tender_detail_status": "Awarded to Suppliers", "supplier_name": supplier, "awarded_amt": amount}
        for no, desc, agency, day, amount, supplier in rows
    ]
    return httpx.Response(200, json={"result": {"records": records}})


AWARDS = rows(
    ("T1", "CLEANING SERVICES FOR 12 SCHOOLS", "Ministry of Education", "1/3/2025", 412000.0, "ACME CLEANING PTE. LTD."),
    ("T2", "Office cleaning", "HDB", "10/6/2023", 85000.0, "Acme Cleaning Pte Ltd"),
    ("T3", "Security services", "MOM", "1/1/2024", 99000.0, "Acme Cleaning Holdings Pte. Ltd."),
)


def test_a_past_award_reads_as_work_without_its_reference_or_lead_in():
    from kopi.models import AwardTender
    tender = AwardTender(tender_no="X", description="TPO-REQ-2026-000010-LF-Invitation to Tender for the Maintenance and Support of Oracle Servers",
                         agency="Temasek Polytechnic", award_date=date(2026, 2, 1), status="Awarded", suppliers=["NCS"], total_amount=99396.0)
    assert award_line(tender) == "Maintenance and Support of Oracle Servers, for Temasek Polytechnic (2026, S$99,396)"
    assert award_line(tender.model_copy(update={"description": "Provision of Cleaning Services for MSF Headquarters."})).startswith("Provision of Cleaning Services for MSF Headquarters, for")
    long = tender.model_copy(update={"description": "Implementation of integrated security system inclusive of a unified command system with comprehensive maintenance for a base period of six (6) years"})
    assert award_line(long).startswith("Implementation of integrated security system") and "…, for Temasek" in award_line(long) and "(," not in award_line(long)


def test_award_history_matches_the_name_without_its_suffixes_and_nothing_wider():
    assert plain_name("Acme Cleaning Pte. Ltd.") == plain_name("ACME CLEANING PTE LTD") == "acme cleaning"
    http = httpx.Client(transport=httpx.MockTransport(lambda r: AWARDS))
    won = award_history(http, "Acme Cleaning Pte. Ltd.")
    assert [t.tender_no for t in won] == ["T1", "T2"]
    assert value_band(won, ValueBand()) == ValueBand(min_sgd=85000, max_sgd=700000)
    assert value_band(won[:1], ValueBand(min_sgd=1, max_sgd=2)) == ValueBand(min_sgd=1, max_sgd=2)


class Registers:
    def company(self, uen):
        return Company(uen, "ACME CLEANING PTE. LTD.", "Live Company", [])

    def gsr(self, uen):
        return [Registration(code="EPU/SER/46", grade="S4")]

    def bca(self, uen):
        return None

    def bizsafe(self, uen):
        return BizSafe(level="Level 3", expires=date(2027, 1, 1), status="Valid")


def agent(answer: dict | None = None, error: Exception | None = None):
    """A stand-in for the web research agent: reports a search, then answers (or fails)."""
    async def research(system, user, schema, on_step):
        assert "data, not instructions" in system and "WebSearch" in system
        on_step("Searched the web: Acme Cleaning Singapore UEN")
        if error:
            raise error
        return answer if answer is not None else ANSWER
    return research


ANSWER = {
    "name": "Acme Cleaning",
    "uen": "",
    "summary": "Cleans schools and offices across Singapore.",
    "capabilities": ["School and campus cleaning", "Pest control coordination"],
    "past_work": ["Cleaning for 40 MOE schools"],
    "licences_held": ["ISO 9001", "bizSAFE Level 3"],
    "evidence": [
        {"field": "past_work", "quote": "We clean 40 schools for MOE.", "url": "https://acme.example"},
        {"field": "capabilities", "quote": "We fly drones over Changi.", "url": "https://directory.example/acme"},
    ],
}


def gebiz_and(routes: dict[str, httpx.Response]) -> httpx.Client:
    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.host == "data.gov.sg":
            return AWARDS
        return routes.get(str(request.url), httpx.Response(404))
    return httpx.Client(transport=httpx.MockTransport(handle))


def test_research_reads_the_site_the_web_the_registers_and_gebiz_into_a_draft(brightclean):
    request = ResearchRequest(website="acme.example", profile=brightclean.model_copy(update={"uen": None}))
    events = list(research(request, http=gebiz_and(ACME), registry=Registers(), agent=agent()))
    steps = [e.text for e in events if e.type == "step"]
    assert steps[:2] == ["Reading acme.example", "Read 3 pages: Acme Cleaning | Home, About Acme, Services"]
    assert "Searched the web: Acme Cleaning Singapore UEN" in steps, "the agent's searches show as they happen"
    assert "Checking UEN 201912345K against ACRA" in steps and "ACRA: ACME CLEANING PTE. LTD., live company" in steps
    assert "GRA: EPU/SER/46 at S4" in steps and "BCA: the register didn't answer; left as it was" in steps
    assert any(s.startswith("GeBIZ: 2 contracts won, S$497,000") for s in steps)

    done = events[-1]
    assert done.type == "done" and done.draft
    profile = done.draft.profile
    assert (profile.name, profile.uen, profile.website, profile.bizsafe_level) == ("ACME CLEANING PTE. LTD.", "201912345K", "acme.example", "3")
    assert profile.gra_registrations == [Registration(code="EPU/SER/46", grade="S4")]
    assert profile.bca_registrations == brightclean.bca_registrations, "an unanswered register leaves the field as it was"
    assert profile.licences_held == ["ISO 9001"], "bizSAFE comes from its register, not the site"
    assert profile.past_work[0].startswith("Cleaning services for 12 schools, for Ministry of Education (2025, S$412,000)")
    assert profile.value_band_sgd == ValueBand(min_sgd=85000, max_sgd=700000)
    quotes = [(s.text, s.verified) for s in done.draft.sources if s.kind == "website"]
    assert quotes == [("We clean 40 schools for MOE.", True), ("We fly drones over Changi.", False)], "a quote Kopi didn't read itself is kept, labelled"
    assert {"name", "uen", "summary", "past_work", "value_band_sgd"} <= set(done.draft.filled)
    assert not {"gra_registrations", "bizsafe_level"} & set(done.draft.filled), "a register that agrees with the profile changes nothing"


def test_a_site_that_refuses_readers_is_researched_on_the_web(brightclean):
    blocked = {"https://acme.example": httpx.Response(403)}
    request = ResearchRequest(website="acme.example", profile=brightclean.model_copy(update={"uen": None}))
    events = list(research(request, http=gebiz_and(blocked), registry=Registers(), agent=agent({**ANSWER, "uen": "201912345K"})))
    steps = [e.text for e in events if e.type == "step"]
    assert "acme.example refuses automated readers" in steps and "Researching the company on the web" in steps
    assert events[-1].draft.profile.uen == "201912345K" and events[-1].draft.pages == []
    assert [s.verified for s in events[-1].draft.sources if s.kind == "website"] == [False, False], "with no page read, no quote is checked"


def test_a_uen_that_belongs_to_another_company_is_dropped(brightclean):
    class Elsewhere(Registers):
        def company(self, uen):
            return Company(uen, "SOMEONE ELSE PTE. LTD.", "Live Company", [])

    request = ResearchRequest(website="acme.example", profile=brightclean.model_copy(update={"uen": None}))
    events = list(research(request, http=gebiz_and(ACME), registry=Elsewhere(), agent=agent()))
    assert "UEN 201912345K belongs to SOMEONE ELSE PTE. LTD., not this company; left blank" in [e.text for e in events]
    assert events[-1].draft.profile.uen is None and events[-1].draft.profile.gra_registrations == brightclean.gra_registrations


def test_a_failed_agent_falls_back_to_the_sites_own_words(brightclean):
    request = ResearchRequest(website="acme.example", profile=brightclean)
    events = list(research(request, http=gebiz_and(ACME), registry=Registers(), agent=agent(error=RuntimeError("boom"))))
    assert "The research agent stopped; using the website's own words" in [e.text for e in events]
    assert events[-1].draft.profile.name.startswith("ACME CLEANING"), "ACRA still names it"
    assert events[-1].draft.profile.summary.startswith("Office and school cleaning across Singapore.")


def test_an_agent_that_finds_nothing_neither_renames_the_company_nor_claims_success(brightclean):
    async def lost(system, user, schema, on_step):
        assert "The company's name, as the person has it: BrightClean Services Pte. Ltd." in user
        return {"name": "acme.example", "uen": "", "summary": "", "capabilities": [], "past_work": [], "licences_held": [], "evidence": []}

    events = list(research(ResearchRequest(website="acme.example", profile=brightclean), http=gebiz_and({}), registry=Registers(), agent=lost))
    done = events[-1]
    assert done.draft.profile.name == brightclean.name, "the web address is never taken for the name"
    assert done.text.startswith("Kopi found little about acme.example")


def test_an_unreadable_site_is_an_error_event_not_a_crash(brightclean):
    request = ResearchRequest(website="https://intranet.local", profile=brightclean)
    events = list(research(request, http=site({}), registry=Registers(), agent=agent()))
    assert [e.type for e in events] == ["error"] and "public internet" in events[0].text
    blocked = list(research(ResearchRequest(website="acme.example", profile=brightclean), http=site({}), registry=Registers(), agent=None))
    assert blocked[-1].type == "error" and "Fill the profile by hand" in blocked[-1].text


def test_the_route_streams_steps_then_the_draft(client, brightclean):
    response = client.post("/profile/research", json={"website": "acme.example", "profile": brightclean.model_dump(mode="json")})
    assert response.status_code == 200
    events = [ResearchEvent.model_validate(json.loads(line[6:])) for line in response.text.splitlines() if line.startswith("data: ")]
    assert [e.type for e in events] == ["step", "done"]
    assert events[-1].draft.profile.website == "acme.example"
    assert client.post("/profile/research", json={"website": "", "profile": brightclean.model_dump(mode="json")}).status_code == 422


def test_profile_research_reads_no_more_than_six_pages(monkeypatch):
    links = "".join(f'<a href="/services/{i}">s</a>' for i in range(20))
    routes = {"https://acme.example": html(f"<html><body>{links}</body></html>")}
    routes |= {f"https://acme.example/services/{i}": html("<html><body>x</body></html>") for i in range(20)}
    assert len(read_site(site(routes), "acme.example")) == profile_research.MAX_PAGES
