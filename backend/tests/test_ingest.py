import json

import numpy as np
from needledb import NeedleDBLocal

from kopi.config import FIXTURES_DIR
from kopi.index import DIMENSION, NOTICES, VectorSet, ensure_indexes, query
from kopi.ingest import keep_closed, load_into, notice_records, refresh
from kopi.models import Notice


class FakeEmbedder:
    """Deterministic unit vectors from the text, and a count of what it was asked to embed."""

    def __init__(self) -> None:
        self.calls = 0
        self.texts: list[str] = []

    def __call__(self, texts: list[str]) -> np.ndarray:
        self.calls += 1
        self.texts += texts
        rows = [np.random.default_rng(abs(hash(t)) % 2**32).standard_normal(DIMENSION) for t in texts]
        matrix = np.array(rows, dtype=np.float32)
        return matrix / np.linalg.norm(matrix, axis=1, keepdims=True)


def text(notice: Notice) -> str:
    return f"{notice.title}\n{notice.agency}\n{notice.description}"


def notices() -> list[Notice]:
    return [Notice.model_validate(n) for n in json.loads((FIXTURES_DIR / "notices.json").read_text())]


def test_first_refresh_embeds_everything_and_saves(tmp_path):
    embed = FakeEmbedder()
    report = refresh(NOTICES, notice_records(notices(), text), tmp_path, embed)
    assert (report.records, report.embedded, report.reused) == (30, 30, 0)
    assert len(VectorSet.load(tmp_path / "notices.npz")) == 30


def test_second_refresh_reuses_unchanged_vectors(tmp_path):
    items = notices()
    refresh(NOTICES, notice_records(items, text), tmp_path, FakeEmbedder())
    items[0] = items[0].model_copy(update={"description": items[0].description + " Amended."})
    embed = FakeEmbedder()
    report = refresh(NOTICES, notice_records(items, text), tmp_path, embed)
    assert (report.embedded, report.reused) == (1, 29)
    assert embed.texts == [text(items[0])]


def test_notices_that_leave_the_listing_stay_marked_closed(tmp_path):
    items = notices()
    refresh(NOTICES, notice_records(items, text), tmp_path, FakeEmbedder())
    report = refresh(NOTICES, notice_records(items[1:], text), tmp_path, FakeEmbedder())
    assert report.closed == 1 and report.records == 30
    saved = VectorSet.load(tmp_path / "notices.npz")
    assert saved.metadata[saved.row(items[0].doc_no)]["status"] == "closed"
    again = refresh(NOTICES, notice_records(items[1:], text), tmp_path, FakeEmbedder())
    assert again.closed == 0, "an already-closed notice is not counted twice"


def test_keep_closed_is_a_no_op_when_nothing_left():
    empty = VectorSet.empty()
    assert keep_closed(empty, empty) == (empty, 0)


def test_refresh_pushes_only_changed_rows_to_the_index(tmp_path):
    items = notices()
    with NeedleDBLocal(tmp_path / "needle") as db:
        ensure_indexes(db)
        first = refresh(NOTICES, notice_records(items, text), tmp_path, FakeEmbedder(), db.Index(NOTICES))
        second = refresh(NOTICES, notice_records(items, text), tmp_path, FakeEmbedder(), db.Index(NOTICES))
        assert (first.pushed, second.pushed) == (30, 0)
        saved = VectorSet.load(tmp_path / "notices.npz")
        top = query(db.Index(NOTICES), saved.vectors[5], top_k=1)
        assert top[0].id == items[5].doc_no


def test_server_start_loads_every_saved_set(tmp_path):
    refresh(NOTICES, notice_records(notices(), text), tmp_path, FakeEmbedder())
    with NeedleDBLocal(tmp_path / "needle") as db:
        assert load_into(db, tmp_path) == {"notices": 30, "awards": 0, "licences": 0}
        assert db.Index(NOTICES).describe_index_stats()["totalVectorCount"] == 30
