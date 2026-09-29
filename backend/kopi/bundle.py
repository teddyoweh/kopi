"""All known notices in one file.

On a Modal Volume every file open is a network round trip: reading 732 notices one file
at a time took 37 s, reading one bundle takes well under a second. Ingest writes the
bundle; the API reads it.
"""

from __future__ import annotations

import json
from pathlib import Path

from kopi.models import Notice, NoticeStatus

BUNDLE = "_bundle.json"


def write_bundle(folder: Path, open_notices: list[Notice]) -> int:
    """Current open notices plus every notice seen before, the latter marked closed."""
    current = {n.doc_no: n for n in open_notices}
    for old in read_bundle(folder).values():
        if old.doc_no not in current:
            current[old.doc_no] = old if old.status != NoticeStatus.OPEN else old.model_copy(update={"status": NoticeStatus.CLOSED})
    path = folder / BUNDLE
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps([n.model_dump(mode="json") for n in current.values()]))
    tmp.replace(path)
    return len(current)


def read_bundle(folder: Path) -> dict[str, Notice]:
    path = folder / BUNDLE
    if not path.exists():
        return {}
    return {n["doc_no"]: Notice.model_validate(n) for n in json.loads(path.read_text())}
