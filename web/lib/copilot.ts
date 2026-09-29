import { ApiError, type ChatEvent, type Profile } from "./api";

// ---------------------------------------------------------------- conversation model

export type Step = {
  id: number;
  tool: string;
  input: Record<string, unknown>;
  /** The one-line result; undefined while the tool runs. */
  summary?: string;
  failed?: boolean;
};

export type Block = { kind: "text"; text: string } | { kind: "step"; step: Step } | { kind: "file"; name: string };

/** Why a turn did not finish, as one of the states the page designs for. */
export type Problem =
  | { kind: "unavailable"; detail: string }
  | { kind: "turn-cap"; detail: string }
  | { kind: "day-cap"; detail: string }
  | { kind: "rate"; detail: string }
  | { kind: "signed-out"; detail: string }
  | { kind: "expired"; detail: string }
  | { kind: "agent"; detail: string }
  | { kind: "cut-off"; detail: string }
  | { kind: "network"; detail: string };

export type Turn = {
  id: string;
  ask: string;
  blocks: Block[];
  status: "streaming" | "done" | "stopped" | "failed";
  problem?: Problem;
  cost?: number;
};

export type Conversation = {
  session_id: string | null;
  /** The tender the conversation was opened from; sent as `doc_no` on every turn. */
  doc: string | null;
  turns: Turn[];
};

export const EMPTY: Conversation = { session_id: null, doc: null, turns: [] };

export type Action =
  | { type: "reset"; doc: string | null }
  | { type: "start"; turn: Turn }
  | { type: "event"; turnId: string; event: ChatEvent }
  | { type: "end"; turnId: string }
  | { type: "stopped"; turnId: string }
  | { type: "problem"; turnId: string; problem: Problem }
  | { type: "remove"; turnId: string }
  | { type: "doc"; doc: string | null };

function settleSteps(blocks: Block[]): Block[] {
  return blocks.map((b) => (b.kind === "step" && b.step.summary === undefined ? { ...b, step: { ...b.step, summary: "" } } : b));
}

function applyEvent(turn: Turn, event: ChatEvent): Turn {
  const blocks = [...turn.blocks];
  switch (event.type) {
    case "text": {
      if (!event.text) return turn;
      const last = blocks[blocks.length - 1];
      if (last?.kind === "text") blocks[blocks.length - 1] = { kind: "text", text: last.text + event.text };
      else blocks.push({ kind: "text", text: event.text });
      return { ...turn, blocks };
    }
    case "tool_call":
      blocks.push({ kind: "step", step: { id: blocks.length, tool: event.tool ?? "tool", input: event.input ?? {} } });
      return { ...turn, blocks };
    case "tool_result": {
      // Results carry no tool name; each answers the oldest call still waiting.
      const i = blocks.findIndex((b) => b.kind === "step" && b.step.summary === undefined);
      if (i === -1) return turn;
      const summary = event.summary ?? "";
      const step = (blocks[i] as Extract<Block, { kind: "step" }>).step;
      blocks[i] = { kind: "step", step: { ...step, summary, failed: summary.startsWith("Error:") } };
      return { ...turn, blocks };
    }
    case "file":
      if (!event.file || blocks.some((b) => b.kind === "file" && b.name === event.file)) return turn;
      blocks.push({ kind: "file", name: event.file });
      return { ...turn, blocks };
    case "error":
      return { ...turn, status: "failed", problem: { kind: "agent", detail: event.text ?? "" } };
    case "done":
      return {
        ...turn,
        blocks: settleSteps(blocks),
        status: turn.status === "failed" ? "failed" : "done",
        cost: event.cost_usd ?? turn.cost,
      };
    default:
      return turn;
  }
}

function mapTurn(state: Conversation, turnId: string, fn: (turn: Turn) => Turn): Conversation {
  return { ...state, turns: state.turns.map((t) => (t.id === turnId ? fn(t) : t)) };
}

export function reducer(state: Conversation, action: Action): Conversation {
  switch (action.type) {
    case "reset":
      return { ...EMPTY, doc: action.doc };
    case "doc":
      return { ...state, doc: action.doc };
    case "start":
      return { ...state, turns: [...state.turns, action.turn] };
    case "event": {
      const next = mapTurn(state, action.turnId, (t) => applyEvent(t, action.event));
      return !next.session_id && action.event.session_id ? { ...next, session_id: action.event.session_id } : next;
    }
    case "end":
      // The stream closed. Without a `done` the answer was cut off.
      return mapTurn(state, action.turnId, (t) =>
        t.status === "streaming"
          ? { ...t, blocks: settleSteps(t.blocks), status: "failed", problem: { kind: "cut-off", detail: "the stream closed before a done event" } }
          : t,
      );
    case "stopped":
      return mapTurn(state, action.turnId, (t) => (t.status === "streaming" ? { ...t, blocks: settleSteps(t.blocks), status: "stopped" } : t));
    case "problem":
      return mapTurn(state, action.turnId, (t) => ({ ...t, blocks: settleSteps(t.blocks), status: "failed", problem: action.problem }));
    case "remove":
      return { ...state, turns: state.turns.filter((t) => t.id !== action.turnId) };
  }
}

/** A conversation read back from storage: a turn that was streaming when the page went away is marked stopped. */
export function restored(conversation: Conversation): Conversation {
  return {
    ...conversation,
    turns: conversation.turns.map((t) => (t.status === "streaming" ? { ...t, blocks: settleSteps(t.blocks), status: "stopped" } : t)),
  };
}

