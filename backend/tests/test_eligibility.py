from datetime import UTC, date, datetime, timedelta

import pytest

from kopi.eligibility import bizsafe_label, check, facts_for, holds, implied_licences
from kopi.models import BcaWorkhead, EligibilityStatus, GraHead, Licence, Notice, Profile, Registration
from kopi.sources.licences import GSR_DIRECTORY, NOT_IN_ACRA, NOT_LISTED, BizSafe, Company

NOW = datetime(2026, 9, 29, 12, 0, tzinfo=UTC)
MET, UNMET, UNKNOWN = EligibilityStatus.MET, EligibilityStatus.UNMET, EligibilityStatus.UNKNOWN


def notice(**changes) -> Notice:
    base = dict(
        doc_no="TST000ETQ26000001",
        type="Quotation",
        title="Supply of stationery",
        description="Supply of office stationery for 12 months.",
        agency="Example Agency",
        published=NOW - timedelta(days=2),
        closing=NOW + timedelta(days=9, hours=2),
        category="Administration & Training ⇒ Stationery",
        url="https://www.gebiz.gov.sg/ptn/opportunity/directlink.xhtml?docCode=TST000ETQ26000001",
        source="fixture",
    )
    return Notice(**(base | changes))


def profile(**changes) -> Profile:
    return Profile(**(dict(id="p", name="Example Pte Ltd", summary="A test company.") | changes))


def only(checks, kind):
    found = [c for c in checks if c.kind == kind]
    assert len(found) == 1, found
    return found[0]


CMP_S3 = GraHead(code="EPU/CMP/10", label="Computer Related Hardware, Software, and Services", capacity_sgd=250_000, grade="S3")


# ---------------------------------------------------------------- closing


def test_open_notice_counts_days_left():
    first = check(notice(), profile(), now=NOW)[0]
    assert (first.kind, first.status, first.reason) == ("closing", MET, "Open; closes in 9 days")


def test_closing_today_and_closed():
    assert check(notice(closing=NOW + timedelta(hours=3)), profile(), now=NOW)[0].reason == "Open; closes today"
    assert check(notice(closing=NOW + timedelta(days=1, hours=1)), profile(), now=NOW)[0].reason == "Open; closes tomorrow"


def test_closing_days_are_singapore_calendar_days():
    # 19:37 SGT on 29 Sep; a tender closing 13:00 SGT on 30 Sep is 17 hours away but closes *tomorrow*.
    evening = datetime(2026, 9, 29, 11, 37, tzinfo=UTC)
    closes = datetime(2026, 9, 30, 5, 0, tzinfo=UTC)
    assert check(notice(closing=closes), profile(), now=evening)[0].reason == "Open; closes tomorrow"
    closed = check(notice(closing=NOW - timedelta(minutes=1)), profile(), now=NOW)[0]
    assert closed.status == UNMET


# ---------------------------------------------------------------- GRA


@pytest.mark.parametrize(
    ("registrations", "status", "reason_part"),
    [
        (None, UNKNOWN, "does not list GRA registrations"),
        ([], UNMET, "Not registered under EPU/CMP/10"),
        ([Registration(code="EPU/CMP/10", grade="S4", expires=date(2026, 1, 1))], UNMET, "expired on 01 Jan 2026"),
        ([Registration(code="EPU/CMP/10", grade=None)], UNKNOWN, "grade is not recorded"),
        ([Registration(code="EPU/CMP/10", grade="S4")], MET, "Registered at S4 (S$500,000)"),
        ([Registration(code="EPU/CMP/10", grade="EPU S3")], MET, "Registered at S3"),
        ([Registration(code="EPU/CMP/10", grade="S2")], UNMET, "below the S3 the notice names"),
        ([Registration(code="EPU/SER/46", grade="S9")], UNMET, "Not registered under EPU/CMP/10"),
    ],
)
def test_gra_branches(registrations, status, reason_part):
    result = only(check(notice(gra_heads=[CMP_S3]), profile(gra_registrations=registrations), now=NOW), "gra")
    assert result.status == status
    assert reason_part in result.reason
    assert result.requirement == "GRA EPU/CMP/10 Computer Related Hardware, Software, and Services at S3 (S$250,000) or above"


def test_gra_grade_comes_from_capacity_when_the_notice_omits_it():
    head = GraHead(code="EPU/CMP/10", label="", capacity_sgd=3_000_000, grade=None)
    result = only(check(notice(gra_heads=[head]), profile(gra_registrations=[Registration(code="EPU/CMP/10", grade="S5")]), now=NOW), "gra")
    assert "S6" in result.requirement and result.status == UNMET
    assert "Computer Hardware and software Products" in result.requirement  # title from the GSR table


