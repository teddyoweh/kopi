import json
from datetime import UTC, datetime
from pathlib import Path

import anyio
import pytest
from claude_agent_sdk import AssistantMessage, ResultMessage, StreamEvent, TextBlock, ToolResultBlock, ToolUseBlock, UserMessage
from fastapi.testclient import TestClient

from kopi.agent.prompts import system_prompt
from kopi.agent.runner import FILE_TOOLS, Translator, options, within, workspace_guard
from kopi.agent.tools import KopiClient, build_tools, notice_block, submission_checklist
from kopi.api.app import create_app
from kopi.config import FIXTURES_DIR, PROFILES_DIR, Settings
from kopi.models import ChatEventType, EligibilityCheck, EligibilityStatus, Notice, Profile
from kopi.store import FixtureStore

NOW = datetime(2026, 9, 29, 12, tzinfo=UTC)


def notices() -> dict[str, Notice]:
    return {n["doc_no"]: Notice.model_validate(n) for n in json.loads((FIXTURES_DIR / "notices.json").read_text())}


@pytest.fixture
def profile() -> Profile:
    return Profile.model_validate_json((PROFILES_DIR / "brightclean.json").read_text())


@pytest.fixture
def tools(profile) -> dict:
    """The real tool handlers, talking to the real API app over fixtures."""
    client = KopiClient("http://kopi", None, http=TestClient(create_app(FixtureStore(), Settings(access_codes=[]))))
    return {t.name: t.handler for t in build_tools(client, profile, now=lambda: NOW)}


def call(handler, **args) -> str:
    result = anyio.run(handler, args)
    return result["content"][0]["text"]


# ---------------------------------------------------------------- tools


def test_search_tool_lists_doc_numbers_and_closing(tools):
    text = call(tools["search_tenders"], query="cleaning services for schools")
    assert "MOESCHETQ26004355" in text and "closes 2026-" in text


def test_get_tender_wraps_the_notice_and_adds_rules_and_market(tools):
    text = call(tools["get_tender"], doc_no="MOESCHETQ26004355")
    assert text.startswith('<notice doc_no="MOESCHETQ26004355">')
    assert "Eligibility for BrightClean" in text and "[met] gra" in text
    assert "Market context:" in text


def test_injected_notice_text_cannot_close_the_delimiter(tools):
    text = call(tools["get_tender"], doc_no="TST000ETQ26000902")
    body = text.split("</notice>")[0]
    assert "&lt;/notice>" in body and "&lt;notice>" in body
    assert text.count("</notice>") == 1


def test_profile_licences_and_checklist_tools(tools):
    assert json.loads(call(tools["get_company_profile"]))["name"].startswith("BrightClean")
    assert "Cleaning Business Licence" in call(tools["find_licences"], activity="cleaning offices")
    checklist = call(tools["submission_checklist"], doc_no="GVT000ETT26000101")
    assert "Prepare two envelopes" in checklist and "Submit on GeBIZ before closing" in checklist


def test_api_errors_come_back_as_tool_errors_not_exceptions(tools):
    result = anyio.run(tools["get_tender"], {"doc_no": "NOPE0000000000"})
    assert result.get("is_error") is True and "404" in result["content"][0]["text"]


def test_checklist_rules():
    notice = notices()["GVT000ETT26000101"]
    checks = [
        EligibilityCheck(kind="closing", requirement="Closes", status=EligibilityStatus.MET, reason="open"),
        EligibilityCheck(kind="gra", requirement="EPU/CMP/10 S6", status=EligibilityStatus.UNKNOWN, reason="profile silent"),
    ]
    items = submission_checklist(notice, checks)
    labels = [i.label for i in items]
    assert labels[0] == "Settle: EPU/CMP/10 S6"
    assert sum(label.startswith("Price and respond to item") for label in labels) == len(notice.items)
    assert items[-1].due == notice.closing


def test_notice_block_has_the_facts_a_bid_needs():
    block = notice_block(notices()["GVT000ETT26000101"])
    for fact in ("EPU/CMP/10", "Two envelopes: yes", "Closes:", "Items to respond:"):
        assert fact in block


# ---------------------------------------------------------------- lockdown


def test_options_lock_the_agent_down(profile, tmp_path):
    client = KopiClient("http://kopi", None)
    opts = options(profile, client, tmp_path, "claude-opus-5-5", None, "GVT000ETT26000101")
    assert opts.tools == FILE_TOOLS
    assert {"Bash", "WebFetch", "WebSearch"} <= set(opts.disallowed_tools)
    assert opts.permission_mode == "dontAsk" and opts.strict_mcp_config and opts.setting_sources == []
    assert set(opts.allowed_tools) >= {"mcp__kopi__search_tenders", "mcp__kopi__get_tender", "Write"}
    assert not any(t in opts.allowed_tools for t in ("Bash", "WebFetch", "WebSearch"))
    assert str(tmp_path / "drafts") in opts.system_prompt and "GVT000ETT26000101" in opts.system_prompt
    assert (tmp_path / "drafts").is_dir()


