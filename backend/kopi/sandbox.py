"""Copilot sessions: one Modal Sandbox per conversation, one runner process per turn.

The API never runs the agent itself. Each chat session gets its own sandbox, and each
turn is `python -m kopi.agent.runner` executed inside it with a short-lived token that
can only read Kopi data. The runner's stdout (one ChatEvent per line) becomes the SSE
stream the browser reads. After a turn, drafts are copied out of the sandbox into the
session store, so they can still be downloaded after the sandbox is gone.

The store, not the sandbox, holds a session's files: its drafts, the person's uploads and,
in a bid session, the bid memory. Before each turn the sandbox gets what it is missing
(everything, when the sandbox is new because the last one died), and after a bid turn the
agent's changes to memory.json are merged back.

Store keys, per session id:
    session/{sid}    the record: box, claude, turns, files {name: meta}, inputs {upload: modified}
    file/{sid}/{n}   a draft's text
    upload/{sid}/{n} an upload's bytes
    memory/{sid}     the BidMemory, as JSON
    forgotten/{sid}  ids of notes the person forgot, so a turn cannot bring one back

Modal is reached only through `Boxes` and `SessionStore`, so everything here runs in
tests with fakes.
"""

from __future__ import annotations

import base64
import hashlib
import json
import uuid
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Callable, Protocol

from kopi.models import BidMemory, ChatEvent, ChatEventType, ChatRequest, MemoryNote, SessionFile
from kopi.store import NotFound

WORKSPACE = "/workspace"
DRAFTS = f"{WORKSPACE}/drafts"
INPUTS = f"{WORKSPACE}/inputs"
MEMORY = f"{WORKSPACE}/memory.json"
MEMORY_TOOLS = {"remember", "set_bid_stage"}  # the runner's tools that write MEMORY
DUMP_DRAFTS = (
    "import json, pathlib\n"
    f"root = pathlib.Path({DRAFTS!r})\n"
    "files = sorted(p for p in root.glob('*.md') if p.is_file()) if root.exists() else []\n"
    "print(json.dumps({p.name: p.read_text(errors='replace')[:200000] for p in files}))\n"
)
READ_MEMORY = (
    "import pathlib\n"
    f"path = pathlib.Path({MEMORY!r})\n"
    "print(path.read_text() if path.exists() else '')\n"
)
# Exec takes no stdin here, so files travel in environment variables, base64 so any bytes
# survive. Linux refuses a single variable over 128 KB (MAX_ARG_STRLEN), and argv plus the
# environment share 2 MB (1 MB on macOS, where the local harness runs), hence both caps.
CHUNK_CHARS = 100_000
EXEC_CHARS = 500_000
WRITE_FILES = (
    "import base64, json, os, pathlib\n"
    "parts = json.loads(os.environ['KOPI_PARTS'])\n"
    "for i, (name, append) in enumerate(parts):\n"
    "    path = pathlib.Path(name)\n"
    "    path.parent.mkdir(parents=True, exist_ok=True)\n"
    "    with path.open('ab' if append else 'wb') as out:\n"
    "        out.write(base64.b64decode(os.environ[f'KOPI_PART_{i}']))\n"
    "print(len(parts))\n"
)


class Box(Protocol):
    id: str

    def alive(self) -> bool: ...
    def run(self, argv: list[str], env: dict[str, str]) -> Iterator[str]: ...


class Boxes(Protocol):
    def create(self) -> Box: ...
    def get(self, box_id: str) -> Box | None: ...


class SessionStore(Protocol):
    def get(self, key: str) -> Any: ...
    def put(self, key: str, value: Any) -> None: ...


class MemoryStore:
    def __init__(self) -> None:
        self.data: dict[str, Any] = {}

    def get(self, key: str) -> Any:
        return self.data.get(key)

    def put(self, key: str, value: Any) -> None:
        self.data[key] = value


@dataclass(frozen=True)
class Limits:
    turns_per_session: int = 20
    sessions_per_caller_per_day: int = 12
    bid_turns_per_session: int = 60


