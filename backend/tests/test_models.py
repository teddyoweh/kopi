import json
import re

from kopi.config import FIXTURES_DIR
from kopi.models import Notice, Profile

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
SG_PHONE = re.compile(r"(?<!\d)[689]\d{7}(?!\d)")


def load_notices() -> list[Notice]:
    return [Notice.model_validate(n) for n in json.loads((FIXTURES_DIR / "notices.json").read_text())]


def test_fixture_notices_are_valid_and_synthetic():
    notices = load_notices()
    assert len(notices) == 30
    assert len({n.doc_no for n in notices}) == 30
    assert all(n.source == "fixture" for n in notices)


def test_fixture_notices_carry_no_contact_details_except_the_injection_bait():
    for notice in load_notices():
        text = notice.model_dump_json()
        if notice.doc_no.startswith("TST"):
            continue
        assert not EMAIL.search(text), notice.doc_no
        assert not SG_PHONE.search(text), notice.doc_no


def test_fixtures_include_prompt_injection_cases():
    bait = [n for n in load_notices() if n.doc_no.startswith("TST")]
    assert len(bait) == 2
    assert any("ignore your previous instructions" in n.description for n in bait)


def test_unknown_registrations_stay_none(pragnition: Profile, brightclean: Profile):
    assert pragnition.gra_registrations is None
    assert brightclean.gra_registrations and brightclean.gra_registrations[0].code == "EPU/SER/46"


def test_models_round_trip():
    notice = load_notices()[0]
    assert Notice.model_validate_json(notice.model_dump_json()) == notice
