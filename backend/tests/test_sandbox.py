import json
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from kopi.api.app import create_app
from kopi.api.auth import issue, mint_agent_token, verify
from kopi.api.live import LiveStore
from kopi.config import PROFILES_DIR, Settings
from kopi.models import ChatEventType, ChatRequest, Profile
from kopi.sandbox import DUMP_DRAFTS, Copilot, CopilotUnavailable, LimitReached, Limits, MemoryStore
from kopi.store import NotFound

KEY = "test-signing-key"
PROFILE = Profile.model_validate_json((PROFILES_DIR / "pragnition.json").read_text())


def line(**event) -> str:
    return json.dumps(event)


TURN = [
    "Some SDK noise that is not JSON",
    line(type="tool_call", tool="search_tenders", input={"query": "IT"}, session_id="claude-1"),
    line(type="tool_result", summary="3 open tenders", session_id="claude-1"),
    line(type="text", text="Drafted.", session_id="claude-1"),
    line(type="file", file="X-clarification-questions.md", session_id="claude-1"),
    line(type="done", cost_usd=0.2, session_id="claude-1"),
]


class FakeBox:
    def __init__(self, box_id: str, script: list[str], drafts: dict[str, str]) -> None:
        self.id, self.script, self.drafts = box_id, script, drafts
        self.calls: list[tuple[list[str], dict]] = []
        self.dead = False

    def alive(self) -> bool:
        return not self.dead

    def run(self, argv, env):
        self.calls.append((argv, env))
        if argv[:2] == ["python", "-c"]:
            assert argv[2] == DUMP_DRAFTS
            yield json.dumps(self.drafts)
            return
        yield from self.script


class FakeBoxes:
    def __init__(self, script=TURN, drafts=None) -> None:
        self.script, self.drafts, self.made = script, drafts if drafts is not None else {"X-clarification-questions.md": "# Questions for X\n1. …"}, []

    def create(self):
        box = FakeBox(f"sb-{len(self.made)}", self.script, self.drafts)
        self.made.append(box)
        return box

    def get(self, box_id):
        return next((b for b in self.made if b.id == box_id), None)


def copilot(boxes=None, limits=Limits(), store=None) -> Copilot:
    return Copilot(boxes or FakeBoxes(), store or MemoryStore(), lambda s: mint_agent_token(KEY, s), "https://api.example",
                   limits=limits, now=lambda: datetime(2026, 9, 29, 12, tzinfo=UTC))


def request(message="Find IT tenders", session_id=None, doc_no=None) -> ChatRequest:
    return ChatRequest(message=message, session_id=session_id, profile=PROFILE, doc_no=doc_no)


def test_a_turn_streams_events_under_kopis_own_session_id():
    c = copilot()
    events = list(c.turn(request(), "caller-a"))
    assert [e.type for e in events] == [ChatEventType.TOOL_CALL, ChatEventType.TOOL_RESULT, ChatEventType.TEXT, ChatEventType.FILE, ChatEventType.DONE]
    session = events[0].session_id
    assert session != "claude-1" and all(e.session_id == session for e in events)


def test_drafts_outlive_the_sandbox():
    boxes = FakeBoxes()
    c = copilot(boxes)
    session = list(c.turn(request(), "a"))[0].session_id
    boxes.made[0].dead = True
    files = c.files(session)
    assert [(f.name, f.title) for f in files] == [("X-clarification-questions.md", "Questions for X")]
    assert c.file(session, "X-clarification-questions.md").startswith(b"# Questions")


def test_second_turn_reuses_the_sandbox_and_resumes_claude():
    boxes = FakeBoxes()
    c = copilot(boxes)
    session = list(c.turn(request(), "a"))[0].session_id
    list(c.turn(request("Now a compliance matrix", session_id=session, doc_no="X"), "a"))
    assert len(boxes.made) == 1
    argv, _ = [call for call in boxes.made[0].calls if call[0][:3] == ["python", "-m", "kopi.agent.runner"]][-1]
    assert argv[argv.index("--resume") + 1] == "claude-1" and argv[argv.index("--doc") + 1] == "X"


def test_a_dead_sandbox_is_replaced_and_not_resumed():
    boxes = FakeBoxes()
    c = copilot(boxes)
    session = list(c.turn(request(), "a"))[0].session_id
    boxes.made[0].dead = True
    list(c.turn(request(session_id=session), "a"))
    assert len(boxes.made) == 2
    argv, _ = boxes.made[1].calls[0]
    assert "--resume" not in argv


def test_each_turn_gets_a_fresh_read_only_token_and_nothing_else_secret():
    boxes = FakeBoxes()
    c = copilot(boxes)
    session = list(c.turn(request(), "a"))[0].session_id
    _, env = boxes.made[0].calls[0]
    claims = verify(KEY, env["KOPI_SESSION_TOKEN"])
    assert claims["scope"] == "agent" and claims["sub"] == f"session:{session}"
    assert json.loads(env["KOPI_PROFILE_JSON"])["id"] == "pragnition"
    assert not any("KEY" in name or "SIGNING" in name for name in env)


