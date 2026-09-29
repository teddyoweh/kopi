"""scripts/export_logs.py: redaction, the leak gate, and the export of a synthetic session."""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "export_logs.py"
spec = importlib.util.spec_from_file_location("export_logs", SCRIPT)
export_logs = importlib.util.module_from_spec(spec)
sys.modules["export_logs"] = export_logs
spec.loader.exec_module(export_logs)

# Built from pieces so no token-shaped literal sits in the repo.
ANTHROPIC_KEY = "sk-" + "ant-oat01-" + "Zx9" * 12
GITHUB_TOKEN = "gh" + "p_" + "a1B2" * 9
AWS_KEY = "AK" + "IA" + "ABCDEFGHIJKLMNOP"
KOPI_TOKEN = "ey" + "JzdWIiOiJ3ZWIiLCJzY29wZSI6ImFwcCJ9" + "." + "Qm9ndXNTaWduYXR1cmVGb3JUZXN0cw"
ACCESS_CODE = "kopi-" + "7f3q9z"
NEEDLE_KEY = "nd_" + "w" * 20 + "Q7" * 10


@pytest.fixture
def redact(tmp_path) -> export_logs.Redactor:
    secrets = tmp_path / "secrets"
    secrets.mkdir()
    (secrets / "app.json").write_text(json.dumps({"access_code": ACCESS_CODE}))
    (secrets / "needledb-keys.json").write_text(json.dumps({"write": NEEDLE_KEY}))
    personal = secrets / "personal-strings.txt"
    personal.write_text(
        "# local only\n"
        "PELICAN-4\n"
        "re:you're in Lisbon[^.]*\n"
        "Acme Corp => [client]\n"
        "JANE Q OFFICER => [name]\n"
        "omit: acme-internal-playbook\n"
    )
    return export_logs.Redactor.load(secrets, personal)


@pytest.mark.parametrize(
    "raw, gone, kept",
    [
        (f"export ANTHROPIC={ANTHROPIC_KEY}", ANTHROPIC_KEY, "[api-key]"),
        (f"token {GITHUB_TOKEN} pushed", GITHUB_TOKEN, "[github-token]"),
        (f"aws {AWS_KEY}", AWS_KEY, "[aws-key]"),
        (f"Authorization: Bearer {KOPI_TOKEN}", KOPI_TOKEN, "Bearer [token]"),
        (f"curl -H 'x: {KOPI_TOKEN}'", KOPI_TOKEN, "[token]"),
        ("KOPI_SIGNING_KEY=abcd1234efgh5678 uv run", "abcd1234efgh5678", "KOPI_SIGNING_KEY=[secret]"),
        ('{"access_code": "open-sesame-123"}', "open-sesame-123", '"access_code": "[secret]"'),
        (f"code is {ACCESS_CODE}", ACCESS_CODE, "[secret]"),
        (f"key={NEEDLE_KEY}", NEEDLE_KEY, "[secret]"),
        ("mail jane.tan@agency.gov.sg now", "jane.tan@agency.gov.sg", "[email]"),
        ("call +65 6123 4567", "6123 4567", "[phone]"),
        ("tel 69706484 fax", "69706484", "[phone]"),
        ("us (410) 555-0199", "555-0199", "[phone]"),
        ("cd /Users/someone/Documents/codes/kopi", "/Users/someone", "~/Documents/codes/kopi"),
        ("at /var/folders/ms/1bbr5dw92njf9g4hhx7bzy6m0000gn/T/x", "/var/folders", "$TMPDIR/x"),
        ("secret aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3z", "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3z", "[secret]"),
        ("the PELICAN-4 word", "PELICAN-4", "[personal]"),
        ("Due Thu. You're in Lisbon 2-4 May and back late. Fine.", "Lisbon", "[personal]"),
        ("it belongs to Acme Corp.", "Acme Corp", "[client]"),
    ],
)
def test_redacts(redact, raw, gone, kept):
    out = redact(raw)
    assert gone not in out
    assert kept in out


