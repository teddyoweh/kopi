#!/usr/bin/env python3
"""Export Claude Code session transcripts as redacted, readable build logs.

    python3 scripts/export_logs.py --manifest data/log-sources.json --out logs

The manifest is a local, gitignored list of the sessions to export, in order:

    [{"label": "01-main", "title": "Main agent", "path": "/path/to/<session>.jsonl",
      "private_windows": [{"from": "<iso>", "to": "<iso>", "tools": ["Bash"], "why": "..."}]}, ...]

`private_windows` is optional: it leaves out the listed tools' calls in a time range,
with one note in their place.

Each session becomes logs/<label>.jsonl (redacted records) and logs/<label>.md
(turn-numbered and readable), and logs/INDEX.md lists them all.

What is kept is an allowlist: user prompts, assistant text, tool calls and tool
results. Thinking, images, system reminders, prompt snapshots and every other
record type are dropped. A crew agent forked from the main session repeats the
main session's history, so any record already exported is skipped.

Redaction runs over every string that is written: API keys and tokens, signed
Kopi tokens, emails, Singapore and US phone numbers, private IPs, home and temp
paths, GeBIZ contact blocks, the literal values in data/secrets/*.json, and a local
list of personal strings (data/secrets/personal-strings.txt, one per line: `re:` for
a regex, `=> x` for a replacement, `omit:` for a regex naming calls to leave out
entirely). After redaction every output is checked again, and the export refuses to
write anything if a secret or personal string survived.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

RESULT_LIMIT = 3000  # chars of a tool result kept in the JSONL
INPUT_LIMIT = 3000  # chars of any one tool-input string kept in the JSONL
PROMPT_LIMIT = 4000  # chars of an app-generated prompt (build state, crew reports, hooks)
MD_RESULT_LIMIT = 700
MD_INPUT_LIMIT = 1500

# Tools whose results are never exported: mailbox reads, other agents' transcripts
# (exported on their own), schema dumps and skill bodies.
OMIT_RESULTS = {
    "mcp__accounts__request": "mailbox search result omitted",
    "mcp__crew__crew_transcript": "another agent's transcript; see its own log",
    "ToolSearch": "tool schemas loaded",
    "Skill": "skill instructions loaded",
    "mcp__browser__browser_profiles": "the browser profiles and the accounts they are signed into",
    "mcp__browser__browser_network": "the page's network log",
}
# Browser steps answer with the page's whole network log (analytics ids, session ids) beside the
# result; only these keys are kept.
BROWSER_STEPS = {"mcp__browser__browser_act", "mcp__browser__browser_open"}
BROWSER_KEEP = ("result", "url", "title", "downloaded", "closed")
# Tools whose inputs are dropped too (they carry account connection ids).
OMIT_INPUTS = {"mcp__accounts__request"}
# Calls whose OUTPUT is outside this project: other Modal workspaces' resource lists,
# the machine's keys and keychain, and the survey of the raw transcripts that this
# exporter was written from.
OUTSIDE_PROJECT = re.compile(
    r"modal (?:app|secret|volume) list(?![^\n]*kopi)"
    r"|\.ssh\b|security find-"
    r"|kopi-log-sources\.json|kopi-mentions\.txt|\.claude/projects|claude-resume-"
    r"|/logs\b|\blogs/|\*\.jsonl"
)
# Calls that are private in full, input and output: the agent's personal memory and
# another project's private skill.
PRIVATE = re.compile(r"/\.universe/agents/|/brain\b|MEMORY\.md|/\.claude/skills/|data/secrets|personal-strings")
MODAL_SECRETS_TABLE = re.compile(r"Secrets\s*\n\s*┏")
PRIVACY_SCAN_HITS = 3  # a block naming this many personal strings is the privacy scan itself

SYSTEM_REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>\s*", re.S)
COMPACT_SUMMARY = "This session is being continued from a previous conversation"
# Prompts the app writes into the conversation, with the short name the log gives each.
APP_PROMPTS = [
    (re.compile(r"^\s*(?:New in this workspace|<software-factory)"), "build state"),
    (re.compile(r"^\s*(?:\d+ new messages? from your crew|New message from your crew)"), "crew report"),
    (re.compile(r"^\s*<crew-watch>"), "crew watch"),
    (re.compile(r"^\s*Stop hook feedback"), "stop hook"),
    (re.compile(r"^\s*<task-notification>"), "subagent finished"),
    (re.compile(r"^\s*Base directory for this skill"), "skill loaded"),
]
APP_THEN_USER = "</software-factory>\n\n---\n\n"  # the app's build state, then the person's own message
IMAGE_NOTE = re.compile(r"^\[Image: original \d+x\d+")

EMAIL = re.compile(r"(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b")
EMAIL_ALLOWED = re.compile(r"^(?:noreply@anthropic\.com|git@github\.com|[^@]+@(?:[\w-]+\.)*example(?:\.[a-z]+)*)$", re.I)

PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # GeBIZ notice contact blocks: officer names, emails and phones. Kopi drops these at
    # parse time; the discovery probes printed raw pages before that parser existed.
    (
        re.compile(
            r"(WHO TO CONTACT|CONTACT PERSON'S DETAILS)[\s\S]{0,1500}?"
            r"(?=ITEMS TO|AWARDING AGENCY|OTHER INFORMATION|\Z)"
        ),
        r"\1\n[contact details removed]\n",
    ),
    (re.compile(r"sk-ant-[A-Za-z0-9_-]{8,}"), "[api-key]"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"), "[api-key]"),
    (re.compile(r"\bgh[opsu]_[A-Za-z0-9]{20,}|\bgithub_pat_\w{20,}"), "[github-token]"),
    (re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"), "[slack-token]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[aws-key]"),
    (re.compile(r"\bhf_[A-Za-z0-9]{20,}"), "[hf-token]"),
    (re.compile(r"\ba[ks]-[A-Za-z0-9]{16,}"), "[modal-token]"),
    (re.compile(r"\beyJ[\w-]{8,}\.[\w-]{8,}(?:\.[\w-]+)?"), "[token]"),
    (re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}"), r"\1 [token]"),
    (
        re.compile(r"\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|ACCESS_CODES?)[A-Z0-9_]*)=([\"']?)[^\s\"'$<>{}()]{8,}\2"),
        r"\1=\2[secret]\2",
    ),
    (
        re.compile(r"(\"(?:api_?key|apiKey|token|secret|password|access_code)\"\s*:\s*\")[^\"]{8,}(\")"),
        r"\1[secret]\2",
    ),
    (re.compile(r"\+65[\s-]?[3689]\d{3}[\s-]?\d{4}\b"), "[phone]"),
    (re.compile(r"(?<![\w.,/$:-])[3689]\d{3}[\s-]\d{4}(?![\w.,/-])"), "[phone]"),
    (re.compile(r"(?<![\w.,/$:#-])[3689]\d{7}(?![\w.,/-])"), "[phone]"),
    (re.compile(r"(?<![\w.,/$:-])(?:\+1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-][2-9]\d{2}[\s.-]\d{4}(?![\w.-])"), "[phone]"),
    (re.compile(r"\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b"), "[local-ip]"),
    (re.compile(r"/Users/[^/\s\"'`]+"), "~"),
    (re.compile(r"(?:/private)?/var/folders/[\w-]+/[\w-]+/T"), "$TMPDIR"),
]
HIGH_ENTROPY = re.compile(r"(?<![\w-])[A-Za-z0-9_+=-]{32,}(?![\w-])")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _entropy(text: str) -> float:
    counts = Counter(text)
    return -sum(n / len(text) * math.log2(n / len(text)) for n in counts.values())


def _entropy_secret(match: re.Match[str]) -> str:
    """A safety net for keys no pattern knows: long, mixed-case, digits, no words in it."""
    token = match.group(0)
    looks_random = (
        re.search(r"[A-Z]", token)
        and re.search(r"[a-z]", token)
        and re.search(r"\d", token)
        and not UUID.match(token)
        and "--" not in token  # Modal hostnames and CLI flags
        and len(re.findall(r"[-_]", token)) <= 3  # identifiers like j_idt180_searchBar_INPUT
        and not re.search(r"[a-z]{7,}|[A-Z]{7,}", token)  # a word: a filename, not a key
        and _entropy(token) >= 4.0
    )
    return "[secret]" if looks_random else token


@dataclass
class Redactor:
    secrets: list[str] = field(default_factory=list)
    personal: list[tuple[re.Pattern[str], str]] = field(default_factory=list)
    private_calls: list[re.Pattern[str]] = field(default_factory=list)  # "omit:" lines

    def is_private(self, text: str) -> bool:
        return bool(PRIVATE.search(text)) or any(p.search(text) for p in self.private_calls)

    @classmethod
    def load(cls, secrets_dir: Path | None, personal_file: Path | None) -> Redactor:
        secrets: list[str] = []
        if secrets_dir and secrets_dir.is_dir():
            for path in sorted(secrets_dir.glob("*.json")):
                secrets.extend(_string_leaves(json.loads(path.read_text())))
        personal: list[tuple[re.Pattern[str], str]] = []
        private_calls: list[re.Pattern[str]] = []
        if personal_file and personal_file.is_file():
            for line in personal_file.read_text().splitlines():
                if line.startswith("omit:"):
                    private_calls.append(re.compile(line[5:].strip(), re.I))
                elif rule := parse_personal(line):
                    personal.append(rule)
        # Longest first, so a key never survives as a suffix of a shorter one.
        return cls(sorted({s for s in secrets if len(s) >= 6}, key=len, reverse=True), personal, private_calls)

    def personal_hits(self, text: str) -> int:
        """Hits of the plain personal strings (not names or client terms with their own replacement)."""
        return sum(len(pattern.findall(text)) for pattern, repl in self.personal if repl == "[personal]")

    def __call__(self, text: str) -> str:
        for value in self.secrets:
            text = text.replace(value, "[secret]")
        for pattern, replacement in self.personal:
            text = pattern.sub(replacement, text)
        for pattern, replacement in PATTERNS:
            text = pattern.sub(replacement, text)
        text = EMAIL.sub(lambda m: m.group(0) if EMAIL_ALLOWED.match(m.group(0)) else "[email]", text)
        return HIGH_ENTROPY.sub(_entropy_secret, text)

    def leaks(self, text: str) -> list[str]:
        """What a redacted text still contains that must never be published."""
        found = [f"secret literal ({len(v)} chars)" for v in self.secrets if v in text]
        found += [f"personal string /{p.pattern}/" for p, _ in self.personal if p.search(text)]
        found += [f"email {m.group(0)!r}" for m in EMAIL.finditer(text) if not EMAIL_ALLOWED.match(m.group(0))]
        for pattern, label in (
            (r"sk-ant-[A-Za-z0-9_-]{8,}", "anthropic key"),
            (r"\bgh[opsu]_[A-Za-z0-9]{20,}", "github token"),
            (r"\bAKIA[0-9A-Z]{16}\b", "aws key"),
            (r"\beyJ[\w-]{8,}\.[\w-]{8,}", "signed token"),
            (r"/Users/[a-z]", "home path"),
        ):
            if re.search(pattern, text):
                found.append(label)
        return found


def parse_personal(line: str) -> tuple[re.Pattern[str], str] | None:
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    term, _, replacement = line.partition("=>")
    term, replacement = term.strip(), (replacement.strip() or "[personal]")
    if term.startswith("re:"):
        return re.compile(term[3:].strip(), re.I), replacement
    left = r"\b" if term[0].isalnum() else ""
    right = r"\b" if term[-1].isalnum() else ""
    return re.compile(left + re.escape(term) + right, re.I), replacement


def _string_leaves(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [s for v in value.values() for s in _string_leaves(v)]
    if isinstance(value, list):
        return [s for v in value for s in _string_leaves(v)]
    return []


def clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    head, tail = text[: int(limit * 0.75)], text[-(limit - int(limit * 0.75)) :]
    # Cut on whitespace, so no word (or name) is left half-shown at either edge.
    if (space := max(head.rfind(" "), head.rfind("\n"))) > len(head) - 80:
        head = head[:space]
    if -1 < (space := min((i for i in (tail.find(" "), tail.find("\n")) if i >= 0), default=-1)) < 80:
        tail = tail[space + 1 :]
    return f"{head}\n[… {len(text) - len(head) - len(tail):,} chars cut …]\n{tail}"


def result_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, dict) and block.get("type") == "image":
                parts.append("[image omitted]")
        return "\n".join(parts)
    return json.dumps(content, ensure_ascii=False)


def redact_value(value: object, redact: Redactor) -> object:
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {k: redact_value(v, redact) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_value(v, redact) for v in value]
    return value


def slim_browser_result(text: str) -> str:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return text
    if not isinstance(data, dict):
        return text
    return json.dumps({k: data[k] for k in BROWSER_KEEP if k in data}, ensure_ascii=False)


def clip_input(value: object) -> object:
    if isinstance(value, str):
        return clip(value, INPUT_LIMIT)
    if isinstance(value, dict):
        return {k: clip_input(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clip_input(v) for v in value]
    return value


@dataclass
class Session:
    label: str
    title: str
    events: list[dict]
    skipped_shared: int
    tokens: Counter
    model: str


def in_window(time: str, windows: list[dict]) -> dict | None:
    return next((w for w in windows if w["from"] <= time <= w.get("to", "9999")), None)


def convert(
    records: list[dict], seen: set[str], redact: Redactor, label: str, title: str, windows: list[dict] | None = None
) -> Session:
    """Turn raw transcript records into redacted events, skipping records already exported.

    `windows` ({"from", "to", "tools", "why"}) omit the listed tools' calls and results between two
    timestamps, leaving one note: used for the privacy review of the raw transcripts, whose shell
    output is, by its nature, the private material being removed.
    """
    windows = windows or []
    noted: set[int] = set()
    events: list[dict] = []
    tool_names: dict[str, str] = {}
    tool_outside: set[str] = set()
    usage_seen: defaultdict[str, Counter] = defaultdict(Counter)
    models: Counter = Counter()
    skipped = 0

    def scrub(text: str) -> str:
        if redact.personal_hits(text) >= PRIVACY_SCAN_HITS:
            return "[omitted: the privacy scan of the raw transcripts, which names the personal strings it looks for]"
        return redact(text)

    for record in records:
        if record.get("type") not in ("user", "assistant"):
            continue
        uuid = record.get("uuid")
        if uuid and uuid in seen:
            skipped += 1
            continue
        if uuid:
            seen.add(uuid)
        message = record.get("message") or {}
        role = message.get("role") or record["type"]
        time = record.get("timestamp", "")
        content = message.get("content")
        blocks = [{"type": "text", "text": content}] if isinstance(content, str) else (content or [])

        if role == "assistant":
            model = message.get("model")
            if model and not model.startswith("<"):
                models[model] += 1
            usage = message.get("usage") or {}
            message_id = message.get("id") or uuid
            # One API message is written as several records; keep the largest (final) count for each.
            for key in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
                usage_seen[message_id][key] = max(usage_seen[message_id][key], int(usage.get(key) or 0))

        for block in blocks:
            if not isinstance(block, dict):
                continue
            kind = block.get("type")
            window = in_window(time, windows) if kind in ("tool_use", "tool_result") else None
            tool = block.get("name") if kind == "tool_use" else tool_names.get(block.get("tool_use_id", ""), "?")
            if window and tool in window.get("tools", ["Bash"]):
                if kind == "tool_use":
                    tool_names[block.get("id", "")] = tool
                    window["omitted"] = window.get("omitted", 0) + 1
                if id(window) not in noted:
                    noted.add(id(window))
                    events.append({"time": time, "kind": "note", "text": window.get("why", "calls omitted"), "window": window})
                continue
            if kind == "text":
                text = SYSTEM_REMINDER.sub("", block.get("text", "")).strip()
                if not text:
                    continue
                if role == "user" and (record.get("isCompactSummary") or text.startswith(COMPACT_SUMMARY)):
                    events.append({"time": time, "kind": "compacted"})
                    continue
                if role == "user" and IMAGE_NOTE.match(text):
                    continue
                source = next((name for pattern, name in APP_PROMPTS if pattern.match(text)), None) if role == "user" else None
                if source == "skill loaded":
                    skill = re.search(r"Base directory for this skill: \S*/([^/\s]+)", text)
                    events.append({"time": time, "kind": "app", "source": source,
                                   "text": f"[skill instructions loaded: {skill.group(1) if skill else 'skill'}]"})
                    continue
                if source:
                    app_text, _, own = text.rpartition(APP_THEN_USER) if APP_THEN_USER in text else (text, "", "")
                    if APP_THEN_USER in text:
                        app_text += "</software-factory>"
                    events.append({"time": time, "kind": "app", "source": source, "text": scrub(clip(app_text, PROMPT_LIMIT))})
                    if own.strip():
                        events.append({"time": time, "kind": "user", "text": scrub(own.strip())})
                    continue
                events.append({"time": time, "kind": "user" if role == "user" else "assistant", "text": scrub(text)})
            elif kind == "tool_use":
                name = block.get("name", "?")
                tool_names[block.get("id", "")] = name
                raw_input = block.get("input") or {}
                dumped = json.dumps(raw_input, ensure_ascii=False)
                private = redact.is_private(dumped)
                if OUTSIDE_PROJECT.search(dumped) or private:
                    tool_outside.add(block.get("id", ""))
                if private:
                    shown: object = {"omitted": "reads or writes the agent's private memory, outside this project"}
                elif name in OMIT_INPUTS:
                    shown = {"omitted": "account request"}
                elif redact.personal_hits(dumped) >= PRIVACY_SCAN_HITS:
                    shown = {"omitted": "the privacy scan of the raw transcripts, which names the personal strings it looks for"}
                else:
                    shown = redact_value(clip_input(raw_input), redact)
                events.append({"time": time, "kind": "tool_use", "tool": name, "id": block.get("id"), "input": shown})
            elif kind == "tool_result":
                tool_id = block.get("tool_use_id", "")
                name = tool_names.get(tool_id, "?")
                if name in OMIT_RESULTS:
                    text = f"[omitted: {OMIT_RESULTS[name]}]"
                elif tool_id in tool_outside or MODAL_SECRETS_TABLE.search(result_text(block.get("content"))):
                    text = "[omitted: output lists resources outside this project]"
                elif name in BROWSER_STEPS:
                    text = scrub(clip(slim_browser_result(result_text(block.get("content"))), RESULT_LIMIT))
                else:
                    text = scrub(clip(result_text(block.get("content")), RESULT_LIMIT))
                events.append(
                    {
                        "time": time,
                        "kind": "tool_result",
                        "tool": name,
                        "id": tool_id,
                        "error": bool(block.get("is_error")),
                        "text": text,
                    }
                )
            # thinking, redacted_thinking, image and anything else are dropped
    for event in events:
        if event["kind"] == "note" and "window" in event:
            window = event.pop("window")
            event["text"] = f"[{window.get('omitted', 0)} {'/'.join(window.get('tools', ['Bash']))} calls omitted: {event['text']}]"
    tokens = sum(usage_seen.values(), Counter())
    model = models.most_common(1)[0][0] if models else ""
    return Session(label, title, events, skipped, tokens, model)


def fence(text: str) -> str:
    ticks = "````" if "```" in text else "```"
    return f"{ticks}\n{text}\n{ticks}"


def quote(text: str) -> str:
    return "\n".join("> " + line if line else ">" for line in text.splitlines())


def hhmm(stamp: str) -> str:
    try:
        return datetime.fromisoformat(stamp.replace("Z", "+00:00")).strftime("%d %b %H:%M UTC")
    except ValueError:
        return stamp


def tool_summary(event: dict) -> str:
    name, data = event["tool"], event["input"]
    if not isinstance(data, dict):
        return f"**{name}**"
    if name == "Bash":
        head = f"**Bash** — {data.get('description', '')}".rstrip(" —")
        return head + "\n\n" + fence(clip(str(data.get("command", "")), MD_INPUT_LIMIT))
    if name in ("Read", "Write", "Edit", "NotebookEdit"):
        return f"**{name}** `{data.get('file_path', '')}`"
    if name in ("Agent", "mcp__crew__crew_spawn"):
        prompt = str(data.get("prompt") or data.get("brief") or "")
        return f"**{name}** — {data.get('description', '')}\n\n" + quote(clip(prompt, MD_INPUT_LIMIT))
    compact = json.dumps(data, ensure_ascii=False)
    return f"**{name}** `{clip(compact, 400)}`"


def render_markdown(session: Session) -> str:
    events = session.events
    tools = Counter(e["tool"] for e in events if e["kind"] == "tool_use")
    times = [e["time"] for e in events if e.get("time")]
    lines = [
        f"# {session.title}",
        "",
        f"`{session.label}` · model {session.model or 'unknown'} · "
        f"{sum(1 for e in events if e['kind'] == 'assistant')} assistant messages · "
        f"{sum(tools.values())} tool calls" + (f" · {hhmm(times[0])} → {hhmm(times[-1])}" if times else ""),
        "",
        "Redacted export: thinking, images, system reminders and mailbox results are removed; "
        "secrets, emails, phone numbers and home paths are masked; long tool output is cut.",
    ]
    if session.skipped_shared:
        lines += ["", f"This agent was forked from an earlier session; the {session.skipped_shared} messages it "
                  "shares with that session are in that session's log and are not repeated here."]
    turn = 0
    for i, event in enumerate(events):
        kind = event["kind"]
        following = events[i + 1] if i + 1 < len(events) else {}
        if kind == "user" and i and events[i - 1]["kind"] == "app" and events[i - 1]["time"] == event["time"]:
            lines += ["", quote(event["text"])]  # the person's message under the build state it arrived with
        elif kind in ("user", "app", "compacted"):
            turn += 1
            with_own = kind == "app" and following.get("kind") == "user" and following.get("time") == event["time"]
            who = "Teddy" if kind == "user" or with_own else (
                "context compacted" if kind == "compacted" else f"Universe ({event.get('source', 'app')})"
            )
            lines += ["", "---", "", f"## Turn {turn} · {who} · {hhmm(event['time'])}", ""]
            if kind == "compacted":
                lines.append("_The conversation was summarised to free context; the summary is not reproduced._")
            elif kind == "app":
                lines += [f"<details><summary>Universe {event.get('source', 'prompt')}</summary>", "",
                          fence(clip(event["text"], MD_INPUT_LIMIT)), "", "</details>"]
            else:
                lines.append(quote(event["text"]))
        elif kind == "assistant":
            lines += ["", event["text"]]
        elif kind == "note":
            lines += ["", f"_{event['text']}_"]
        elif kind == "tool_use":
            lines += ["", "- " + tool_summary(event).replace("\n", "\n  ")]
        elif kind == "tool_result":
            text = clip(event["text"], MD_RESULT_LIMIT).strip()
            if text:
                label = "error" if event["error"] else "result"
                lines += ["", f"  <details><summary>{label}</summary>", "", "  " + fence(text).replace("\n", "\n  "),
                          "", "  </details>"]
    return "\n".join(lines) + "\n"


def render_index(sessions: list[Session]) -> str:
    lines = [
        "# Agent session logs",
        "",
        "Every Claude Code session that built Kopi, exported by `scripts/export_logs.py`. Each has a "
        "readable `.md` (turn-numbered) and a redacted `.jsonl` (one event per line: `user`, `app`, "
        "`assistant`, `tool_use`, `tool_result`, `compacted`, `note`).",
        "",
        "| Log | Who | Model | Turns | Assistant messages | Tool calls | Output tokens | Span (UTC) |",
        "|---|---|---|---:|---:|---:|---:|---|",
    ]
    for s in sessions:
        turns = sum(1 for e in s.events if e["kind"] in ("user", "app", "compacted"))
        messages = sum(1 for e in s.events if e["kind"] == "assistant")
        calls = sum(1 for e in s.events if e["kind"] == "tool_use")
        times = [e["time"] for e in s.events if e.get("time")]
        span = f"{hhmm(times[0])} → {hhmm(times[-1])}" if times else ""
        lines.append(
            f"| [{s.label}]({s.label}.md) | {s.title} | {s.model} | {turns} | {messages} | {calls} | "
            f"{s.tokens['output_tokens']:,} | {span} |"
        )
    lines += [
        "",
        "## What was removed, and why",
        "",
        "- **Kept (allowlist):** prompts, assistant text, tool calls and tool results. Thinking, images, "
        "system reminders, prompt snapshots and harness bookkeeping records are dropped.",
        "- **Masked everywhere:** API keys and tokens, signed Kopi tokens, emails, Singapore and US phone "
        "numbers, home and temp paths, the literal values of every local secret file, and a local list of "
        "personal strings. GeBIZ contact blocks (officer names, emails, phones) are removed; Kopi itself drops "
        "them at parse time.",
        "- **Omitted results:** mailbox searches, other agents' transcripts (each has its own log), resource "
        "lists from Modal workspaces other than Kopi's, and anything read from outside the project.",
        "- **Cut:** a tool result keeps its first and last lines up to 3,000 characters here and 700 in the `.md`.",
        "- **Forked agents:** a crew agent starts from a copy of the main session; shared messages appear once.",
        "- **Privacy review:** while these logs were being cleaned, the shell calls that read the raw transcripts "
        "printed the very material being removed, so they are omitted and a note marks the gap. The exporter and "
        "its tests are in `scripts/export_logs.py` and `backend/tests/test_export_logs.py`.",
        "- The export refuses to write if any secret literal, personal string, unmasked email, key pattern or "
        "home path survives redaction.",
    ]
    return "\n".join(lines) + "\n"


def export(manifest: list[dict], out: Path, redact: Redactor) -> list[Session]:
    seen: set[str] = set()
    sessions: list[Session] = []
    for entry in manifest:
        path = Path(entry["path"]).expanduser()
        records = []
        for line in path.read_text(errors="replace").splitlines():
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        sessions.append(
            convert(records, seen, redact, entry["label"], entry.get("title", entry["label"]), entry.get("private_windows"))
        )

    rendered: dict[str, str] = {"INDEX.md": render_index(sessions)}
    for s in sessions:
        rendered[f"{s.label}.jsonl"] = "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in s.events)
        rendered[f"{s.label}.md"] = render_markdown(s)

    # Check what a reader sees: decoded strings for the JSONL, the text itself for Markdown.
    checked = {name: text for name, text in rendered.items() if not name.endswith(".jsonl")}
    for s in sessions:
        checked[f"{s.label}.jsonl"] = "\n".join(_string_leaves(s.events))
    problems = {name: redact.leaks(text) for name, text in checked.items()}
    problems = {name: found for name, found in problems.items() if found}
    if problems:
        detail = "; ".join(f"{name}: {', '.join(sorted(set(found)))}" for name, found in problems.items())
        raise SystemExit(f"refusing to write logs, redaction missed something: {detail}")

    out.mkdir(parents=True, exist_ok=True)
    for name, text in rendered.items():
        (out / name).write_text(text)
    return sessions


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--manifest", type=Path, default=Path("data/log-sources.json"))
    parser.add_argument("--out", type=Path, default=Path("logs"))
    parser.add_argument("--secrets-dir", type=Path, default=Path("data/secrets"))
    parser.add_argument("--personal", type=Path, default=None, help="default: <secrets-dir>/personal-strings.txt")
    args = parser.parse_args(argv)
    redact = Redactor.load(args.secrets_dir, args.personal or args.secrets_dir / "personal-strings.txt")
    sessions = export(json.loads(args.manifest.read_text()), args.out, redact)
    for s in sessions:
        print(f"{s.label}: {len(s.events)} events, {s.skipped_shared} shared skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