def test_gra_without_grade_or_capacity_needs_only_the_registration():
    head = GraHead(code="EPU/SER/46", label="Cleaning Services")
    result = only(check(notice(gra_heads=[head]), profile(gra_registrations=[Registration(code="EPU/SER/46", grade="S2")]), now=NOW), "gra")
    assert (result.status, result.reason) == (MET, "Registered under EPU/SER/46")


def test_s10_covers_everything():
    head = GraHead(code="EPU/CMP/10", grade="S9", capacity_sgd=30_000_000)
    result = only(check(notice(gra_heads=[head]), profile(gra_registrations=[Registration(code="EPU/CMP/10", grade="S10")]), now=NOW), "gra")
    assert result.status == MET and "no upper limit" in result.reason


# ---------------------------------------------------------------- BCA


@pytest.mark.parametrize(
    ("workhead", "registrations", "status", "reason_part"),
    [
        (BcaWorkhead(code="CW01", grade="B1"), None, UNKNOWN, "does not list BCA registrations"),
        (BcaWorkhead(code="CW01", grade="B1"), [], UNMET, "Not registered under BCA workhead CW01"),
        (BcaWorkhead(code="CW01", grade="B1"), [Registration(code="CW01", grade="A2", expires=date(2025, 12, 31))], UNMET, "expired on 31 Dec 2025"),
        (BcaWorkhead(code="CW01", grade="B1"), [Registration(code="CW01", grade="A2")], MET, "tendering limit S$105,000,000"),
        (BcaWorkhead(code="CW01", grade="B1"), [Registration(code="CW01", grade="B2")], UNMET, "below B1 (S$50,000,000)"),
        (BcaWorkhead(code="ME11", grade="L4"), [Registration(code="ME11", grade="Single Grade")], MET, "no upper limit"),
        (BcaWorkhead(code="ME11", grade="L4"), [Registration(code="ME11", grade="Z9")], UNKNOWN, "not one BCA publishes a limit for"),
        (BcaWorkhead(code="ME11", grade=None), [Registration(code="ME11", grade="L1")], MET, "Registered under ME11 at L1"),
        (BcaWorkhead(code="TR01", grade=None), [Registration(code="TR01", grade="Single Grade")], MET, "publishes no tendering limit"),
    ],
)
def test_bca_branches(workhead, registrations, status, reason_part):
    result = only(check(notice(bca_workheads=[workhead]), profile(bca_registrations=registrations), now=NOW), "bca")
    assert result.status == status
    assert reason_part in result.reason


# ---------------------------------------------------------------- licences


def test_licence_implied_by_gra_head_category_or_words():
    by_head = implied_licences(notice(gra_heads=[GraHead(code="EPU/SER/43")]))
    by_category = implied_licences(notice(category="Facilities Management ⇒ Pest Control"))
    by_words = implied_licences(notice(description="Two rounds of penetration testing on public systems."))
    assert [r.id for r, _ in by_head] == ["spf-security-agency"]
    assert [r.id for r, _ in by_category] == ["nea-vector-control"]
    assert [(r.id, why) for r, why in by_words] == [("csro-pentest", "the words 'penetration testing'")]
    assert implied_licences(notice()) == []


CLEANING = dict(category="Facilities Management ⇒ Cleaning Services", description="General cleaning of classrooms.")


def test_licence_unknown_when_profile_is_silent():
    result = only(check(notice(**CLEANING), profile(licences_held=None), now=NOW), "licence")
    assert result.status == UNKNOWN and "does not list licences held" in result.reason
    assert result.source_url.endswith("nea/cleaning-business-licence")


def test_licence_met_by_alias():
    result = only(check(notice(**CLEANING), profile(licences_held=["NEA cleaning business licence (Class 2)"]), now=NOW), "licence")
    assert result.status == MET


def test_required_licence_not_held_says_how_to_get_it():
    catalogue = [
        Licence(
            id="nea/cleaning-business-licence",
            name="Cleaning Business Licence",
            agency="National Environment Agency (NEA)",
            fee="$180 (from 1 April 2026)\nrenewals the same",
            processing_time="within 14 working days",
            url="https://licensing.gobusiness.gov.sg/licence-directory/nea/cleaning-business-licence",
        )
    ]
    result = only(check(notice(**CLEANING), profile(licences_held=[]), now=NOW, catalogue=catalogue), "licence")
    assert result.status == UNMET
    assert result.reason.endswith("Apply to National Environment Agency (NEA) (within 14 working days; $180 (from 1 April 2026))")