def test_a_stream_that_ends_early_still_finishes_cleanly():
    c = copilot(FakeBoxes(script=[line(type="text", text="partial", session_id="c")]))
    events = list(c.turn(request(), "a"))
    assert [e.type for e in events][-2:] == [ChatEventType.ERROR, ChatEventType.DONE]


def test_caps():
    c = copilot(limits=Limits(turns_per_session=1, sessions_per_caller_per_day=2))
    session = list(c.turn(request(), "a"))[0].session_id
    with pytest.raises(LimitReached):
        list(c.turn(request(session_id=session), "a"))
    list(c.turn(request(), "a"))
    with pytest.raises(LimitReached):
        list(c.turn(request(), "a"))
    assert list(c.turn(request(), "someone-else"))


def test_unknown_session():
    with pytest.raises(NotFound):
        list(copilot().turn(request(session_id="nope"), "a"))
    with pytest.raises(NotFound):
        copilot().files("nope")


# ---------------------------------------------------------------- through the API


@pytest.fixture
def api():
    store = LiveStore(db=None, embed_query=None, embed_document=None, copilot=copilot())
    return TestClient(create_app(store, Settings(access_codes=["code"], signing_key=KEY)))


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def body(**extra) -> dict:
    return {"message": "Find IT tenders", "profile": PROFILE.model_dump(mode="json"), **extra}


def test_chat_streams_sse_and_files_download(api):
    app_token, _ = issue(KEY, "code:test")
    with api.stream("POST", "/chat", json=body(), headers=bearer(app_token)) as response:
        assert response.status_code == 200
        events = [json.loads(l[6:]) for l in response.iter_lines() if l.startswith("data: ")]
    assert events[-1]["type"] == "done" and events[-2]["type"] == "file"
    session = events[0]["session_id"]
    files = api.get(f"/sessions/{session}/files", headers=bearer(app_token)).json()
    assert files[0]["name"] == "X-clarification-questions.md"
    assert api.get(f"/sessions/{session}/files/X-clarification-questions.md", headers=bearer(app_token)).text.startswith("# Questions")


def test_a_sandbox_token_cannot_chat_or_read_sessions(api):
    agent = mint_agent_token(KEY, "s1")
    assert api.post("/chat", json=body(), headers=bearer(agent)).status_code == 403
    assert api.get("/sessions/s1/files", headers=bearer(agent)).status_code == 403
    assert api.post("/tenders/X/overview", json={"profile": PROFILE.model_dump(mode="json")}, headers=bearer(agent)).status_code == 403


def test_without_a_copilot_chat_is_503():
    store = LiveStore(db=None, embed_query=None, embed_document=None)
    client = TestClient(create_app(store, Settings(access_codes=["code"], signing_key=KEY)))
    token, _ = issue(KEY, "code:test")
    assert client.post("/chat", json=body(), headers=bearer(token)).status_code == 503


def test_caps_answer_429():
    store = LiveStore(db=None, embed_query=None, embed_document=None, copilot=copilot(limits=Limits(sessions_per_caller_per_day=0)))
    client = TestClient(create_app(store, Settings(access_codes=["code"], signing_key=KEY)))
    token, _ = issue(KEY, "code:test")
    assert client.post("/chat", json=body(), headers=bearer(token)).status_code == 429


def test_sandbox_start_failure_is_503():
    class Broken(FakeBoxes):
        def create(self):
            raise CopilotUnavailable("could not start a copilot sandbox: secret kopi-claude not found")
    store = LiveStore(db=None, embed_query=None, embed_document=None, copilot=copilot(Broken()))
    client = TestClient(create_app(store, Settings(access_codes=["code"], signing_key=KEY)))
    token, _ = issue(KEY, "code:test")
    response = client.post("/chat", json=body(), headers=bearer(token))
    assert response.status_code == 503 and "kopi-claude" in response.json()["detail"]


def test_chunked_stdout_is_split_into_whole_lines():
    from kopi.sandbox import lines

    chunks = ['{"type":"error","text":"x"}\n{"type":"do', 'ne"}\n', '{"type":"text","text":"tail"}']
    assert list(lines(chunks)) == ['{"type":"error","text":"x"}', '{"type":"done"}', '{"type":"text","text":"tail"}']


def test_modal_box_run_yields_lines_not_chunks():
    from kopi.sandbox import ModalBox

    class Process:
        stdout = iter(['{"a":1}\n{"b"', ':2}\n'])

        def wait(self):
            return 0

    class Sandbox:
        object_id = "sb-1"

        def exec(self, *argv, **kwargs):
            return Process()

    assert list(ModalBox(Sandbox()).run(["x"], {})) == ['{"a":1}', '{"b":2}']
