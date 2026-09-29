import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from needledb import NeedleDBLocal

from kopi.api.app import create_app
from kopi.api.live import LiveStore, needle_filter
from kopi.config import FIXTURES_DIR, PROFILES_DIR, Settings
from kopi.index import AWARDS, DIMENSION, LICENCES, NOTICES, VectorSet, award_metadata, ensure_indexes, licence_metadata, notice_metadata, upsert_rows
from kopi.models import Licence, Notice, NoticeStatus
from kopi.search import tokens
from kopi.sources.awards import group_tenders, parse_row


def bag_of_words(text: str) -> np.ndarray:
    """A fake embedder where shared words mean closeness, so search behaves like search."""
    vector = np.zeros(DIMENSION, dtype=np.float32)
    for word in tokens(text):
        vector += np.random.default_rng(abs(hash(word)) % 2**32).standard_normal(DIMENSION)
    norm = np.linalg.norm(vector)
    return vector / norm if norm else vector


def fixture_notices() -> list[Notice]:
    return [Notice.model_validate(n) for n in json.loads((FIXTURES_DIR / "notices.json").read_text())]


@pytest.fixture
def live(tmp_path):
    data = tmp_path / "data"
    (data / "notices").mkdir(parents=True)
    notices = fixture_notices()
    for n in notices:
        (data / "notices" / f"{n.doc_no}.json").write_text(n.model_dump_json())
    open_ids = [n.doc_no for n in notices if n.status == NoticeStatus.OPEN and n.doc_no != "GVT000ETT26000101"]
    (data / "notices" / "_open.json").write_text(json.dumps(open_ids))
    licences = [Licence.model_validate(x) for x in json.loads((FIXTURES_DIR / "licences.json").read_text())]
    (data / "licences").mkdir()
    (data / "licences" / "gobusiness.json").write_text(json.dumps([x.model_dump(mode="json") for x in licences]))
    tenders = group_tenders([parse_row(r) for r in json.loads((FIXTURES_DIR / "awards.json").read_text())])

    db = NeedleDBLocal(tmp_path / "needle")
    ensure_indexes(db)
    def vs(ids, texts, metas):
        return VectorSet(ids, np.stack([bag_of_words(t) for t in texts]), metas)
    note_texts = [f"{n.title} {n.agency} {n.description}" for n in notices]
    upsert_rows(db.Index(NOTICES), vs([n.doc_no for n in notices], note_texts, [notice_metadata(n, t) for n, t in zip(notices, note_texts)]))
    upsert_rows(db.Index(AWARDS), vs([t.tender_no for t in tenders], [t.description for t in tenders], [award_metadata(t, t.description) for t in tenders]))
    upsert_rows(db.Index(LICENCES), vs([x.id for x in licences], [f"{x.name} {x.description}" for x in licences], [licence_metadata(x, x.name) for x in licences]))
    store = LiveStore(db, bag_of_words, bag_of_words, data_dir=data, reload=None, registry=None)
    yield store
    db.close()


@pytest.fixture
def client(live) -> TestClient:
    return TestClient(create_app(live, Settings(access_codes=[])))


@pytest.fixture
def profile() -> dict:
    return {"profile": json.loads((PROFILES_DIR / "brightclean.json").read_text())}


def test_semantic_search_finds_the_right_open_tender(client):
    body = client.get("/search", params={"q": "cleaning of classrooms and toilets"}).json()
    assert body["hits"], body
    assert body["hits"][0]["notice"]["doc_no"] == "MOESCHETQ26004355"
    assert "cleaning" in body["hits"][0]["highlights"]
    assert all(h["notice"]["status"] == "open" for h in body["hits"])


def test_a_notice_that_left_the_open_list_is_closed_and_not_searchable(client):
    doc = "GVT000ETT26000101"
    body = client.get("/search", params={"q": "generative AI assistant citizen enquiries"}).json()
    assert doc not in [h["notice"]["doc_no"] for h in body["hits"]]
    assert client.get(f"/tenders/{doc}").json()["notice"]["status"] == "closed"