class CopilotUnavailable(RuntimeError):
    """No copilot is wired, or its sandbox could not start; the API answers 503."""


class LimitReached(RuntimeError):
    """A per-session or per-caller cap was hit; the API answers 429."""


def caller_key(caller: str) -> str:
    return hashlib.sha256(caller.encode()).hexdigest()[:16]


def title_of(text: str, fallback: str) -> str:
    first = text.lstrip().splitlines()[0] if text.strip() else ""
    return first.lstrip("# ").strip() or fallback


def write_files(box: Box, files: dict[str, bytes]) -> None:
    """Write files into a sandbox: base64 chunks of CHUNK_CHARS, at most EXEC_CHARS of them per exec."""
    parts: list[tuple[str, bool, str]] = []  # (path, append, base64 chunk)
    for path, body in files.items():
        encoded = base64.b64encode(body).decode()
        starts = range(0, len(encoded), CHUNK_CHARS) or range(1)  # an empty file is one empty part
        parts += [(path, start > 0, encoded[start : start + CHUNK_CHARS]) for start in starts]
    batch: list[tuple[str, bool, str]] = []
    size = 0
    for part in parts:
        if batch and size + len(part[2]) > EXEC_CHARS:
            _write_batch(box, batch)
            batch, size = [], 0
        batch.append(part)
        size += len(part[2])
    if batch:
        _write_batch(box, batch)


def _write_batch(box: Box, batch: list[tuple[str, bool, str]]) -> None:
    env = {"KOPI_PARTS": json.dumps([[path, append] for path, append, _ in batch])}
    env.update({f"KOPI_PART_{i}": chunk for i, (*_, chunk) in enumerate(batch)})
    if "".join(box.run(["python", "-c", WRITE_FILES], env)).strip() != str(len(batch)):
        raise CopilotUnavailable("could not restore this session's files into its sandbox")


def merge_memory(latest: BidMemory, boxed: BidMemory, before: BidMemory, forgotten: set[str], now: datetime) -> BidMemory:
    """The stored memory with a turn's work folded in.

    latest is the store's memory now (the person may have added or forgotten notes during the
    turn), boxed is the sandbox's memory.json, and before is what the turn started from. Notes
    are a union by id, less any the person forgot; only Kopi's notes can come from the
    sandbox, since the person's arrive through the API. The stage and next step come from the
    sandbox when the agent changed them. Returns latest itself when nothing changed.
    """
    known = {note.id for note in latest.notes} | forgotten
    added = [note for note in boxed.notes if note.id not in known and note.source == "kopi"]
    stage = boxed.stage if boxed.stage != before.stage else latest.stage
    next_step = boxed.next_step if boxed.next_step != before.next_step else latest.next_step
    if not added and (stage, next_step) == (latest.stage, latest.next_step):
        return latest
    return BidMemory(notes=[*latest.notes, *added], stage=stage, next_step=next_step, updated=now)


def _parse_memory(text: str) -> BidMemory | None:
    try:
        return BidMemory.model_validate_json(text) if text.strip() else None
    except ValueError:
        return None


