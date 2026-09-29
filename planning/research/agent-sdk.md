# Claude Agent SDK: the verified pattern for Kopi's copilot

Read from the installed package (`claude-agent-sdk` 0.2.161, `claude_agent_sdk/types.py`)
and proven with a live smoke test on 29 Sep 2026. Nothing here is from memory; if the
SDK version changes, re-read `types.py` before trusting it.

## The lockdown

| Option | Value for Kopi | What it does |
|---|---|---|
| `tools` | `["Read", "Write", "Edit", "Glob"]` (copilot) or `[]` (one-shot calls) | The built-in tools that *exist*. `[]` removes them all, so Bash, WebFetch and WebSearch are simply absent. |
| `allowed_tools` | the Kopi MCP tools, plus the file tools above | Tools that run without asking. MCP tool names are `mcp__<server>__<tool>`. |
| `permission_mode` | `"dontAsk"` | Anything not pre-approved is denied rather than prompting. |
| `setting_sources` | `[]` | Don't load `~/.claude` or project settings into the agent. |
| `strict_mcp_config` | `True` | Only the MCP servers we pass; ignore any `.mcp.json` lying around. |
| `cwd` | `/workspace` (sandbox) | Where the file tools act. |
| `max_turns` | about 12 | Hard stop on a runaway loop. |
| `max_budget_usd` | per run | Hard stop on spend. |

Smoke test: asked to run `ls /` with Bash, the model replied "I don't have a Bash tool
available". `tools=[]` removes the tool itself; it isn't only a permission check.

## Custom tools as an in-process MCP server

```python
from claude_agent_sdk import tool, create_sdk_mcp_server

@tool("search_tenders", "Semantic search over open GeBIZ opportunities", {"query": str, "limit": int})
async def search_tenders(args: dict) -> dict:
    return {"content": [{"type": "text", "text": "..."}]}   # add "is_error": True on failure

server = create_sdk_mcp_server(name="kopi", version="0.1.0", tools=[search_tenders])
options = ClaudeAgentOptions(mcp_servers={"kopi": server}, allowed_tools=["mcp__kopi__search_tenders"], ...)
```

`input_schema` accepts either a `{name: type}` dict or a full JSON Schema dict.

## Structured output (the tender overview)

`output_format={"type": "json_schema", "schema": {...}}`. The model finishes by calling an
internal `StructuredOutput` tool, and the parsed result lands on
`ResultMessage.structured_output`. Use `additionalProperties: false` and a `required`
list.

## Streaming what happened

`query(prompt=..., options=...)` is an async iterator. The message types:

| Message | Fields that matter | Maps to Kopi's `ChatEvent` |
|---|---|---|
| `AssistantMessage.content` | `TextBlock.text` | `text` |
| `AssistantMessage.content` | `ToolUseBlock(id, name, input)` | `tool_call` |
| `UserMessage.content` | `ToolResultBlock(tool_use_id, content, is_error)` | `tool_result`, as a short summary |
| `ResultMessage` | `subtype`, `num_turns`, `total_cost_usd`, `session_id`, `structured_output`, `permission_denials`, `is_error` | `done` |

Pass `resume=<session_id>` to continue a conversation in the next turn.
`include_partial_messages=True` adds `StreamEvent`s for token-level streaming.

## Model and auth

- **Model:** `claude-opus-5-5`, per the claude-api skill default, with `KOPI_MODEL` to
  override. `effort` is its own option (`low` … `max`); Opus 5.5 defaults to `medium`.
- **Auth:** the SDK runs its bundled Claude Code CLI (`claude_agent_sdk/_bundled`, so no
  Node is needed). The CLI reads `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`)
  or `ANTHROPIC_API_KEY` from the environment. Locally it falls back to the logged-in
  Claude Code account, which is how the smoke test ran.

## Smoke test result

A prompt to look up a tender, say what's being bought, and try Bash:
- the MCP tool was called with `{"doc_no": …}`;
- Bash was unavailable;
- `StructuredOutput` returned `{"doc_no", "buying", "tried_bash": false}`.

`subtype=success`, 3 turns, **$0.016**, `permission_denials=[]`.