def test_required_licence_without_catalogue_entry_names_the_agency():
    result = only(check(notice(**CLEANING), profile(licences_held=[]), now=NOW), "licence")
    assert result.reason.endswith("Apply to National Environment Agency (NEA)")


def test_check_level_rule_stays_unknown():
    result = only(check(notice(description="Supply of manpower services for events."), profile(licences_held=[]), now=NOW), "licence")
    assert result.status == UNKNOWN and result.reason.startswith("May be needed")


def test_licence_named_in_notice_is_not_duplicated_when_a_rule_covers_it():
    n = notice(**CLEANING, licences_mentioned=["Cleaning business licence (NEA)"])
    assert len([c for c in check(n, profile(licences_held=[]), now=NOW) if c.kind == "licence"]) == 1


@pytest.mark.parametrize(
    ("held", "status"),
    [(None, UNKNOWN), (["Food Hygiene Certificate"], MET), (["Something else"], UNMET)],
)
def test_licence_named_only_in_the_notice(held, status):
    n = notice(licences_mentioned=["Food Hygiene Certificate (SFA)"])
    result = only(check(n, profile(licences_held=held), now=NOW), "licence")
    assert result.status == status
    assert result.requirement == "Food Hygiene Certificate (SFA) (named in the notice)"


def test_holds_matches_either_way():
    assert holds(["Cleaning Business Licence"], ["cleaning business licence"]) == "Cleaning Business Licence"
    assert holds(["NEA Cleaning Business Licence Class 1"], ["cleaning business licence"])
    assert holds(["Licence"], ["security agency licence"]) is None  # generic words alone never match
    assert holds(["NEA cleaning"], ["cleaning business licence", "nea cleaning"]) == "NEA cleaning"
    assert holds(["Business Licence"], ["cleaning business licence"]) is None
    assert holds(["Food Shop Licence"], ["security agency licence"]) is None


# ---------------------------------------------------------------- bizSAFE


BIZSAFE_NOTICE = dict(description="The contractor shall be bizSAFE Level 3 certified.")


@pytest.mark.parametrize(
    ("level", "status", "reason"),
    [
        (None, UNKNOWN, "The profile does not state a bizSAFE level"),
        ("3", MET, "Holds bizSAFE Level 3"),
        ("Level Star", MET, "Holds bizSAFE Star"),
        ("2", UNMET, "Holds bizSAFE Level 2, below bizSAFE Level 3"),
        ("Partner", UNKNOWN, "bizSAFE 'Partner' is not a certification level"),
    ],
)
def test_bizsafe_branches(level, status, reason):
    result = [c for c in check(notice(**BIZSAFE_NOTICE), profile(bizsafe_level=level), now=NOW) if "bizSAFE" in c.requirement]
    assert len(result) == 1
    assert (result[0].status, result[0].reason) == (status, reason)
    assert result[0].requirement == "bizSAFE Level 3 or above"


def test_no_bizsafe_requirement_no_check():
    assert not [c for c in check(notice(), profile(bizsafe_level="3"), now=NOW) if "bizSAFE" in c.requirement]


def test_bizsafe_named_in_licences_mentioned_is_one_check():
    n = notice(licences_mentioned=["bizSAFE Star"])
    found = [c for c in check(n, profile(bizsafe_level="Level 4", licences_held=[]), now=NOW) if c.kind == "licence"]
    assert [(c.requirement, c.status) for c in found] == [("bizSAFE Star or above", UNMET)]


def test_bizsafe_label():
    assert bizsafe_label("level star") == "bizSAFE Star"
    assert bizsafe_label("3") == "bizSAFE Level 3"


# ---------------------------------------------------------------- UEN-backed verification


class FakeRegistry:
    def __init__(self, gra=None, bca=None, safe=None, company=None) -> None:
        self._gra, self._bca, self._safe, self._company = gra, bca, safe, company
        self.asked: list[str] = []

    def gsr(self, uen):
        self.asked.append(uen)
        return self._gra

    def bca(self, uen):
        return self._bca

    def bizsafe(self, uen):
        return self._safe

    def company(self, uen):
        return self._company


def test_registry_overrides_profile_claims():
    registry = FakeRegistry(gra=[Registration(code="EPU/CMP/10", grade="S2")], bca=[], safe=BizSafe("Level 3", None, "Approved"))
    claims = profile(uen="200000001A", gra_registrations=[Registration(code="EPU/CMP/10", grade="S9")], bizsafe_level=None)
    checks = check(notice(gra_heads=[CMP_S3], **BIZSAFE_NOTICE), claims, now=NOW, registry=registry)
    gra = only(checks, "gra")
    assert gra.status == UNMET and "(GeBIZ Supplier Directory)" in gra.reason and gra.source_url == GSR_DIRECTORY
    safe = next(c for c in checks if "bizSAFE" in c.requirement)
    assert (safe.status, safe.reason) == (MET, "Holds bizSAFE Level 3 (bizSAFE register)")


