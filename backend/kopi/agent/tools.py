"""Kopi's tools for the copilot, as an in-process MCP server.

The Kopi tools are read-only and go through the Kopi API with the session's short-lived
token, so the agent can see exactly what the signed-in user can see and nothing else.
Notice text comes back inside <notice> delimiters; the system prompt tells the model
that anything inside them is data.

In a bid session two more tools, remember and set_bid_stage, write the bid memory file
in the workspace. The API reads that file back after the turn (see kopi.sandbox).
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, get_args

import httpx
from claude_agent_sdk import create_sdk_mcp_server, tool

from kopi.checklist import checklist_text, submission_checklist
from kopi.models import BidMemory, BidStage, EligibilityCheck, MarketContext, MemoryNote, Notice, Profile

SERVER = "kopi"
NOTE_CHARS = 1000


def mcp_name(name: str) -> str:
    return f"mcp__{SERVER}__{name}"


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"Kopi API answered {status}: {body[:200]}")
        self.status = status


class KopiClient:
    """The Kopi API, as the copilot sees it. Non-2xx answers raise ApiError."""

    def __init__(self, base_url: str, token: str | None, http: httpx.Client | None = None) -> None:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        self.http = http or httpx.Client(base_url=base_url, headers=headers, timeout=60)

    def _get(self, path: str, **params: Any) -> Any:
        return self._json(self.http.get(path, params={k: v for k, v in params.items() if v is not None}))

    def _post(self, path: str, body: dict) -> Any:
        return self._json(self.http.post(path, json=body))

    @staticmethod
    def _json(response) -> Any:
        if response.status_code >= 400:
            raise ApiError(response.status_code, response.text)
        return response.json()

    def search(self, query: str, limit: int, **filters: Any) -> dict:
        return self._get("/search", q=query[:300], limit=limit, **filters)

    def detail(self, doc_no: str, profile: Profile) -> dict:
        return self._post(f"/tenders/{doc_no}/detail", {"profile": profile.model_dump(mode="json")})

    def similar_awards(self, query: str, agency: str | None) -> dict:
        return self._get("/awards/similar", q=query[:300], agency=agency, k=25)

    def licences(self, query: str, limit: int) -> list[dict]:
        return self._get("/licences/search", q=query[:300], limit=limit)


# ---------------------------------------------------------------- formatting for the model


def safe(text: str) -> str:
    """Notice text cannot close its own delimiter."""
    return text.replace("</notice", "&lt;/notice").replace("<notice", "&lt;notice")


def notice_block(notice: Notice) -> str:
    heads = "; ".join(f"{h.code} {h.label} ({h.grade or 'no grade'}, capacity {h.capacity_sgd or 'not stated'})" for h in notice.gra_heads)
    workheads = "; ".join(f"{w.code} {w.grade or ''}".strip() for w in notice.bca_workheads)
    lines = [
        f"Title: {notice.title}",
        f"Agency: {notice.agency}",
        f"Type: {notice.type} · Method: {notice.procurement_method} · Category: {notice.category}",
        f"Published: {notice.published:%d %b %Y} · Closes: {notice.closing:%d %b %Y %H:%M} SGT",
        f"Two envelopes: {_yes_no(notice.two_envelope)} · WTO-GPA: {_yes_no(notice.wto_gpa)}",
        f"GRA supply heads: {heads or 'none named'}",
        f"BCA workheads: {workheads or 'none named'}",
        f"Items to respond: {'; '.join(notice.items) or 'none listed'}",
        f"Description: {notice.description}",
    ]
    return f'<notice doc_no="{notice.doc_no}">\n{safe(chr(10).join(lines))}\n</notice>'


def _yes_no(value: bool | None) -> str:
    return {True: "yes", False: "no", None: "not stated"}[value]


def checks_text(checks: list[EligibilityCheck]) -> str:
    return "\n".join(f"- [{c.status.value}] {c.kind}: {c.requirement}. {c.reason}" for c in checks) or "- no checks"


def money(value: float | None) -> str:
    return f"S${value:,.0f}" if value else "n/a"


def market_text(market: MarketContext | None) -> str:
    if market is None or market.similar_count == 0:
        return "No similar past awards found."
    suppliers = ", ".join(f"{s.supplier} ({s.wins})" for s in market.top_suppliers[:5]) or "none"
    incumbents = ", ".join(f"{s.supplier} ({s.wins})" for s in market.agency_incumbents) or "none"
    examples = "\n".join(f"  - {e.description[:140]} ({e.agency}, {e.year}, {money(e.amount)})" for e in market.examples)
    return (
        f"{market.similar_count} similar past awards; median {money(market.median_amount)}, "
        f"middle half {money(market.p25_amount)}–{money(market.p75_amount)}.\n"
        f"Top suppliers: {suppliers}. This agency's incumbents: {incumbents}.\nExamples:\n{examples}"
    )


# ---------------------------------------------------------------- the server


def _text(body: str) -> dict:
    return {"content": [{"type": "text", "text": body}]}


def _error(message: str) -> dict:
    return {"content": [{"type": "text", "text": message}], "is_error": True}


def _guarded(fn: Callable[[dict], str]) -> Callable[[dict], Any]:
    async def run(args: dict) -> dict:
        try:
            return _text(fn(args))
        except ApiError as error:
            return _error(str(error))
        except httpx.HTTPError as error:
            return _error(f"Kopi API unreachable: {error}")

    return run


def utc_now() -> datetime:
    return datetime.now(UTC)


def build_tools(client: KopiClient, profile: Profile, now: Callable[[], datetime] = utc_now) -> list:
    """Kopi's tools as SdkMcpTools, bound to one API client and one company profile."""

    def search(args: dict) -> str:
        days = args.get("closing_within_days")
        body = client.search(
            args["query"],
            limit=min(int(args.get("limit") or 10), 25),
            category=args.get("category_group") or None,
            closing_before=(now() + timedelta(days=int(days))).isoformat() if days else None,
        )
        rows = [
            f"- {h['notice']['doc_no']} | {h['notice']['title']} | {h['notice']['agency']} | closes {h['notice']['closing'][:10]} | match {h['score']:.2f}"
            for h in body["hits"]
        ]
        return f"{len(rows)} open tenders for '{args['query']}':\n" + ("\n".join(rows) or "none")

    def get_tender(args: dict) -> str:
        detail = client.detail(args["doc_no"], profile)
        notice = Notice.model_validate(detail["notice"])
        checks = [EligibilityCheck.model_validate(c) for c in detail["eligibility"]]
        market = MarketContext.model_validate(detail["market"]) if detail.get("market") else None
        return f"{notice_block(notice)}\n\nEligibility for {profile.name}:\n{checks_text(checks)}\n\nMarket context:\n{market_text(market)}\n\nGeBIZ page: {notice.url}"

    def check_eligibility(args: dict) -> str:
        detail = client.detail(args["doc_no"], profile)
        checks = [EligibilityCheck.model_validate(c) for c in detail["eligibility"]]
        return f"Eligibility of {profile.name} for {args['doc_no']}:\n{checks_text(checks)}"

    def similar_awards(args: dict) -> str:
        return market_text(MarketContext.model_validate(client.similar_awards(args["description"], args.get("agency"))))

    def find_licences(args: dict) -> str:
        found = client.licences(args["activity"], limit=min(int(args.get("limit") or 5), 10))
        rows = [f"- {x['name']} ({x['agency']}): {x.get('description', '')[:160]} Fee: {x.get('fee') or 'n/a'}. Processing: {x.get('processing_time') or 'n/a'}. {x['url']}" for x in found]
        return "\n".join(rows) or "No licences matched."

    def company_profile(_: dict) -> str:
        return json.dumps(profile.model_dump(mode="json"), indent=1)

    def checklist(args: dict) -> str:
        detail = client.detail(args["doc_no"], profile)
        notice = Notice.model_validate(detail["notice"])
        checks = [EligibilityCheck.model_validate(c) for c in detail["eligibility"]]
        return f"Submission checklist for {notice.doc_no}:\n{checklist_text(submission_checklist(notice, checks))}"

    specs = [
        ("search_tenders", "Search open GeBIZ opportunities by meaning. Optional: closing_within_days, category_group (e.g. 'IT&Telecommunication'), limit.",
         {"type": "object", "properties": {"query": {"type": "string"}, "closing_within_days": {"type": "integer"}, "category_group": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["query"]}, search),
        ("get_tender", "Full notice, eligibility for the company, and past-award market context for one tender.",
         {"type": "object", "properties": {"doc_no": {"type": "string"}}, "required": ["doc_no"]}, get_tender),
        ("check_eligibility", "Rule-based eligibility checks (closing, GRA, BCA, licences) for the company on one tender.",
         {"type": "object", "properties": {"doc_no": {"type": "string"}}, "required": ["doc_no"]}, check_eligibility),
        ("similar_awards", "What similar past GeBIZ tenders were awarded for, and to whom.",
         {"type": "object", "properties": {"description": {"type": "string"}, "agency": {"type": "string"}}, "required": ["description"]}, similar_awards),
        ("find_licences", "Singapore licences and permits for an activity (GoBusiness catalogue).",
         {"type": "object", "properties": {"activity": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["activity"]}, find_licences),
        ("get_company_profile", "The company Kopi is working for: capabilities, registrations, licences held.",
         {"type": "object", "properties": {}}, company_profile),
        ("submission_checklist", "What to prepare and submit for one tender, built from the notice by rules.",
         {"type": "object", "properties": {"doc_no": {"type": "string"}}, "required": ["doc_no"]}, checklist),
    ]
    return [tool(name, description, schema)(_guarded(fn)) for name, description, schema, fn in specs]


# ---------------------------------------------------------------- the bid memory


def read_memory(path: Path) -> BidMemory:
    """The bid memory in a workspace; empty before the first note."""
    return BidMemory.model_validate_json(path.read_text()) if path.exists() else BidMemory()


def write_memory(path: Path, memory: BidMemory) -> None:
    """Replace the file whole, so the API never reads half of one while it syncs mid-turn."""
    partial = path.with_suffix(".partial")
    partial.write_text(memory.model_dump_json())
    partial.replace(path)


def build_bid_tools(memory_file: Path, now: Callable[[], datetime] = utc_now) -> list:
    """remember and set_bid_stage, writing the bid memory at memory_file. Kopi's notes are source="kopi"."""

    async def remember(args: dict) -> dict:
        text = " ".join(args["note"].split())
        if not text:
            return _error("The note is empty.")
        memory = read_memory(memory_file)
        if any(note.text == text for note in memory.notes):
            return _text(f"Already remembered: {text}")
        note = MemoryNote(id=uuid.uuid4().hex[:12], text=text, source="kopi", created=now())
        write_memory(memory_file, memory.model_copy(update={"notes": [*memory.notes, note], "updated": note.created}))
        return _text(f"Remembered: {text}")

    async def set_bid_stage(args: dict) -> dict:
        next_step = " ".join(args["next_step"].split())
        if not next_step:
            return _error("Say what the next step is.")
        memory = read_memory(memory_file)
        write_memory(memory_file, memory.model_copy(update={"stage": args["stage"], "next_step": next_step, "updated": now()}))
        return _text(f"Stage: {args['stage']}. Next step: {next_step}")

    return [
        tool("remember", "Save one key fact about this bid to the bid memory, which outlives this conversation. One fact per note, with where it came from.",
             {"type": "object", "properties": {"note": {"type": "string", "minLength": 1, "maxLength": NOTE_CHARS}}, "required": ["note"]})(remember),
        tool("set_bid_stage", "Move the bid to a stage (qualify, clarify, draft, review, submit) and say what the next step is.",
             {"type": "object", "properties": {"stage": {"type": "string", "enum": list(get_args(BidStage))}, "next_step": {"type": "string", "minLength": 1}},
              "required": ["stage", "next_step"]})(set_bid_stage),
    ]


def build_server(client: KopiClient, profile: Profile, memory_file: Path | None = None):
    """The MCP server, and the tool names the agent may call without asking. A bid session passes its memory file."""
    tools = build_tools(client, profile) + (build_bid_tools(memory_file) if memory_file else [])
    return create_sdk_mcp_server(name=SERVER, version="0.1.0", tools=tools), [mcp_name(t.name) for t in tools]
