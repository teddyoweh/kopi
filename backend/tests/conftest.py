import json

import pytest
from fastapi.testclient import TestClient

from kopi.api.app import create_app
from kopi.config import PROFILES_DIR, Settings
from kopi.models import Profile
from kopi.store import FixtureStore


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
