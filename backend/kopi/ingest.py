"""Turn sources into vectors: build each record's text, embed only what changed, keep the rest.

Everything here is a pure step over lists and `VectorSet`s. Where the vectors are stored
and which server they are pushed to is modal_app.py's business, so the whole flow runs
in tests with a fake embedder and NeedleDB's embedded mode.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from kopi.index import (
    AWARDS,
    DIMENSION,
    LICENCES,
    NOTICES,
    VectorSet,
    award_metadata,
    changed,
    licence_metadata,
    notice_metadata,
    text_hash,
    upsert_rows,
)
from kopi.models import AwardTender, Licence, Notice, NoticeStatus

log = logging.getLogger(__name__)

EmbedDocuments = Callable[[list[str]], np.ndarray]


@dataclass
class Records:
    ids: list[str]
    texts: list[str]
    metadata: list[dict]


@dataclass
class Report:
    name: str
    records: int
    embedded: int
    reused: int
    closed: int = 0
    pushed: int = 0
    notes: list[str] = field(default_factory=list)


def notice_records(notices: Sequence[Notice], text_for: Callable[[Notice], str]) -> Records:
    texts = [text_for(n) for n in notices]
    return Records([n.doc_no for n in notices], texts, [notice_metadata(n, t) for n, t in zip(notices, texts, strict=True)])


def award_records(tenders: Sequence[AwardTender], text_for: Callable[[AwardTender], str]) -> Records:
    texts = [text_for(t) for t in tenders]
    return Records([t.tender_no for t in tenders], texts, [award_metadata(t, x) for t, x in zip(tenders, texts, strict=True)])


def licence_records(licences: Sequence[Licence], text_for: Callable[[Licence], str]) -> Records:
    texts = [text_for(x) for x in licences]
    return Records([x.id for x in licences], texts, [licence_metadata(x, t) for x, t in zip(licences, texts, strict=True)])


def embed_incrementally(records: Records, previous: VectorSet, embed: EmbedDocuments) -> tuple[VectorSet, int]:
    """Vectors for `records`, reusing a previous vector wherever the embedded text is unchanged.

    Returns the new set and how many texts were actually embedded.
    """
    vectors = np.zeros((len(records.ids), DIMENSION), dtype=np.float32)
    todo: list[int] = []
    for i, record_id in enumerate(records.ids):
        row = previous.row(record_id)
        if row is not None and previous.metadata[row].get("text_hash") == text_hash(records.texts[i]):
            vectors[i] = previous.vectors[row]
        else:
            todo.append(i)
    if todo:
        fresh = np.asarray(embed([records.texts[i] for i in todo]), dtype=np.float32)
        if fresh.shape != (len(todo), DIMENSION):
            raise ValueError(f"embedder returned {fresh.shape}, expected {(len(todo), DIMENSION)}")
        vectors[todo] = fresh
    return VectorSet(records.ids, vectors, records.metadata), len(todo)


def keep_closed(current: VectorSet, previous: VectorSet) -> tuple[VectorSet, int]:
    """Notices that dropped off the Open tab stay in the index, marked closed.

    GeBIZ removes a notice from the listing when it closes; keeping it (status=closed)
    lets search and the copilot still answer "what was that tender?" without showing it
    as biddable.
    """
    present = set(current.ids)
    gone = [i for i, record_id in enumerate(previous.ids) if record_id not in present]
    if not gone:
        return current, 0
    closed_meta = [{**previous.metadata[i], "status": NoticeStatus.CLOSED.value} for i in gone]
    return (
        VectorSet(
            current.ids + [previous.ids[i] for i in gone],
            np.vstack([current.vectors, previous.vectors[gone]]),
            current.metadata + closed_meta,
        ),
        sum(1 for i in gone if previous.metadata[i].get("status") != NoticeStatus.CLOSED.value),
    )


def refresh(name: str, records: Records, store: Path, embed: EmbedDocuments, index=None) -> Report:
    """Embed what changed, save the set to `store/<name>.npz`, and push changed rows to `index` if given."""
    path = store / f"{name}.npz"
    previous = VectorSet.load(path)
    current, embedded = embed_incrementally(records, previous, embed)
    closed = 0
    if name == NOTICES:
        current, closed = keep_closed(current, previous)
    rows = changed(previous, current)
    current.save(path)
    pushed = upsert_rows(index, current, rows) if index is not None else 0
    report = Report(name, len(current), embedded, len(records.ids) - embedded, closed, pushed)
    log.info("%s: %d records, %d embedded, %d reused, %d newly closed, %d pushed", name, report.records, embedded, report.reused, closed, pushed)
    return report


def load_into(db, store: Path) -> dict[str, int]:
    """Bulk-load every saved set into a NeedleDB client (used when the server container starts)."""
    from kopi.index import ensure_indexes

    ensure_indexes(db)
    loaded = {}
    for name in (NOTICES, AWARDS, LICENCES):
        vectors = VectorSet.load(store / f"{name}.npz")
        loaded[name] = upsert_rows(db.Index(name), vectors) if len(vectors) else 0
    return loaded