@pytest.mark.parametrize(
    "text",
    [
        "commit 08ca0f8b32723faa06f50b32723faa06f50b3272 merged",
        "session 7142f416-4f85-496d-ae13-524a650d7452",
        "MOE000ETQ26000222 closes 30 Sep 2026, 13:00 SGT",
        "12,052 tenders; $1,234,567.00 awarded; 2026-09-29T04:12:00Z",
        'token = header.removeprefix("Bearer ").strip()',
        "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
        "fixture contact procurement@agency.example.sg",
        "https://kryptonairc-lc--kopi-api.modal.run/health",
        "d_acde1106003906a75c3fa052592f2fcb",
        "CLAUDE_CODE_OAUTH_TOKEN=<paste the token>",
    ],
)
def test_leaves_ordinary_text_alone(redact, text):
    assert redact(text) == text


def test_contact_block_removed(redact):
    page = (
        "WHO TO CONTACT\nPRIMARY\nJANE Q OFFICER\nj.officer@school.edu.sg\n69706484\n"
        "AWARDING AGENCY\nA School\nITEMS TO RESPOND\n1. Cleaning"
    )
    out = redact(page)
    assert "JANE Q OFFICER" not in out and "69706484" not in out and "school.edu.sg" not in out
    assert "[contact details removed]" in out
    assert "AWARDING AGENCY" in out and "Cleaning" in out


def test_leak_gate_names_what_survived(redact):
    assert redact.leaks(redact(f"{ACCESS_CODE} PELICAN-4 a@b.com /Users/x {ANTHROPIC_KEY}")) == []
    found = redact.leaks(f"{ACCESS_CODE} PELICAN-4 a@b.com /Users/x {ANTHROPIC_KEY}")
    assert any("secret literal" in f for f in found)
    assert any("personal" in f for f in found)
    assert "email 'a@b.com'" in found
    assert "home path" in found and "anthropic key" in found


def _write(path: Path, records: list[dict]) -> Path:
    path.write_text("".join(json.dumps(r) + "\n" for r in records))
    return path


def _msg(uuid, role, content, **extra):
    return {"type": role, "uuid": uuid, "timestamp": "2026-09-29T04:00:00Z", "message": {"role": role, "content": content}, **extra}