@pytest.mark.parametrize(
    ("tool", "path", "allowed"),
    [
        ("Write", "drafts/a.md", True),
        ("Write", "{ws}/drafts/a.md", True),
        ("Write", "{ws}/notes.md", False),
        ("Write", "/etc/passwd", False),
        ("Edit", "{ws}/drafts/../../escape.md", False),
        ("Read", "{ws}/drafts/a.md", True),
        ("Read", "/Users/someone/.ssh/id_rsa", False),
        ("Glob", None, True),
    ],
)
def test_workspace_guard(tmp_path, tool, path, allowed):
    guard = workspace_guard(tmp_path)
    args = {"file_path": path.format(ws=tmp_path)} if path else {"pattern": "*.md"}
    decision = anyio.run(guard, {"tool_name": tool, "tool_input": args}, "t1", None)
    assert (decision == {}) is allowed


def test_guard_ignores_kopi_tools(tmp_path):
    assert anyio.run(workspace_guard(tmp_path), {"tool_name": "mcp__kopi__get_tender", "tool_input": {}}, "t", None) == {}


def test_within_handles_relative_paths(tmp_path):
    assert within("drafts/x.md", tmp_path) and not within("../x.md", tmp_path)


# ---------------------------------------------------------------- SDK messages → ChatEvents


def test_translator_maps_a_whole_turn(tmp_path):
    drafts = tmp_path / "drafts"
    t = Translator(drafts)
    stream = [
        StreamEvent(uuid="u1", session_id="s1", event={"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Looking"}}),
        AssistantMessage(content=[TextBlock(text="Looking"), ToolUseBlock(id="t1", name="mcp__kopi__search_tenders", input={"query": "IT"})], model="claude-opus-5-5"),
        UserMessage(content=[ToolResultBlock(tool_use_id="t1", content=[{"type": "text", "text": "3 open tenders for 'IT':\n- A"}])]),
        AssistantMessage(content=[ToolUseBlock(id="t2", name="Write", input={"file_path": str(drafts / "X-clarification-questions.md"), "content": "# Q"})], model="claude-opus-5-5"),
        UserMessage(content=[ToolResultBlock(tool_use_id="t2", content="File created")]),
        ResultMessage(subtype="success", duration_ms=1, duration_api_ms=1, is_error=False, num_turns=3, session_id="s1", total_cost_usd=0.12),
    ]
    events = [e for m in stream for e in t.events(m)]
    kinds = [e.type for e in events]
    assert kinds == [ChatEventType.TEXT, ChatEventType.TOOL_CALL, ChatEventType.TOOL_RESULT, ChatEventType.TOOL_CALL, ChatEventType.TOOL_RESULT, ChatEventType.FILE, ChatEventType.DONE]
    assert events[1].tool == "search_tenders" and events[2].summary.startswith("3 open tenders")
    assert events[5].file == "X-clarification-questions.md"
    assert events[-1].cost_usd == 0.12 and all(e.session_id == "s1" for e in events)


def test_failed_write_is_not_reported_as_a_file(tmp_path):
    t = Translator(tmp_path / "drafts")
    list(t.events(AssistantMessage(content=[ToolUseBlock(id="w", name="Write", input={"file_path": str(tmp_path / "drafts" / "a.md")})], model="m")))
    events = list(t.events(UserMessage(content=[ToolResultBlock(tool_use_id="w", content="denied", is_error=True)])))
    assert [e.type for e in events] == [ChatEventType.TOOL_RESULT] and events[0].summary.startswith("Error:")


def test_error_result_emits_error_then_done():
    events = list(Translator(Path("/tmp")).events(ResultMessage(subtype="error_max_turns", duration_ms=1, duration_api_ms=1, is_error=True, num_turns=16, session_id="s")))
    assert [e.type for e in events] == [ChatEventType.ERROR, ChatEventType.DONE]


def test_subagent_text_deltas_are_not_streamed():
    event = StreamEvent(uuid="u", session_id="s", event={"type": "content_block_delta", "delta": {"type": "text_delta", "text": "x"}}, parent_tool_use_id="t")
    assert list(Translator(Path("/tmp")).events(event)) == []


def test_system_prompt_names_company_date_and_rules(profile):
    prompt = system_prompt(profile, NOW, "/workspace/drafts")
    assert profile.name in prompt and "Tuesday 29 September 2026" in prompt
    assert "<notice>" in prompt and "never" in prompt.lower()


def test_run_turn_does_not_repeat_done_when_the_sdk_raises_after_an_error_result(monkeypatch, tmp_path):
    from kopi.agent import runner

    async def fake_query(prompt, options):
        yield ResultMessage(subtype="error", duration_ms=1, duration_api_ms=1, is_error=True, num_turns=0, session_id="s", result="Not logged in")
        raise RuntimeError("Claude Code returned an error result")

    monkeypatch.setattr(runner, "query", fake_query)

    async def collect():
        return [e async for e in runner.run_turn("hi", None, tmp_path)]

    events = anyio.run(collect)
    assert [e.type for e in events] == [ChatEventType.ERROR, ChatEventType.DONE]
