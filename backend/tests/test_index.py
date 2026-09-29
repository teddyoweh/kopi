import json
from datetime import UTC, datetime

import numpy as np
import pytest
from needledb import NeedleDBLocal

from kopi.config import FIXTURES_DIR
from kopi.index import (
    DIMENSION,
    NOTICES,
    VectorSet,
    changed,
    ensure_indexes,
    notice_filter,
    notice_metadata,
    query,
    upsert_rows,
)
from kopi.models import Notice


def unit(seed: int) -> np.ndarray:
    v = np.random.default_rng(seed).standard_normal(DIMENSION).astype(np.float32)
    return v / np.linalg.norm(v)


def notices() -> list[Notice]:
    return [Notice.model_validate(n) for n in json.loads((FIXTURES_DIR / "notices.json").read_text())]


def notice_set(items: list[Notice]) -> VectorSet:
    return VectorSet([n.doc_no for n in items], np.stack([unit(i) for i in range(len(items))]), [notice_metadata(n, n.title) for n in items])


@pytest.fixture
def db(tmp_path):
    with NeedleDBLocal(tmp_path / "needle") as local:
        ensure_indexes(local)
        yield local


def test_metadata_is_flat_and_filterable():
    meta = notice_metadata(notices()[0], "text")
    assert meta["doc_no"] == "GVT000ETT26000101"
    assert meta["category_group"] == "IT&Telecommunication"
    assert isinstance(meta["closing_ts"], int) and meta["status"] == "open"
    assert all(v is not None for v in meta.values())


def test_vector_set_round_trips_through_npz(tmp_path):
    original = notice_set(notices()[:5])
    original.save(tmp_path / "n.npz")
    loaded = VectorSet.load(tmp_path / "n.npz")
    assert loaded.ids == original.ids and loaded.metadata == original.metadata
    assert np.allclose(loaded.vectors, original.vectors, atol=1e-3)
    assert len(VectorSet.load(tmp_path / "missing.npz")) == 0


def test_vector_set_rejects_mismatched_rows():
    with pytest.raises(ValueError):
        VectorSet(["a", "b"], np.zeros((1, DIMENSION), dtype=np.float32), [{}, {}])


def test_query_returns_nearest_with_metadata(db):
    items = notices()
    vectors = notice_set(items)
    assert upsert_rows(db.Index(NOTICES), vectors) == len(items)
    matches = query(db.Index(NOTICES), vectors.vectors[3], top_k=3)
    assert matches[0].id == items[3].doc_no and matches[0].score > 0.99
    assert matches[0].metadata["title"] == items[3].title


def test_filters_by_status_agency_and_closing_window(db):
    items = notices()
    upsert_rows(db.Index(NOTICES), notice_set(items))
    target = unit(0)
    open_only = query(db.Index(NOTICES), target, top_k=50, filter=notice_filter())
    assert open_only and all(m.metadata["status"] == "open" for m in open_only)
    assert len(open_only) == sum(n.status == "open" for n in items)
    moe = query(db.Index(NOTICES), target, top_k=50, filter=notice_filter(agency="Ministry of Education - Schools"))
    assert moe and {m.metadata["agency"] for m in moe} == {"Ministry of Education - Schools"}
    soon = datetime(2026, 10, 8, tzinfo=UTC)
    early = query(db.Index(NOTICES), target, top_k=50, filter=notice_filter(closing_before=soon))
    assert early and all(m.metadata["closing_ts"] <= soon.timestamp() for m in early)


def test_changed_rows_are_new_or_different():
    items = notices()[:4]
    before = notice_set(items)
    after = notice_set(items)
    after.metadata[1] = {**after.metadata[1], "status": "closed"}
    extra = notice_set(notices()[:5])
    assert changed(before, after) == [1]
    assert changed(before, extra) == [4]
    assert changed(VectorSet.empty(), before) == [0, 1, 2, 3]