def test_export_synthetic_sessions(redact, tmp_path):
    main_records = [
        {"type": "attachment", "attachment": {"type": "prompt_snapshot", "text": "PELICAN-4 memory"}},
        _msg("u1", "user", "Build the tender copilot.<system-reminder>PELICAN-4 lives here</system-reminder>"),
        _msg(
            "a1",
            "assistant",
            [
                {"type": "thinking", "thinking": "private reasoning about PELICAN-4"},
                {"type": "text", "text": "Plan: scrape GeBIZ, then embed."},
                {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": f"echo {ANTHROPIC_KEY}", "description": "Echo"}},
                {"type": "tool_use", "id": "t2", "name": "mcp__accounts__request", "input": {"connection_id": "abc", "query": "q=x"}},
                {"type": "tool_use", "id": "t3", "name": "Bash", "input": {"command": "modal secret list", "description": "List"}},
            ],
            **{"message": {"role": "assistant", "id": "m1", "model": "claude-opus-5-5", "usage": {"output_tokens": 50}, "content": [
                {"type": "thinking", "thinking": "private reasoning about PELICAN-4"},
                {"type": "text", "text": "Plan: scrape GeBIZ, then embed."},
                {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": f"echo {ANTHROPIC_KEY}", "description": "Echo"}},
                {"type": "tool_use", "id": "t2", "name": "mcp__accounts__request", "input": {"connection_id": "abc", "query": "q=x"}},
                {"type": "tool_use", "id": "t3", "name": "Bash", "input": {"command": "modal secret list", "description": "List"}},
            ]}},
        ),
        _msg(
            "u2",
            "user",
            [
                {"type": "tool_result", "tool_use_id": "t1", "content": ANTHROPIC_KEY + "\n" + "x" * 5000},
                {"type": "tool_result", "tool_use_id": "t2", "content": "From: someone@gmail.com Subject: secret"},
                {"type": "tool_result", "tool_use_id": "t3", "content": "github-token  aws-credentials"},
                {"type": "image", "source": {"data": "iVBOR"}},
            ],
        ),
        _msg("u3", "user", "This session is being continued from a previous conversation. PELICAN-4 ..."),
        _msg("u4", "user", '<software-factory build="kopi">' + "state " * 2000),
    ]
    crew_records = main_records[1:3] + [_msg("c1", "assistant", [{"type": "text", "text": "Reviewing KP-1."}])]
    manifest = [
        {"label": "01-main", "title": "Main agent", "path": str(_write(tmp_path / "main.jsonl", main_records))},
        {"label": "02-review", "title": "Reviewer", "path": str(_write(tmp_path / "crew.jsonl", crew_records))},
    ]
    out = tmp_path / "logs"
    sessions = export_logs.export(manifest, out, redact)

    everything = "".join(p.read_text() for p in out.iterdir())
    for leaked in ("PELICAN-4", ANTHROPIC_KEY, "private reasoning", "someone@gmail.com", "aws-credentials", "abc", "iVBOR"):
        assert leaked not in everything

    events = [json.loads(line) for line in (out / "01-main.jsonl").read_text().splitlines()]
    kinds = [e["kind"] for e in events]
    assert kinds == ["user", "assistant", "tool_use", "tool_use", "tool_use", "tool_result", "tool_result", "tool_result", "compacted", "app"]
    results = [e for e in events if e["kind"] == "tool_result"]
    assert results[0]["text"].startswith("[api-key]") and "chars cut" in results[0]["text"]
    assert results[1]["text"] == "[omitted: mailbox search result omitted]"
    assert results[2]["text"].startswith("[omitted: output lists resources outside")
    assert events[3]["input"] == {"omitted": "account request"}
    assert len(events[-1]["text"]) < export_logs.PROMPT_LIMIT + 100
    assert sessions[0].tokens["output_tokens"] == 50 and sessions[0].model == "claude-opus-5-5"

    # The reviewer forked from main: shared records are skipped, only its own message remains.
    crew = [json.loads(line) for line in (out / "02-review.jsonl").read_text().splitlines()]
    assert [e["text"] for e in crew] == ["Reviewing KP-1."]
    assert sessions[1].skipped_shared == 2

    md = (out / "01-main.md").read_text()
    assert "## Turn 1 · Teddy" in md and "## Turn 2 · context compacted" in md and "## Turn 3 · Universe" in md
    index = (out / "INDEX.md").read_text()
    assert "[01-main](01-main.md)" in index and "[02-review](02-review.md)" in index


def test_export_refuses_when_something_survives(redact, tmp_path, monkeypatch):
    records = [_msg("u1", "user", "hello")]
    manifest = [{"label": "x", "title": "x", "path": str(_write(tmp_path / "s.jsonl", records))}]
    monkeypatch.setattr(export_logs.Redactor, "__call__", lambda self, text: text + " PELICAN-4")
    out = tmp_path / "logs"
    with pytest.raises(SystemExit, match="refusing to write logs"):
        export_logs.export(manifest, out, redact)
    assert not out.exists()


def test_privacy_scan_block_is_omitted(redact):
    session = export_logs.convert(
        [_msg("u1", "user", [{"type": "text", "text": "grep PELICAN-4 PELICAN-4 PELICAN-4"}])],
        set(),
        redact,
        "x",
        "x",
    )
    assert session.events[0]["text"].startswith("[omitted: the privacy scan")


def test_tool_input_redacted_per_string(redact):
    session = export_logs.convert(
        [_msg("a1", "assistant", [{"type": "tool_use", "id": "t", "name": "Bash",
                                   "input": {"command": 'echo "{\\"x\\": 1}" PELICAN-4', "description": "ok"}}])],
        set(), redact, "x", "x",
    )
    assert session.events[0]["input"] == {"command": 'echo "{\\"x\\": 1}" [personal]', "description": "ok"}


def test_app_prompts_split_from_the_persons_message(redact):
    records = [
        _msg("u1", "user", "New in this workspace since your last turn:\n- a.json\n---\n<software-factory>\nstate\n"
                           "</software-factory>\n\n---\n\nI approved the plan — start building."),
        _msg("u2", "user", [{"type": "text", "text": "[Image: original 2880x2016, displayed at 2000x1400.]"}]),
        _msg("u3", "user", [{"type": "text", "text": "Base directory for this skill: /tmp/skills/claude-api\n\n# Long body"}]),
        _msg("u4", "user", "2 new messages from your crew:\n\n@3 Agent 3\n**Verdict: concerns.**"),
    ]
    events = export_logs.convert(records, set(), redact, "x", "x").events
    assert [(e["kind"], e.get("source")) for e in events] == [
        ("app", "build state"), ("user", None), ("app", "skill loaded"), ("app", "crew report")]
    assert events[1]["text"] == "I approved the plan — start building."
    assert events[0]["text"].endswith("</software-factory>")
    assert events[2]["text"] == "[skill instructions loaded: claude-api]"
    md = export_logs.render_markdown(export_logs.Session("x", "x", events, 0, export_logs.Counter(), ""))
    assert "## Turn 1 · Teddy" in md and "## Turn 2 · Universe (skill loaded)" in md
    assert "## Turn 3 · Universe (crew report)" in md


@pytest.mark.parametrize(
    "text",
    ["MOE000ETQ26000222-clarification-questions.md", "contentForm:j_idt180_searchBarList_HIDDEN-SUBMITTED-VALUE"],
)
def test_identifiers_are_not_mistaken_for_keys(redact, text):
    assert redact(text) == text


def test_private_calls_and_outside_listings_are_omitted(redact):
    records = [
        _msg("a1", "assistant", [
            {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "cat >> ~/.universe/agents/x/brain/MEMORY.md"}},
            {"type": "tool_use", "id": "t2", "name": "Bash", "input": {"command": "ls ~/.ssh"}},
            {"type": "tool_use", "id": "t3", "name": "Bash", "input": {"command": "python3 survey.py"}},
        ]),
        _msg("u1", "user", [
            {"type": "tool_result", "tool_use_id": "t1", "content": "note written"},
            {"type": "tool_result", "tool_use_id": "t2", "content": "id_ed25519"},
            {"type": "tool_result", "tool_use_id": "t3", "content": "Secrets\n┏━━━┓\n│ aws-credentials │ 10.0.0.12"},
        ]),
    ]
    events = export_logs.convert(records, set(), redact, "x", "x").events
    assert events[0]["input"]["omitted"].startswith("reads or writes the agent's private memory")
    assert events[1]["input"] == {"command": "ls ~/.ssh"}
    assert all(e["text"].startswith("[omitted") for e in events[3:])
    assert redact("ESTABLISHED 192.168.1.169:52764") == "ESTABLISHED [local-ip]:52764"


def test_private_window_leaves_one_note(redact):
    def at(uuid, stamp, content, role="assistant"):
        record = _msg(uuid, role, content)
        record["timestamp"] = stamp
        return record

    records = [
        at("a1", "2026-09-29T12:00:00Z", [{"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "grep raw"}}]),
        at("u1", "2026-09-29T12:00:01Z", [{"type": "tool_result", "tool_use_id": "t1", "content": "private"}], "user"),
        at("a2", "2026-09-29T12:00:02Z", [{"type": "text", "text": "Found two leaks; fixing."},
                                          {"type": "tool_use", "id": "t2", "name": "Write", "input": {"file_path": "scripts/x.py"}},
                                          {"type": "tool_use", "id": "t3", "name": "Bash", "input": {"command": "grep again"}}]),
        at("a3", "2026-09-29T13:00:00Z", [{"type": "tool_use", "id": "t4", "name": "Bash", "input": {"command": "pytest"}}]),
    ]
    window = {"from": "2026-09-29T11:59:00Z", "to": "2026-09-29T12:30:00Z", "tools": ["Bash"], "why": "privacy review"}
    events = export_logs.convert(records, set(), redact, "x", "x", [window]).events
    assert [e["kind"] for e in events] == ["note", "assistant", "tool_use", "tool_use"]
    assert events[0]["text"] == "[2 Bash calls omitted: privacy review]"
    assert events[2]["tool"] == "Write" and events[3]["input"] == {"command": "pytest"}


def test_omit_rule_hides_a_private_call(redact):
    records = [
        _msg("a1", "assistant", [{"type": "tool_use", "id": "t1", "name": "Bash",
                                   "input": {"command": "cat ~/skills/acme-internal-playbook/SKILL.md"}}]),
        _msg("u1", "user", [{"type": "tool_result", "tool_use_id": "t1", "content": "confidential steps"}]),
    ]
    events = export_logs.convert(records, set(), redact, "x", "x").events
    assert "omitted" in events[0]["input"] and events[1]["text"].startswith("[omitted")