def test_doc_number_query_goes_straight_to_the_tender(client):
    body = client.get("/search", params={"q": "moeschetq26004355"}).json()
    assert body["total"] == 1 and body["hits"][0]["notice"]["doc_no"] == "MOESCHETQ26004355"


def test_filters_reach_needledb(client):
    body = client.get("/search", params={"q": "services", "agency": "Ministry of Education - Schools", "limit": 50}).json()
    assert body["hits"] and {h["notice"]["agency"] for h in body["hits"]} == {"Ministry of Education - Schools"}


def test_needle_filter_maps_groups_and_full_categories():
    class F:
        status, agency, method, closing_after, closing_before = NoticeStatus.OPEN, None, None, None, None
        category = "Facilities Management"
    assert needle_filter(F()) == {"status": "open", "category_group": "Facilities Management"}
    F.category = "Facilities Management ⇒ Cleaning Services"
    assert needle_filter(F()) == {"status": "open", "category": "Facilities Management ⇒ Cleaning Services"}


def test_tender_detail_has_rule_based_eligibility_and_market(client, profile):
    detail = client.post("/tenders/MOESCHETQ26004355/detail", json=profile).json()
    kinds = {c["kind"]: c["status"] for c in detail["eligibility"]}
    assert kinds["gra"] == "met" and kinds["closing"] in {"met", "unmet"}
    assert detail["market"]["similar_count"] > 0
    examples = [e["description"].lower() for e in detail["market"]["examples"]]
    assert len(examples) == len(set(examples)), "repeated descriptions are collapsed in examples"


def test_licence_search_and_listing(client):
    found = client.get("/licences/search", params={"q": "security guard agency licence"}).json()
    assert found[0]["id"] == "plrd-security-agency"
    assert len(client.get("/licences", params={"limit": 5}).json()) == 5


def test_listing_is_newest_first(client):
    listed = client.get("/tenders", params={"limit": 10}).json()
    published = [t["published"] for t in listed]
    assert published == sorted(published, reverse=True)


def test_chat_without_a_copilot_is_503_not_a_broken_stream(client, profile):
    response = client.post("/chat", json={"message": "hi", **profile})
    assert response.status_code == 503


def test_unknown_tender_is_404(client):
    assert client.get("/tenders/NOPE0000000000").status_code == 404


def test_rate_limit_answers_429(live):
    app = create_app(live, Settings(access_codes=[]))
    app.state.limiters["read"].limit = 2
    c = TestClient(app)
    codes = [c.get("/licences").status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_volume_reload_failure_keeps_serving(live):
    def broken():
        raise OSError("volume unreachable")
    live.reload = broken
    live._loaded_at = 0
    assert live.list_tenders(type("F", (), {"status": None, "agency": None, "category": None, "method": None, "closing_after": None, "closing_before": None})(), 5, 0)


def test_a_notice_past_its_closing_time_is_closed_even_before_ingest_notices(live, tmp_path):
    past = fixture_notices()[0].model_copy(update={"doc_no": "PAST0000000001", "closing": fixture_notices()[0].published})
    (live.data_dir / "notices" / "PAST0000000001.json").write_text(past.model_dump_json())
    ids = json.loads((live.data_dir / "notices" / "_open.json").read_text()) + ["PAST0000000001"]
    (live.data_dir / "notices" / "_open.json").write_text(json.dumps(ids))
    live._loaded_at = 0
    assert live.notice("PAST0000000001").status == NoticeStatus.CLOSED


def test_bundle_keeps_history_and_marks_departed_notices_closed(tmp_path):
    from kopi.bundle import read_bundle, write_bundle

    notices = fixture_notices()[:3]
    assert write_bundle(tmp_path, notices) == 3
    assert write_bundle(tmp_path, notices[1:]) == 3
    bundle = read_bundle(tmp_path)
    assert bundle[notices[0].doc_no].status == NoticeStatus.CLOSED
    assert bundle[notices[1].doc_no].status == notices[1].status


def test_store_prefers_the_bundle_over_per_file_reads(live):
    from kopi.bundle import write_bundle

    folder = live.data_dir / "notices"
    one = fixture_notices()[:1]
    write_bundle(folder, one)
    live._loaded_at = 0
    live._fresh()
    assert set(live.notices) == {one[0].doc_no}
