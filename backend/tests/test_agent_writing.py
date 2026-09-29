"""Drafts stream to the browser while the model writes them (KP-38)."""

import json
from pathlib import Path

import pytest
from claude_agent_sdk import StreamEvent

from kopi.agent.runner import Translator
from kopi.agent.streaming import PartialWrite, decode
from kopi.models import ChatEventType

DOC = '# Bid plan: GVT000\n\n**Call:** "bid" — café ☕ 😀 \\ tab\there.\n\n| a | b |\n|---|---|\n'


def fragments(text: str, size: int) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)]


def stream(fragments_: list[str], name: str = "Write", index: int = 0, parent: str | None = None) -> list[StreamEvent]:
    def ev(event: dict) -> StreamEvent:
        return StreamEvent(uuid="u", session_id="s", event=event, parent_tool_use_id=parent)

    return [
        ev({"type": "content_block_start", "index": index, "content_block": {"type": "tool_use", "id": "t1", "name": name, "input": {}}}),
        *[ev({"type": "content_block_delta", "index": index, "delta": {"type": "input_json_delta", "partial_json": f}}) for f in fragments_],
        ev({"type": "content_block_stop", "index": index}),
    ]


def written(translator: Translator, events: list[StreamEvent]) -> tuple[set[str], str]:
    out = [e for message in events for e in translator.events(message) if e.type == ChatEventType.WRITING]
    return {e.file for e in out}, "".join(e.text for e in out)


@pytest.mark.parametrize("size", [1, 2, 3, 5, 7, 64, 10_000])
def test_every_split_gives_back_the_exact_document(tmp_path: Path, size: int):
    drafts = tmp_path / "drafts"
    raw = json.dumps({"file_path": str(drafts / "GVT000-bid-plan.md"), "content": DOC}, ensure_ascii=True)
    names, text = written(Translator(drafts), stream(fragments(raw, size)))
    assert names == {"GVT000-bid-plan.md"}
    assert text == DOC


def test_non_ascii_sent_raw_also_round_trips(tmp_path: Path):
    drafts = tmp_path / "drafts"
    raw = json.dumps({"file_path": str(drafts / "x.md"), "content": DOC}, ensure_ascii=False)
    assert written(Translator(drafts), stream(fragments(raw, 3)))[1] == DOC


def test_content_before_file_path_is_sent_once_the_name_is_known(tmp_path: Path):
    drafts = tmp_path / "drafts"
    raw = '{"content": ' + json.dumps(DOC) + ', "file_path": ' + json.dumps(str(drafts / "x.md")) + "}"
    names, text = written(Translator(drafts), stream(fragments(raw, 4)))
    assert (names, text) == ({"x.md"}, DOC)


def test_events_are_batched(tmp_path: Path):
    drafts = tmp_path / "drafts"
    raw = json.dumps({"file_path": str(drafts / "x.md"), "content": "word " * 200})
    t = Translator(drafts)
    events = [e for m in stream(fragments(raw, 2)) for e in t.events(m) if e.type == ChatEventType.WRITING]
    assert 1 < len(events) < 30
    assert all(len(e.text) >= 60 for e in events[:-1])


@pytest.mark.parametrize(
    "case",
    ["edit", "other-tool", "outside-drafts", "subagent"],
)
def test_nothing_streams_that_should_not(tmp_path: Path, case: str):
    drafts = tmp_path / "drafts"
    path = tmp_path / "memory.json" if case == "outside-drafts" else drafts / "x.md"
    raw = json.dumps({"file_path": str(path), "content": DOC})
    name = {"edit": "Edit", "other-tool": "mcp__kopi__remember"}.get(case, "Write")
    parent = "task-1" if case == "subagent" else None
    assert written(Translator(drafts), stream(fragments(raw, 5), name=name, parent=parent)) == (set(), "")


def test_text_deltas_still_stream(tmp_path: Path):
    t = Translator(tmp_path / "drafts")
    event = StreamEvent(uuid="u", session_id="s", event={"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hi"}})
    assert [(e.type, e.text) for e in t.events(event)] == [(ChatEventType.TEXT, "Hi")]


def test_decode_never_releases_half_an_escape():
    assert decode(r"ab\\", 0) == ("ab\\", 4, False)
    assert decode("ab\\", 0) == ("ab", 2, False)
    assert decode(r"x\u00", 0) == ("x", 1, False)
    assert decode(r"x\ud83d", 0) == ("x", 1, False)
    assert decode("x" + chr(92) + "ud83d" + chr(92) + "ude00", 0) == ("x\U0001f600", 13, False)
    assert decode(r'done" rest', 0) == ("done", 5, True)


def test_partial_write_stops_at_the_closing_quote():
    partial = PartialWrite()
    assert partial.feed('{"file_path": "/w/drafts/a.md", "content": "hel') == "hel"
    assert partial.feed('lo", "extra": "not content"}') == "lo"
    assert partial.file_path == "/w/drafts/a.md"