class Copilot:
    def __init__(
        self,
        boxes: Boxes,
        store: SessionStore,
        mint_token: Callable[[str], str],
        api_url: str,
        limits: Limits = Limits(),
        model: str | None = None,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.boxes, self.store, self.mint_token = boxes, store, mint_token
        self.api_url, self.limits, self.model, self.now = api_url, limits, model, now

    # ------------------------------------------------------------ one turn

    def turn(self, request: ChatRequest, caller: str) -> Iterator[ChatEvent]:
        bid = request.bid and bool(request.doc_no)
        session_id, record, box, fresh = self._start(request.session_id, caller, bid)
        memory: BidMemory | None = None
        if bid:  # from a sandbox that lived on, first fold in what a turn the browser walked away from remembered
            memory = self._memory(session_id) if fresh else self._merge_memory(session_id, box, BidMemory())
        inputs = self._restore(session_id, record, box, fresh, memory)

        claude, finished = record["claude"], False
        for line in box.run(*self._command(request, session_id, claude, bid)):
            event = _parse(line)
            if event is None:
                continue
            claude = event.session_id or claude
            finished = finished or event.type == ChatEventType.DONE
            if memory is not None and event.type == ChatEventType.TOOL_RESULT and event.tool in MEMORY_TOOLS:
                self._merge_memory(session_id, box, memory)  # before the event, so the browser's refresh sees it
            yield event.model_copy(update={"session_id": session_id})
        self._finish(session_id, box, claude, inputs, memory)
        if not finished:
            yield ChatEvent(type=ChatEventType.ERROR, text="The copilot stopped before finishing its turn.", session_id=session_id)
            yield ChatEvent(type=ChatEventType.DONE, session_id=session_id)

    def _start(self, session_id: str | None, caller: str, bid: bool) -> tuple[str, dict, Box, bool]:
        """The session, within its caps, and its sandbox; `fresh` when the sandbox is new, so empty."""
        new_id, record = self._session(session_id, caller, bid)
        box, fresh = self._box(record)
        if session_id:
            record = self._record(session_id)  # starting a sandbox takes seconds; an upload may have landed
        record["box"] = box.id
        record["turns"] += 1
        if fresh:
            record["claude"] = None  # a new sandbox has no transcript to resume
        self.store.put(f"session/{new_id}", record)
        return new_id, record, box, fresh

    def _command(self, request: ChatRequest, session_id: str, claude: str | None, bid: bool) -> tuple[list[str], dict[str, str]]:
        env = {
            "KOPI_API": self.api_url,
            "KOPI_SESSION_TOKEN": self.mint_token(session_id),
            "KOPI_PROFILE_JSON": request.profile.model_dump_json(),
            "KOPI_WORKSPACE": WORKSPACE,
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        }
        argv = ["python", "-m", "kopi.agent.runner", "--workspace", WORKSPACE, "--message", request.message]
        if claude:
            argv += ["--resume", claude]
        if request.doc_no:
            argv += ["--doc", request.doc_no]
        if bid:
            argv.append("--bid")
        if self.model:
            argv += ["--model", self.model]
        return argv, env

    def _finish(self, session_id: str, box: Box, claude: str | None, inputs: dict[str, str], memory: BidMemory | None) -> None:
        """Merge the bid memory and copy the drafts out, into a freshly read record."""
        if memory is not None:
            self._merge_memory(session_id, box, memory)
        drafts = self._dump_drafts(box)
        record = self._record(session_id)  # the person may have uploaded during the turn
        record["claude"], record["inputs"] = claude, inputs
        self._save_drafts(session_id, record, drafts)
        self.store.put(f"session/{session_id}", record)

    def _session(self, session_id: str | None, caller: str, bid: bool) -> tuple[str, dict]:
        if session_id:
            record = self._record(session_id)
            cap = self.limits.bid_turns_per_session if bid else self.limits.turns_per_session
            if record["turns"] >= cap:
                raise LimitReached(f"this conversation has reached {cap} turns; start a new one")
            return session_id, record
        day_key = f"caller/{caller_key(caller)}/{self.now():%Y-%m-%d}"
        started = self.store.get(day_key) or 0
        if started >= self.limits.sessions_per_caller_per_day:
            raise LimitReached(f"{self.limits.sessions_per_caller_per_day} conversations a day is the limit for this demo")
        self.store.put(day_key, started + 1)
        return uuid.uuid4().hex, {"box": None, "claude": None, "turns": 0, "files": {}, "inputs": {}, "created": self.now().isoformat()}

    def _record(self, session_id: str) -> dict:
        record = self.store.get(f"session/{session_id}")
        if record is None:
            raise NotFound(f"no copilot session {session_id}")
        return record

    def _box(self, record: dict) -> tuple[Box, bool]:
        """The session's sandbox, and whether it is new (so empty: the old one died, or there was none)."""
        box = self.boxes.get(record["box"]) if record.get("box") else None
        if box is not None and box.alive():
            return box, False
        return self.boxes.create(), True

    def _restore(self, session_id: str, record: dict, box: Box, fresh: bool, memory: BidMemory | None) -> dict[str, str]:
        """Write what the sandbox is missing: every draft if it is new, the uploads it has not got, and
        the bid memory. Returns the uploads now in it, by name, with the `modified` that versions each."""
        in_box: dict[str, str] = {} if fresh else record.get("inputs", {})
        files: dict[str, bytes] = {}
        uploads: dict[str, str] = {}
        for name, meta in record["files"].items():
            if meta.get("kind") == "upload":
                uploads[name] = meta["modified"]
                folder, wanted = INPUTS, in_box.get(name) != meta["modified"]
            else:
                folder, wanted = DRAFTS, fresh
            body = self._content(session_id, name, meta) if wanted else None
            if body is not None:
                files[f"{folder}/{name}"] = body
        if memory is not None:
            files[MEMORY] = memory.model_dump_json().encode()
        write_files(box, files)
        return uploads

    def _dump_drafts(self, box: Box) -> dict[str, str]:
        output = "".join(box.run(["python", "-c", DUMP_DRAFTS], {}))
        try:
            return json.loads(output or "{}")
        except json.JSONDecodeError:
            return {}

    def _save_drafts(self, session_id: str, record: dict, drafts: dict[str, str]) -> None:
        """Store the drafts that changed. An unchanged one keeps its time, and stays hidden behind an
        upload that took its name."""
        for name, text in drafts.items():
            if self.store.get(f"file/{session_id}/{name}") == text:
                continue
            self.store.put(f"file/{session_id}/{name}", text)
            record["files"][name] = {"title": title_of(text, name), "size": len(text.encode()), "modified": self.now().isoformat(), "kind": "draft"}

    # ------------------------------------------------------------ drafts and uploads

    def files(self, session_id: str) -> list[SessionFile]:
        """Drafts first, then uploads, each by name."""
        found = [SessionFile(name=name, **meta) for name, meta in self._record(session_id)["files"].items()]
        return sorted(found, key=lambda f: (f.kind, f.name))

    def file(self, session_id: str, name: str) -> bytes:
        meta = self._record(session_id)["files"].get(name)
        body = self._content(session_id, name, meta) if meta else None
        if body is None:
            raise NotFound(f"no file {name} in session {session_id}")
        return body

    def _content(self, session_id: str, name: str, meta: dict) -> bytes | None:
        """A file's bytes, or None if the store no longer has them (Modal Dict entries expire unused)."""
        if meta.get("kind") == "upload":
            return self.store.get(f"upload/{session_id}/{name}")
        text = self.store.get(f"file/{session_id}/{name}")
        return None if text is None else text.encode()

    def upload(self, session_id: str, name: str, body: bytes) -> SessionFile:
        """Keep an upload; the next turn writes it into the sandbox's inputs/. Its `modified` versions it."""
        record = self._record(session_id)
        self.store.put(f"upload/{session_id}/{name}", body)
        record["files"][name] = {"title": name, "size": len(body), "modified": self.now().isoformat(), "kind": "upload"}
        self.store.put(f"session/{session_id}", record)
        return SessionFile(name=name, **record["files"][name])

    # ------------------------------------------------------------ bid memory

    def memory(self, session_id: str) -> BidMemory:
        self._record(session_id)
        return self._memory(session_id)

    def remember(self, session_id: str, text: str) -> BidMemory:
        memory = self.memory(session_id)
        note = MemoryNote(id=uuid.uuid4().hex[:12], text=text, source="you", created=self.now())
        return self._put_memory(session_id, memory.model_copy(update={"notes": [*memory.notes, note], "updated": note.created}))

    def forget(self, session_id: str, note_id: str) -> BidMemory:
        memory = self.memory(session_id)
        kept = [note for note in memory.notes if note.id != note_id]
        if len(kept) == len(memory.notes):
            raise NotFound(f"no note {note_id} in session {session_id}")
        self.store.put(f"forgotten/{session_id}", [*self._forgotten(session_id), note_id])
        return self._put_memory(session_id, memory.model_copy(update={"notes": kept, "updated": self.now()}))

    def _memory(self, session_id: str) -> BidMemory:
        stored = self.store.get(f"memory/{session_id}")
        return BidMemory.model_validate_json(stored) if stored else BidMemory()

    def _put_memory(self, session_id: str, memory: BidMemory) -> BidMemory:
        self.store.put(f"memory/{session_id}", memory.model_dump_json())
        return memory

    def _forgotten(self, session_id: str) -> list[str]:
        return self.store.get(f"forgotten/{session_id}") or []

    def _merge_memory(self, session_id: str, box: Box, before: BidMemory) -> BidMemory:
        """Fold the sandbox's memory.json into the stored memory (see merge_memory)."""
        boxed = _parse_memory("".join(box.run(["python", "-c", READ_MEMORY], {})))
        latest = self._memory(session_id)
        if boxed is None:
            return latest
        merged = merge_memory(latest, boxed, before, set(self._forgotten(session_id)), self.now())
        return latest if merged is latest else self._put_memory(session_id, merged)


def _parse(line: str) -> ChatEvent | None:
    line = line.strip()
    if not line.startswith("{"):
        return None
    try:
        return ChatEvent.model_validate_json(line)
    except ValueError:
        return None


# ---------------------------------------------------------------- Modal


def lines(chunks: Iterable[str]) -> Iterator[str]:
    """Whole lines from a stream of chunks. Modal's stdout yields chunks, and one chunk can
    hold several JSON events or half of one."""
    pending = ""
    for chunk in chunks:
        pending += chunk
        *complete, pending = pending.split("\n")
        yield from complete
    if pending:
        yield pending


class ModalBox:
    def __init__(self, sandbox) -> None:
        self.sandbox = sandbox
        self.id = sandbox.object_id

    def alive(self) -> bool:
        return self.sandbox.poll() is None

    def run(self, argv: list[str], env: dict[str, str]) -> Iterator[str]:
        process = self.sandbox.exec(*argv, env=env or None, workdir=WORKSPACE, timeout=15 * 60)
        yield from lines(process.stdout)
        process.wait()


class ModalBoxes:
    """Sandboxes in the deployed `kopi` app, with egress limited to Claude and the Kopi API."""

    def __init__(self, image, secrets: list, allowed_domains: list[str], app_name: str = "kopi") -> None:
        import modal

        self.modal = modal
        self.image, self.secrets, self.allowed = image, secrets, allowed_domains
        self.app = modal.App.lookup(app_name)

    def create(self) -> Box:
        try:
            return ModalBox(self._create())
        except Exception as error:  # a missing secret or quota shows up here, as 503 not 500
            raise CopilotUnavailable(f"could not start a copilot sandbox: {error}") from error

    def _create(self):
        return self.modal.Sandbox.create(
            "sleep", "infinity",
            app=self.app,
            image=self.image,
            secrets=self.secrets,
            workdir=WORKSPACE,
            timeout=60 * 60,
            idle_timeout=15 * 60,
            cpu=1.0,
            memory=2048,
            outbound_domain_allowlist=self.allowed,
        )

    def get(self, box_id: str) -> Box | None:
        try:
            return ModalBox(self.modal.Sandbox.from_id(box_id))
        except Exception:  # a sandbox that timed out is simply gone
            return None


class ModalDictStore:
    def __init__(self, name: str = "kopi-sessions") -> None:
        import modal

        self.dict = modal.Dict.from_name(name, create_if_missing=True)

    def get(self, key: str) -> Any:
        return self.dict.get(key)

    def put(self, key: str, value: Any) -> None:
        self.dict[key] = value
