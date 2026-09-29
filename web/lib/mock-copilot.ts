/**
 * The mock copilot: a scripted turn that streams the same ChatEvents the live runner does
 * (text deltas, tool_call, one-line tool_result, file, done with a cost), shaped by what the
 * person asked. Results are worded like kopi.agent.tools and cut to 160 characters like
 * kopi.agent.runner.summary, so the page is built against realistic strings.
 */
import type { ChatEvent, ChatRequest, ChecklistItem, EligibilityCheck, Licence, MarketContext, Notice, Profile, SearchResponse } from "./api";
import { dateTime, moneyShort, shortDate } from "./format";

export type MockTools = {
  notice(doc: string): Notice;
  search(q: string, limit: number): Promise<SearchResponse>;
  eligibility(doc: string, profile: Profile): Promise<EligibilityCheck[]>;
  checklist(doc: string, profile: Profile): Promise<ChecklistItem[]>;
  similarAwards(q: string, agency?: string): Promise<MarketContext>;
  searchLicences(q: string, limit: number): Promise<Licence[]>;
};

export type Beat = { event: Omit<ChatEvent, "session_id">; pause: number };

const DRAFTS = "/workspace/drafts";
const cut = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= 160 ? flat : `${flat.slice(0, 159)}…`;
};

const statusWord = { met: "met", unmet: "not met", unknown: "unknown" } as const;

function tally(checks: EligibilityCheck[]): string {
  const n = (s: EligibilityCheck["status"]) => checks.filter((c) => c.status === s).length;
  return (["met", "unmet", "unknown"] as const)
    .filter((s) => n(s))
    .map((s) => `${n(s)} ${statusWord[s]}`)
    .join(", ");
}

// ---------------------------------------------------------------- tool results, worded like the live tools

function noticeResult(n: Notice): string {
  const heads = (n.gra_heads ?? []).map((h) => `${h.code} ${h.label} (${h.grade ?? "no grade"})`).join("; ");
  return cut(
    `<notice doc_no="${n.doc_no}"> Title: ${n.title} Agency: ${n.agency} Type: ${n.type} · Method: ${n.procurement_method} · ` +
      `Closes: ${shortDate(n.closing)} GRA supply heads: ${heads || "none named"}`,
  );
}

function checksResult(profile: Profile, doc: string, checks: EligibilityCheck[]): string {
  return cut(`Eligibility of ${profile.name} for ${doc}: ${checks.map((c) => `- [${c.status}] ${c.kind}: ${c.requirement}. ${c.reason}`).join(" ")}`);
}

function profileResult(profile: Profile): string {
  return cut(JSON.stringify({ id: profile.id, name: profile.name, uen: profile.uen, summary: profile.summary }));
}

function marketResult(m: MarketContext): string {
  if (!m.similar_count) return "No similar past awards found.";
  const money = (v: number | null) => (v === null ? "n/a" : `S$${Math.round(v).toLocaleString("en-SG")}`);
  return cut(
    `${m.similar_count} similar past awards; median ${money(m.median_amount)}, middle half ${money(m.p25_amount)}–${money(m.p75_amount)}. ` +
      `Top suppliers: ${m.top_suppliers.map((s) => `${s.supplier} (${s.wins})`).join(", ")}`,
  );
}

// ---------------------------------------------------------------- drafts

function placeholderFor(check: EligibilityCheck): string {
  if (check.status === "met") return check.reason;
  if (check.status === "unknown") return `[placeholder: confirm; ${check.reason.toLowerCase()}]`;
  return `Gap: ${check.reason}`;
}

