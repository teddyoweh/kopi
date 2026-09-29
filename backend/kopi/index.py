"""Kopi's three NeedleDB indexes: what they hold, how records are shaped, and how vectors travel.

The vectors themselves live on the Modal Volume as one `.npz` per index (`VectorSet`).
NeedleDB is the serving layer, loaded from those files when its container starts and
kept current by ingest over HTTP. So a lost container costs a reload, never a re-embed.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np

from kopi.models import AwardTender, Licence, Notice, NoticeStatus

DIMENSION = 1024
NOTICES, AWARDS, LICENCES = "notices", "awards", "licences"
INDEXES = (NOTICES, AWARDS, LICENCES)
UPSERT_BATCH = 256


def ensure_indexes(db) -> None:
    """Create any missing index. `db` is a NeedleDB or NeedleDBLocal client."""
    for name in INDEXES:
        db.create_index(name, dimension=DIMENSION, metric="cosine", exist_ok=True)


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _ts(moment: datetime | None) -> int | None:
    return int(moment.timestamp()) if moment else None


def _clean(metadata: dict) -> dict:
    """NeedleDB metadata holds strings, numbers, booleans and string lists; drop the Nones."""
    return {k: v for k, v in metadata.items() if v is not None and v != ""}


def notice_metadata(notice: Notice, text: str) -> dict:
    return _clean({
        "doc_no": notice.doc_no,
        "title": notice.title,
        "type": notice.type,
        "agency": notice.agency,
        "category": notice.category,
        "category_group": notice.category.split(" ⇒ ")[0] if notice.category else None,
        "method": notice.procurement_method,
        "status": notice.status.value,
        "published_ts": _ts(notice.published),
        "closing_ts": _ts(notice.closing),
        "url": notice.url,
        "text_hash": text_hash(text),
    })


def award_metadata(tender: AwardTender, text: str) -> dict:
    return _clean({
        "tender_no": tender.tender_no,
        "description": tender.description[:600],
        "agency": tender.agency,
        "status": tender.status,
        "year": tender.award_date.year if tender.award_date else None,
        "award_date": tender.award_date.isoformat() if tender.award_date else None,
        "amount": tender.total_amount,
        "suppliers": tender.suppliers[:20] or None,
        "text_hash": text_hash(text),
    })


def licence_metadata(licence: Licence, text: str) -> dict:
    return _clean({
        "id": licence.id,
        "name": licence.name,
        "agency": licence.agency,
        "url": licence.url,
        "text_hash": text_hash(text),
    })


@dataclass
class VectorSet:
    """One index's records: ids, a float32 (n, DIMENSION) matrix, and metadata per row."""

    ids: list[str]
    vectors: np.ndarray
    metadata: list[dict]

    def __post_init__(self) -> None:
        if not (len(self.ids) == len(self.metadata) == len(self.vectors)):
            raise ValueError("ids, vectors and metadata must have the same length")
        if len(self.vectors) and self.vectors.shape[1] != DIMENSION:
            raise ValueError(f"expected {DIMENSION}-d vectors, got {self.vectors.shape[1]}")

    @classmethod
    def empty(cls) -> VectorSet:
        return cls([], np.zeros((0, DIMENSION), dtype=np.float32), [])

    def __len__(self) -> int:
        return len(self.ids)

    def row(self, record_id: str) -> int | None:
        return self._positions().get(record_id)

    def _positions(self) -> dict[str, int]:
        return {record_id: i for i, record_id in enumerate(self.ids)}

    def save(self, path: Path) -> None:
        """Write atomically: a reader never sees half a file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp.npz")
        np.savez_compressed(
            tmp,
            ids=np.array(self.ids, dtype=object),
            vectors=self.vectors.astype(np.float16),
            metadata=np.array(json.dumps(self.metadata)),
        )
        tmp.replace(path)

    @classmethod
    def load(cls, path: Path) -> VectorSet:
        if not path.exists():
            return cls.empty()
        with np.load(path, allow_pickle=True) as data:
            return cls(
                ids=[str(x) for x in data["ids"]],
                vectors=data["vectors"].astype(np.float32),
                metadata=json.loads(str(data["metadata"])),
            )


def changed(previous: VectorSet, current: VectorSet) -> list[int]:
    """Rows of `current` that are new or whose metadata differs from `previous`."""
    before = {record_id: meta for record_id, meta in zip(previous.ids, previous.metadata, strict=True)}
    return [i for i, record_id in enumerate(current.ids) if before.get(record_id) != current.metadata[i]]


def batches(rows: list[int], size: int = UPSERT_BATCH) -> Iterator[list[int]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def upsert_rows(index, vectors: VectorSet, rows: Iterable[int] | None = None) -> int:
    """Upsert the given rows (all by default). `index` is a NeedleDB index handle."""
    rows = list(range(len(vectors))) if rows is None else list(rows)
    for chunk in batches(rows):
        index.upsert_arrays([vectors.ids[i] for i in chunk], vectors.vectors[chunk], [vectors.metadata[i] for i in chunk])
    return len(rows)


# ---------------------------------------------------------------- queries


@dataclass(frozen=True)
class Match:
    id: str
    score: float
    metadata: dict


def notice_filter(
    status: NoticeStatus | str | None = NoticeStatus.OPEN,
    agency: str | None = None,
    category_group: str | None = None,
    method: str | None = None,
    closing_after: datetime | None = None,
    closing_before: datetime | None = None,
) -> dict | None:
    """A NeedleDB filter for the notices index. Text fields match exactly."""
    clauses: dict = {}
    if status:
        clauses["status"] = status.value if isinstance(status, NoticeStatus) else status
    if agency:
        clauses["agency"] = agency
    if category_group:
        clauses["category_group"] = category_group
    if method:
        clauses["method"] = method
    closing: dict = {}
    if closing_after:
        closing["$gte"] = _ts(closing_after)
    if closing_before:
        closing["$lte"] = _ts(closing_before)
    if closing:
        clauses["closing_ts"] = closing
    return clauses or None


def query(index, vector: np.ndarray, top_k: int = 20, filter: dict | None = None) -> list[Match]:
    result = index.query(vector=np.asarray(vector, dtype=np.float32).tolist(), top_k=top_k, filter=filter, include_metadata=True)
    return [Match(m["id"], float(m["score"]), dict(m.get("metadata") or {})) for m in result["matches"]]
