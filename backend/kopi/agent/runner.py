"""Run one copilot turn and print what happens as JSON lines (one ChatEvent each).

    python -m kopi.agent.runner --message "…" --profile-file profile.json [--resume <session>] [--doc <doc_no>]

Environment: KOPI_API and KOPI_SESSION_TOKEN (the scoped token the tools use), plus
CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY for Claude. The API reads stdout line by
line and forwards each event to the browser as server-sent events.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import AsyncIterator, Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import anyio
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    HookMatcher,
    ResultMessage,
    StreamEvent,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
    query,
)

from kopi.agent.prompts import system_prompt
from kopi.agent.tools import SERVER, KopiClient, build_server
from kopi.models import ChatEvent, ChatEventType, Profile

FILE_TOOLS = ["Read", "Write", "Edit", "Glob"]
WRITING_TOOLS = {"Write", "Edit"}
MAX_TURNS = 16
SUMMARY_CHARS = 160


def within(path: str | None, root: Path) -> bool:
    if not path:
        return True
    candidate = Path(path)
    resolved = (candidate if candidate.is_absolute() else root / candidate).resolve()
    return resolved == root.resolve() or root.resolve() in resolved.parents


def workspace_guard(workspace: Path):
    """PreToolUse hook: file tools stay inside the workspace, and only drafts/ is writable."""
    drafts = workspace / "drafts"

    async def guard(hook_input: dict, tool_use_id: str | None, context: Any) -> dict:
        name = hook_input.get("tool_name", "")
        if name not in FILE_TOOLS:
            return {}
        args = hook_input.get("tool_input") or {}
        path = args.get("file_path") or args.get("path")
        root = drafts if name in WRITING_TOOLS else workspace
        if within(path, root):
            return {}
        return {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": f"{name} is limited to {root}",
            }
        }

    return guard


def options(profile: Profile, client: KopiClient, workspace: Path, model: str, resume: str | None, doc_no: str | None) -> ClaudeAgentOptions:
    server, tool_names = build_server(client, profile)
    drafts = workspace / "drafts"
    drafts.mkdir(parents=True, exist_ok=True)
    return ClaudeAgentOptions(
        model=model,
        system_prompt=system_prompt(profile, datetime.now(UTC), str(drafts), doc_no),
        tools=FILE_TOOLS,
        allowed_tools=[*tool_names, *FILE_TOOLS],
        disallowed_tools=["Bash", "WebFetch", "WebSearch", "Task"],
        permission_mode="dontAsk",
        mcp_servers={SERVER: server},
        strict_mcp_config=True,
        setting_sources=[],
        hooks={"PreToolUse": [HookMatcher(matcher="|".join(FILE_TOOLS), hooks=[workspace_guard(workspace)])]},
        cwd=str(workspace),
        max_turns=MAX_TURNS,
        max_budget_usd=float(os.environ.get("KOPI_MAX_BUDGET_USD", "2.0")),
        include_partial_messages=True,
        resume=resume,
    )


# ---------------------------------------------------------------- SDK messages → ChatEvents


def short_tool(name: str) -> str:
    return name.removeprefix(f"mcp__{SERVER}__")


def summary(content: Any) -> str:
    if isinstance(content, list):
        content = " ".join(part.get("text", "") for part in content if isinstance(part, dict))
    text = " ".join(str(content or "").split())
    return text if len(text) <= SUMMARY_CHARS else text[: SUMMARY_CHARS - 1] + "…"


class Translator:
    """Turns the SDK's message stream into ChatEvents; remembers which tool calls wrote drafts."""

    def __init__(self, drafts: Path) -> None:
        self.drafts = drafts
        self.pending_files: dict[str, str] = {}
        self.session_id: str | None = None

    def events(self, message: Any) -> Iterable[ChatEvent]:
        session = getattr(message, "session_id", None)
        if session:
            self.session_id = session
        if isinstance(message, StreamEvent):
            delta = message.event.get("delta") or {}
            if message.event.get("type") == "content_block_delta" and delta.get("type") == "text_delta" and message.parent_tool_use_id is None:
                yield ChatEvent(type=ChatEventType.TEXT, text=delta["text"], session_id=self.session_id)
        elif isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, ToolUseBlock):
                    yield ChatEvent(type=ChatEventType.TOOL_CALL, tool=short_tool(block.name), input=block.input, session_id=self.session_id)
                    self._remember_draft(block)
        elif isinstance(message, UserMessage) and isinstance(message.content, list):
            for block in message.content:
                if isinstance(block, ToolResultBlock):
                    yield from self._result(block)
        elif isinstance(message, ResultMessage):
            if message.is_error:
                yield ChatEvent(type=ChatEventType.ERROR, text=message.result or message.subtype, session_id=message.session_id)
            yield ChatEvent(type=ChatEventType.DONE, session_id=message.session_id, cost_usd=message.total_cost_usd)

    def _remember_draft(self, block: ToolUseBlock) -> None:
        path = block.input.get("file_path") if block.name in WRITING_TOOLS else None
        if path and within(path, self.drafts):
            self.pending_files[block.id] = Path(path).name

    def _result(self, block: ToolResultBlock) -> Iterable[ChatEvent]:
        text = summary(block.content)
        yield ChatEvent(type=ChatEventType.TOOL_RESULT, summary=f"Error: {text}" if block.is_error else text, session_id=self.session_id)
        name = self.pending_files.pop(block.tool_use_id, None)
        if name and not block.is_error:
            yield ChatEvent(type=ChatEventType.FILE, file=name, session_id=self.session_id)


async def run_turn(message: str, opts: ClaudeAgentOptions, drafts: Path) -> AsyncIterator[ChatEvent]:
    translator = Translator(drafts)
    finished = False
    try:
        async for sdk_message in query(prompt=message, options=opts):
            for event in translator.events(sdk_message):
                finished = finished or event.type == ChatEventType.DONE
                yield event
    except Exception as error:  # the browser needs an event, not a dead stream
        if finished:  # the SDK raises after an error result it already reported
            return
        yield ChatEvent(type=ChatEventType.ERROR, text=f"{type(error).__name__}: {error}", session_id=translator.session_id)
        yield ChatEvent(type=ChatEventType.DONE, session_id=translator.session_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one Kopi copilot turn.")
    parser.add_argument("--message", required=True)
    parser.add_argument("--profile-file", type=Path, help="company profile JSON (default: $KOPI_PROFILE_JSON)")
    parser.add_argument("--workspace", type=Path, default=Path(os.environ.get("KOPI_WORKSPACE", "/workspace")))
    parser.add_argument("--resume")
    parser.add_argument("--doc")
    parser.add_argument("--model", default=os.environ.get("KOPI_MODEL", "claude-opus-5-5"))
    args = parser.parse_args()

    profile = Profile.model_validate_json(args.profile_file.read_text() if args.profile_file else os.environ["KOPI_PROFILE_JSON"])
    client = KopiClient(os.environ["KOPI_API"], os.environ.get("KOPI_SESSION_TOKEN"))
    opts = options(profile, client, args.workspace, args.model, args.resume, args.doc)

    async def stream() -> None:
        async for event in run_turn(args.message, opts, args.workspace / "drafts"):
            sys.stdout.write(event.model_dump_json(exclude_none=True) + "\n")
            sys.stdout.flush()

    anyio.run(stream)


if __name__ == "__main__":
    main()
