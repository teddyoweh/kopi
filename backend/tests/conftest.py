import json
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

import kopi.agent.tools
import kopi.api.live
import kopi.eligibility
import kopi.overview
import kopi.store

from kopi.api.app import create_app
from kopi.config import PROFILES_DIR, Settings
from kopi.models import Profile
from kopi.store import FixtureStore


# The fixture notices are synthetic, with fixed closing dates from 27 Sep to 29 Oct 2026. The code that
# decides "open" and "closes in N days" reads a clock frozen at noon in Singapore on 1 Oct 2026, so the
# suite gives the same answer whatever day it runs.
FROZEN_NOW = datetime(2026, 10, 1, 4, 0, tzinfo=UTC)


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return FROZEN_NOW.astimezone(tz) if tz is not None else FROZEN_NOW.replace(tzinfo=None)


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch):
    for module in (kopi.store, kopi.api.live, kopi.eligibility, kopi.overview, kopi.agent.tools):
        monkeypatch.setattr(module, "datetime", FrozenDatetime)
    return FROZEN_NOW


@pytest.fixture
def store() -> FixtureStore:
    return FixtureStore()


@pytest.fixture
def pragnition() -> Profile:
    return Profile.model_validate(json.loads((PROFILES_DIR / "pragnition.json").read_text()))


@pytest.fixture
def brightclean() -> Profile:
    return Profile.model_validate(json.loads((PROFILES_DIR / "brightclean.json").read_text()))


@pytest.fixture
def client(store) -> TestClient:
    return TestClient(create_app(store, Settings(access_codes=[])))


@pytest.fixture
def gated_client(store) -> TestClient:
    return TestClient(create_app(store, Settings(access_codes=["kopi-demo"], signing_key="test-key")))