export function clarificationDraft(n: Notice, profile: Profile, checks: EligibilityCheck[]): { body: string; count: number } {
  const questions: string[] = [];
  const items = n.items ?? [];
  if (items.length > 1) {
    questions.push(
      `**Scope of each item.** The notice lists ${items.length} items to respond (${items.map((i) => `"${i}"`).join(", ")}). Could the Agency confirm the deliverables and acceptance criteria for each? *Why it matters:* it decides how effort, and so price, is split across the items.`,
    );
  }
  if (items[0]) {
    questions.push(
      `**Volumes behind "${items[0]}".** What volumes, service levels or user numbers should the price assume? [placeholder: the figures we need] *Why it matters:* without them every bidder prices a different job.`,
    );
  }
  const sentences = (n.description ?? "").split(/(?<=\.)\s+/).filter(Boolean);
  const obligation = sentences.find((s) => /\b(shall|must|comply|required)\b/i.test(s));
  if (obligation) {
    questions.push(
      `**What "${obligation.replace(/\.$/, "")}" requires.** Which standards or guidelines will this be assessed against, and at which milestone? *Why it matters:* compliance work is priced separately, and a gap found late costs more.`,
    );
  }
  if (n.two_envelope) {
    questions.push(
      `**Evaluation of the two envelopes.** What weighting applies between the technical and the price proposal, and is there a technical threshold before price is opened? *Why it matters:* it tells us how much to invest in the technical proposal.`,
    );
  }
  for (const head of n.gra_heads ?? []) {
    const check = checks.find((c) => c.kind === "gra" && c.requirement.includes(head.code));
    questions.push(
      `**Registration ${head.code}${head.grade ? ` at ${head.grade}` : ""}.** Will the Agency accept a bid from a consortium where one member holds this registration? *Why it matters:* ${check?.status === "met" ? `${profile.name} holds it, so this protects a partnered bid.` : `${profile.name}'s profile does not settle this yet. [placeholder: our registration status]`}`,
    );
  }
  questions.push(
    `**Incumbent and handover.** Is there an incumbent supplier, and what handover period and documentation will they provide? *Why it matters:* transition effort is a real cost in the first months.`,
  );
  const body = [
    `# Clarification questions: ${n.doc_no} ${n.title}`,
    "",
    `**To:** ${n.agency}  `,
    `**Tender closes:** ${dateTime(n.closing)}  `,
    `**Prepared for:** ${profile.name}. Review, then send through GeBIZ; Kopi does not send anything.`,
    "",
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "The tender documents behind the GeBIZ login may answer some of these; check them before sending.",
    "",
  ].join("\n");
  return { body, count: questions.length };
}

export function complianceDraft(n: Notice, profile: Profile, checks: EligibilityCheck[]): string {
  const rows: string[][] = [];
  (n.items ?? []).forEach((item) => rows.push([item, "Items to respond", "[placeholder: our approach]", "[placeholder: case study]", "To confirm"]));
  for (const c of checks.filter((c) => c.kind !== "closing")) {
    rows.push([c.requirement, c.kind === "gra" ? "GRA supply head" : c.kind === "bca" ? "BCA workhead" : "Licence", placeholderFor(c), c.kind === "gra" ? "GRA certificate" : "Licence copy", c.status === "met" ? "Met" : c.status === "unmet" ? "Gap" : "To confirm"]);
  }
  if (n.two_envelope) rows.push(["Two envelopes", "Notice", "Technical and price proposals prepared separately", "Both envelopes", "To confirm"]);
  rows.push([`Submit before ${dateTime(n.closing)}`, "Notice", "Submission owner named, and a submit-by date two days early", "GeBIZ acknowledgement", "To confirm"]);
  return [
    `# Compliance matrix: ${n.doc_no} ${n.title}`,
    "",
    `Prepared for ${profile.name} from the public notice. The tender documents on GeBIZ will add requirements; add them as rows before submitting.`,
    "",
    `| # | Requirement | Source | How ${profile.name} meets it | Evidence | Status |`,
    "|---|---|---|---|---|---|",
    ...rows.map((r, i) => `| ${i + 1} | ${r.map((c) => c.replace(/\|/g, "/")).join(" | ")} |`),
    "",
  ].join("\n");
}