def test_registry_that_cannot_answer_falls_back_to_the_profile():
    claims = profile(uen="200000001A", gra_registrations=[Registration(code="EPU/CMP/10", grade="S4")])
    facts = facts_for(claims, FakeRegistry(gra=None, bca=None, safe=None))
    assert facts.gra == claims.gra_registrations and not facts.gra_verified
    gra = only(check(notice(gra_heads=[CMP_S3]), claims, now=NOW, registry=FakeRegistry()), "gra")
    assert gra.status == MET and "Supplier Directory" not in gra.reason


def test_not_on_bizsafe_register_is_unmet():
    checks = check(notice(**BIZSAFE_NOTICE), profile(uen="200000001A"), now=NOW, registry=FakeRegistry(safe=NOT_LISTED))
    safe = next(c for c in checks if "bizSAFE" in c.requirement)
    assert (safe.status, safe.reason) == (UNMET, "Not on the bizSAFE register")


@pytest.mark.parametrize(
    ("record", "reason"),
    [
        (NOT_LISTED, "Not on the bizSAFE register"),
        (BizSafe("Level 3", date(2026, 1, 31), "Approved"), "bizSAFE Level 3 expired on 31 Jan 2026"),
        (BizSafe("Level 3", None, "Expired"), "bizSAFE register shows bizSAFE Level 3 as 'Expired'"),
    ],
)
def test_register_answer_beats_a_profile_claim(record, reason):
    claims = profile(uen="200000001A", bizsafe_level="Level 3")
    checks = check(notice(**BIZSAFE_NOTICE), claims, now=NOW, registry=FakeRegistry(safe=record))
    safe = next(c for c in checks if "bizSAFE" in c.requirement)
    assert safe.status == UNMET and reason in safe.reason


def test_unreachable_register_leaves_the_profile_claim():
    claims = profile(uen="200000001A", bizsafe_level="Level 3")
    checks = check(notice(**BIZSAFE_NOTICE), claims, now=NOW, registry=FakeRegistry(safe=None))
    safe = next(c for c in checks if "bizSAFE" in c.requirement)
    assert (safe.status, safe.reason) == (MET, "Holds bizSAFE Level 3")


def test_no_uen_means_no_registry_calls():
    registry = FakeRegistry()
    checks = check(notice(), profile(uen=None), now=NOW, registry=registry)
    assert registry.asked == []
    assert not [c for c in checks if c.kind == "company"]


@pytest.mark.parametrize(
    ("company", "status", "reason_part"),
    [
        (Company("200000001A", "EXAMPLE PTE. LTD.", "Live Company", [("62011", "Development of software")]), MET, "activity 62011 Development of software"),
        (Company("200000001A", "EXAMPLE PTE. LTD.", "Struck Off"), UNMET, "Struck Off"),
        (Company("200000001A", "EXAMPLE PTE. LTD.", "In Liquidation"), UNKNOWN, "status 'In Liquidation'"),
        (Company("200000001A", "", NOT_IN_ACRA), UNKNOWN, "has no entity with this UEN"),
        (None, UNKNOWN, "Could not reach ACRA"),
    ],
)
def test_company_check(company, status, reason_part):
    result = only(check(notice(), profile(uen="200000001A"), now=NOW, registry=FakeRegistry(company=company)), "company")
    assert result.status == status and reason_part in result.reason


# ---------------------------------------------------------------- the whole list


def test_order_is_closing_gra_bca_licences_company():
    n = notice(
        gra_heads=[CMP_S3],
        bca_workheads=[BcaWorkhead(code="ME05", grade="L1")],
        description="Structured cabling and penetration testing. bizSAFE Level 3 required.",
    )
    registry = FakeRegistry(company=Company("200000001A", "EXAMPLE PTE. LTD.", "Live Company"))
    kinds = [c.kind for c in check(n, profile(uen="200000001A"), now=NOW, registry=registry)]
    assert kinds == ["closing", "gra", "bca", "licence", "licence", "licence", "company"]


def test_every_check_has_a_reason_and_a_source():
    n = notice(gra_heads=[CMP_S3], bca_workheads=[BcaWorkhead(code="CW02", grade="C1")], **CLEANING)
    for result in check(n, profile(), now=NOW):
        assert result.reason and result.source_url and result.source_url.startswith("https://")