// ---------------------------------------------------------------- errors as states

export function problemOf(error: unknown): Problem {
  const detail = error instanceof Error ? error.message : String(error);
  if (error instanceof ApiError) {
    if (error.status === 503) return { kind: "unavailable", detail };
    if (error.status === 429) {
      if (/turns/i.test(detail)) return { kind: "turn-cap", detail };
      if (/a day/i.test(detail)) return { kind: "day-cap", detail };
      return { kind: "rate", detail };
    }
    if (error.status === 401 || error.status === 403) return { kind: "signed-out", detail };
    if (error.status === 404) return { kind: "expired", detail };
    if (error.status >= 500) return { kind: "agent", detail };
  }
  return { kind: "network", detail };
}

// ---------------------------------------------------------------- tools in plain words

const str = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const base = (path: unknown) => str(path).split("/").pop() ?? "";

/** A tool call as a person would say it: "Searched open tenders for “CCTV”", or "Searching…" while it runs. */
export function describeStep(tool: string, input: Record<string, unknown>, running: boolean): string {
  const say = (doing: string, done: string) => (running ? doing : done);
  const doc = str(input.doc_no);
  switch (tool) {
    case "search_tenders": {
      const q = str(input.query);
      const days = str(input.closing_within_days);
      const what = `${q ? ` for “${q}”` : ""}${days ? `, closing within ${days} ${days === "1" ? "day" : "days"}` : ""}`;
      return say(`Searching open tenders${what}`, `Searched open tenders${what}`);
    }
    case "get_tender":
      return say(`Reading the notice ${doc}`, `Read the notice ${doc}`).trim();
    case "check_eligibility":
      return say(`Checking eligibility for ${doc}`, `Checked eligibility for ${doc}`).trim();
    case "similar_awards":
      return say("Looking up similar past awards", "Looked up similar past awards");
    case "find_licences": {
      const activity = str(input.activity);
      return say(`Looking up licences${activity ? ` for “${activity}”` : ""}`, `Looked up licences${activity ? ` for “${activity}”` : ""}`);
    }
    case "get_company_profile":
      return say("Reading the company profile", "Read the company profile");
    case "submission_checklist":
      return say(`Building the submission checklist for ${doc}`, `Built the submission checklist for ${doc}`).trim();
    case "Write":
      return say(`Writing a draft, ${base(input.file_path)}`, `Wrote a draft, ${base(input.file_path)}`);
    case "Edit":
      return say(`Editing ${base(input.file_path)}`, `Edited ${base(input.file_path)}`);
    case "Read":
      return say(`Reading ${base(input.file_path)}`, `Read ${base(input.file_path)}`);
    case "Glob":
      return say("Looking through the drafts", "Looked through the drafts");
    default: {
      const name = tool.replace(/^mcp__\w+__/, "").replace(/_/g, " ");
      return say(`Using ${name}`, `Used ${name}`);
    }
  }
}

/** A tool's input as short "key: value" lines for the expanded step; long text is cut. */
export function inputLines(input: Record<string, unknown>): [string, string][] {
  return Object.entries(input).map(([key, value]) => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return [key.replace(/_/g, " "), text.length > 600 ? `${text.slice(0, 600)}… (${text.length.toLocaleString("en-SG")} characters)` : text];
  });
}

// ---------------------------------------------------------------- requests and starters

/** The precise requests behind the tender page's actions; each opens the copilot on that tender. */
export function tenderAsks(doc: string, agency: string, profile: Profile) {
  return {
    clarification:
      `Draft clarification questions for ${doc}. Number them, make each one specific to the notice, and say why the answer matters ` +
      `to ${profile.name} for pricing or compliance. Mark anything only the tender documents can answer as a [placeholder]. ` +
      `Save it as a draft I can send to ${agency} through GeBIZ.`,
    compliance:
      `Draft a compliance matrix for ${doc}: a table with one row per requirement in the notice (items to respond, registrations, ` +
      `licences, envelopes and dates), how ${profile.name} meets it, the evidence to attach, and a status of met, gap or to confirm. ` +
      `Save it as a draft.`,
    checklist:
      `Build the submission checklist for ${doc}: the eligibility gaps to settle first, every document and form to prepare, and each ` +
      `deadline in Singapore time. Save it as a draft.`,
  };
}

export type StarterGroup = { part: string; asks: string[] };

/** Suggested first questions, one group per part of the job. */
export function starters(profile: Profile, doc: string | null): StarterGroup[] {
  if (doc) {
    return [
      { part: "Overview", asks: [`What is ${doc} buying, and how well does it fit ${profile.name}?`] },
      { part: "Permits and licences", asks: [`Which registrations and licences does ${doc} need, and do we hold them?`] },
      { part: "Drafting", asks: [`Draft clarification questions for ${doc}`, `Draft a compliance matrix for ${doc}`] },
      { part: "Submissions", asks: [`What do we need to submit for ${doc}, and by when?`] },
    ];
  }
  return [
    { part: "Overview", asks: [`Find open tenders closing this month that ${profile.name} can bid for`] },
    { part: "Permits and licences", asks: ["Which licences do we need to provide security screening at events?"] },
    { part: "Drafting", asks: ["Draft clarification questions for the best-fitting tender closing this month"] },
    { part: "Submissions", asks: ["Which of our best matches close this week, and what must we submit for each?"] },
  ];
}