export function checklistDraft(n: Notice, items: ChecklistItem[]): string {
  const line = (i: ChecklistItem) => `- [ ] **${i.label}**${i.due ? ` (by ${dateTime(i.due)})` : ""}${i.detail ? `: ${i.detail}` : ""}`;
  const first = items.filter((i) => i.source === "eligibility");
  const prepare = items.filter((i) => i.source === "notice" || i.source === "drafting");
  const submit = items.filter((i) => i.source === "submission");
  return [
    `# Submission checklist: ${n.doc_no} ${n.title}`,
    "",
    `Closes ${dateTime(n.closing)}. Kopi prepares; you submit on GeBIZ.`,
    ...(first.length ? ["", "## Settle first", "", ...first.map(line)] : []),
    "",
    "## Prepare",
    "",
    ...prepare.map(line),
    "",
    "## Submit",
    "",
    ...submit.map(line),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------- the script

function say(text: string): Beat[] {
  const words = text.match(/\S+\s*|\s+/g) ?? [];
  const beats: Beat[] = [];
  for (let i = 0; i < words.length; i += 3) beats.push({ event: { type: "text", text: words.slice(i, i + 3).join("") }, pause: 28 });
  return beats;
}

function call(tool: string, input: Record<string, unknown>, summary: string, ms = 650): Beat[] {
  return [
    { event: { type: "tool_call", tool, input }, pause: 120 },
    { event: { type: "tool_result", summary }, pause: ms },
  ];
}

function write(name: string, body: string, files: Map<string, string>): Beat[] {
  files.set(name, body);
  return [
    ...call("Write", { file_path: `${DRAFTS}/${name}`, content: body }, `File created successfully at: ${DRAFTS}/${name}`, 900),
    { event: { type: "file", file: name }, pause: 150 },
  ];
}

const mentionsDoc = (text: string) => text.match(/\b[A-Z0-9]{6}ET[A-Z]\d{8}\b/)?.[0] ?? null;

/** The beats of one scripted turn. `files` collects the drafts it writes (name → markdown). */
export async function scriptTurn(request: ChatRequest, tools: MockTools, files: Map<string, string>): Promise<Beat[]> {
  const { profile } = request;
  const message = request.message;
  const doc = mentionsDoc(message) ?? request.doc_no ?? null;
  const beats: Beat[] = [];

  if (doc) {
    const n = tools.notice(doc);
    const checks = await tools.eligibility(doc, profile);
    if (/clarif/i.test(message)) {
      const { body, count } = clarificationDraft(n, profile, checks);
      const name = `${doc}-clarification-questions.md`;
      beats.push(
        ...say(`I'll read ${doc} and check where ${profile.name} stands before drafting.`),
        ...call("get_company_profile", {}, profileResult(profile), 400),
        ...call("get_tender", { doc_no: doc }, noticeResult(n)),
        ...call("check_eligibility", { doc_no: doc }, checksResult(profile, doc, checks)),
        ...write(name, body, files),
        ...say(
          `I've drafted **${count} clarification questions** for ${doc} in \`${name}\`. Each one says why the answer matters for pricing or compliance.\n\n` +
            `- The scope and volumes behind the ${n.items?.length ?? 0} items to respond, which the notice names but does not size.\n` +
            `${n.two_envelope ? "- How the two envelopes are weighted, since the price is only opened after the technical proposal.\n" : ""}` +
            `${(n.gra_heads ?? []).length ? `- Whether a partnered bid can meet ${n.gra_heads![0].code}; eligibility for it is ${checks.find((c) => c.kind === "gra")?.status ?? "unknown"}.\n` : ""}` +
            `\nWhere only the tender documents can answer, I've left a [placeholder]. Send them through GeBIZ well before closing on ${dateTime(n.closing)}.`,
        ),
      );
    } else if (/compliance|matrix/i.test(message)) {
      const name = `${doc}-compliance-matrix.md`;
      beats.push(
        ...say(`I'll pull the requirements from ${doc} and match them against ${profile.name}'s profile.`),
        ...call("get_tender", { doc_no: doc }, noticeResult(n)),
        ...call("get_company_profile", {}, profileResult(profile), 400),
        ...call("check_eligibility", { doc_no: doc }, checksResult(profile, doc, checks)),
        ...write(name, complianceDraft(n, profile, checks), files),
        ...say(
          `The compliance matrix for ${doc} is in \`${name}\`: one row per requirement the notice names, with how ${profile.name} meets it, the evidence to attach and a status.\n\n` +
            `Eligibility today: ${tally(checks)}. Rows marked **To confirm** need your input or the tender documents; the notice alone can't settle them.`,
        ),
      );
    } else if (/checklist|submit|submission/i.test(message)) {
      const items = await tools.checklist(doc, profile);
      const name = `${doc}-checklist.md`;
      beats.push(
        ...call("submission_checklist", { doc_no: doc }, cut(`Submission checklist for ${doc}: ${items.map((i) => `- ${i.label}`).join(" ")}`)),
        ...write(name, checklistDraft(n, items), files),
        ...say(
          `Here's what ${doc} needs, saved as \`${name}\`:\n\n` +
            items.map((i) => `- ${i.label}${i.due ? `, by ${dateTime(i.due)}` : ""}`).join("\n") +
            `\n\nTrack the tender on the Submissions page to tick these off as you go.`,
        ),
      );
    } else if (/licen|permit|registration/i.test(message)) {
      const licences = await tools.searchLicences(n.title, 3);
      beats.push(
        ...call("get_tender", { doc_no: doc }, noticeResult(n)),
        ...call("check_eligibility", { doc_no: doc }, checksResult(profile, doc, checks)),
        ...call("find_licences", { activity: n.title }, cut(licences.map((l) => `- ${l.name} (${l.agency}): ${l.description}`).join(" ") || "No licences matched.")),
        ...say(
          `For ${doc}, the notice names:\n\n` +
            (checks.filter((c) => c.kind !== "closing").map((c) => `- **${c.requirement}**: ${statusWord[c.status]}. ${c.reason}.`).join("\n") ||
              "- No registrations or licences.") +
            (licences.length ? `\n\nGoBusiness also lists ${licences.map((l) => `${l.name} (${l.agency})`).join(", ")} for work like this; check whether they apply to how you'd deliver it.` : ""),
        ),
      );
    } else {
      const market = await tools.similarAwards(n.title, n.agency);
      beats.push(
        ...call("get_tender", { doc_no: doc }, noticeResult(n)),
        ...call("check_eligibility", { doc_no: doc }, checksResult(profile, doc, checks)),
        ...call("similar_awards", { description: n.title, agency: n.agency }, marketResult(market)),
        ...say(
          `**${n.agency}** is buying: ${n.title}.\n\n` +
            `${(n.description ?? "").split(/(?<=\.)\s+/)[0]}\n\n` +
            `- **Who can bid:** ${(n.gra_heads ?? []).map((h) => `${h.code}${h.grade ? ` at ${h.grade}` : ""}`).join(", ") || "any GeBIZ trading partner"}.\n` +
            `- **${profile.name}:** ${tally(checks)} on the checks Kopi can run.\n` +
            `- **Market:** ${market.similar_count} similar past awards${market.median_amount !== null ? `, median ${moneyShort(market.median_amount)}` : ""}.\n\n` +
            `It closes ${dateTime(n.closing)}. I can draft clarification questions or a compliance matrix next.`,
        ),
      );
    }
  } else if (/licen|permit/i.test(message)) {
    const licences = await tools.searchLicences(message, 3);
    beats.push(
      ...call("find_licences", { activity: message }, cut(licences.map((l) => `- ${l.name} (${l.agency}): ${l.description}`).join(" ") || "No licences matched.")),
      ...say(
        licences.length
          ? `The closest licences in the GoBusiness catalogue:\n\n${licences.map((l) => `- **${l.name}** from ${l.agency}. [GoBusiness](${l.url})`).join("\n")}\n\nThe issuing agency decides whether your activity needs one; the licence pages say who does.`
          : "Nothing in the GoBusiness catalogue matched that activity. Try describing what you'll do on site.",
      ),
    );
  } else {
    const query = (profile.capabilities ?? []).slice(0, 2).join(" ") || profile.summary;
    const results = await tools.search(query, 3);
    const top = results.hits.map((h) => h.notice);
    const checked = await Promise.all(top.slice(0, 2).map(async (t) => ({ t, checks: await tools.eligibility(t.doc_no, profile) })));
    beats.push(
      ...say(`I'll search for open tenders that match ${profile.name}'s work, then check eligibility on the closest.`),
      ...call(
        "search_tenders",
        { query, closing_within_days: 30 },
        cut(`${top.length} open tenders for '${query}': ${top.map((t) => `- ${t.doc_no} | ${t.title} | ${t.agency} | closes ${t.closing.slice(0, 10)}`).join(" ")}`),
      ),
      ...checked.flatMap(({ t, checks }) => call("check_eligibility", { doc_no: t.doc_no }, checksResult(profile, t.doc_no, checks), 450)),
    );
    if (/draft|clarif/i.test(message) && top[0]) {
      const n = tools.notice(top[0].doc_no);
      const { body, count } = clarificationDraft(n, profile, checked[0].checks);
      const name = `${n.doc_no}-clarification-questions.md`;
      beats.push(
        ...call("get_tender", { doc_no: n.doc_no }, noticeResult(n)),
        ...write(name, body, files),
        ...say(`The best fit is **${n.doc_no}**, ${n.title} (${n.agency}). I've drafted ${count} clarification questions for it in \`${name}\`.`),
      );
    } else {
      beats.push(
        ...say(
          top.length
            ? `The closest open tenders for ${profile.name}:\n\n` +
                top
                  .map((t, i) => {
                    const c = checked[i]?.checks;
                    return `${i + 1}. **${t.title}**, ${t.agency}. ${t.doc_no}, closes ${dateTime(t.closing)}.${c ? ` Eligibility: ${tally(c)}.` : ""}`;
                  })
                  .join("\n") +
                `\n\nWant me to draft clarification questions for the first one?`
            : "No open tenders matched. Try describing the work in other words.",
        ),
      );
    }
  }
  const steps = beats.filter((b) => b.event.type === "tool_call").length;
  beats.push({ event: { type: "done", cost_usd: Math.round((0.03 + steps * 0.024) * 100) / 100 }, pause: 0 });
  return beats;
}
