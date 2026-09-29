"""Copilot sessions: one Modal Sandbox per conversation, one runner process per turn.

The API never runs the agent itself. Each chat session gets its own sandbox, and each
turn is `python -m kopi.agent.runner` executed inside it with a short-lived token that
can only read Kopi data. The runner's stdout (one ChatEvent per line) becomes the SSE
stream the browser reads. After a turn, drafts are copied out of the sandbox into the
session store, so they can still be downloaded after the sandbox is gone.

Modal is reached only through `Boxes` and `SessionStore`, so everything here runs in
tests with fakes.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Callable, Protocol

from kopi.models import ChatEvent, ChatEventType, ChatRequest, SessionFile
from kopi.store import NotFound

WORKSPACE = "/workspace"
DRAFTS = f"{WORKSPACE}/drafts"
DUMP_DRAFTS = (
    "import json, pathlib\n"
    f"root = pathlib.Path({DRAFTS!r})\n"
    "files = sorted(p for p in root.glob('*.md') if p.is_file()) if root.exists() else []\n"
    "print(json.dumps({p.name: p.read_text(errors='replace')[:200000] for p in files}))\n"
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


class CopilotUnavailable(RuntimeError):
    """No copilot is wired, or its sandbox could not start; the API answers 503."""


class LimitReached(RuntimeError):
    """A per-session or per-caller cap was hit; the API answers 429."""


def caller_key(caller: str) -> str:
    return hashlib.sha256(caller.encode()).hexdigest()[:16]


def title_of(text: str, fallback: str) -> str:
    first = text.lstrip().splitlines()[0] if text.strip() else ""
    return first.lstrip("# ").strip() or fallback


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
        session_id, record = self._session(request.session_id, caller)
        box = self._box(record)
        record["box"] = box.id
        record["turns"] += 1
        self.store.put(f"session/{session_id}", record)

        env = {
            "KOPI_API": self.api_url,
            "KOPI_SESSION_TOKEN": self.mint_token(session_id),
            "KOPI_PROFILE_JSON": request.profile.model_dump_json(),
            "KOPI_WORKSPACE": WORKSPACE,
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        }
        argv = ["python", "-m", "kopi.agent.runner", "--workspace", WORKSPACE, "--message", request.message]
        if record.get("claude"):
            argv += ["--resume", record["claude"]]
        if request.doc_no:
            argv += ["--doc", request.doc_no]
        if self.model:
            argv += ["--model", self.model]

        finished = False
        for line in box.run(argv, env):
            event = _parse(line)
            if event is None:
                continue
            if event.session_id:
                record["claude"] = event.session_id
            finished = finished or event.type == ChatEventType.DONE
            yield event.model_copy(update={"session_id": session_id})
        self._save_drafts(session_id, record, box)
        self.store.put(f"session/{session_id}", record)
        if not finished:
            yield ChatEvent(type=ChatEventType.ERROR, text="The copilot stopped before finishing its turn.", session_id=session_id)
            yield ChatEvent(type=ChatEventType.DONE, session_id=session_id)

    def _session(self, session_id: str | None, caller: str) -> tuple[str, dict]:
        if session_id:
            record = self.store.get(f"session/{session_id}")
            if record is None:
                raise NotFound(f"no copilot session {session_id}")
            if record["turns"] >= self.limits.turns_per_session:
                raise LimitReached(f"this conversation has reached {self.limits.turns_per_session} turns; start a new one")
            return session_id, record
        day_key = f"caller/{caller_key(caller)}/{self.now():%Y-%m-%d}"
        started = self.store.get(day_key) or 0
        if started >= self.limits.sessions_per_caller_per_day:
            raise LimitReached(f"{self.limits.sessions_per_caller_per_day} conversations a day is the limit for this demo")
        self.store.put(day_key, started + 1)
        return uuid.uuid4().hex, {"box": None, "claude": None, "turns": 0, "files": {}, "created": self.now().isoformat()}

    def _box(self, record: dict) -> Box:
        box = self.boxes.get(record["box"]) if record.get("box") else None
        if box is not None and box.alive():
            return box
        if record.get("box"):
            record["claude"] = None  # a new sandbox has no transcript to resume
        return self.boxes.create()

    def _save_drafts(self, session_id: str, record: dict, box: Box) -> None:
        output = "".join(box.run(["python", "-c", DUMP_DRAFTS], {}))
        try:
            drafts: dict[str, str] = json.loads(output or "{}")
        except json.JSONDecodeError:
            return
        for name, text in drafts.items():
            self.store.put(f"file/{session_id}/{name}", text)
            record["files"][name] = {"title": title_of(text, name), "size": len(text.encode()), "modified": self.now().isoformat()}

    # ------------------------------------------------------------ drafts

    def files(self, session_id: str) -> list[SessionFile]:
        record = self.store.get(f"session/{session_id}")
        if record is None:
            raise NotFound(f"no copilot session {session_id}")
        return [SessionFile(name=name, **meta) for name, meta in sorted(record["files"].items())]

    def file(self, session_id: str, name: str) -> bytes:
        text = self.store.get(f"file/{session_id}/{name}")
        if text is None:
            raise NotFound(f"no file {name} in session {session_id}")
        return text.encode()


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
