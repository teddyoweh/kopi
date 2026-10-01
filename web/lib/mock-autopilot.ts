/**
 * The mock copilot on autopilot: the same four steps the live playbook runs, one per turn,
 * chosen by the bid's stage (qualify, clarify, draft, review and pack). Drafts carry stated
 * assumptions instead of placeholders, as the autopilot playbook requires.
 */
import type { BidStage, ChatRequest, EligibilityCheck, MarketContext, Notice, Profile } from "./api";
import { dateTime, moneyShort, shortDate } from "./format";
import {
  before,
  bidCall,
  call,
  checklistDraft,
  checksResult,
  clarificationDraft,
  complianceDraft,
  marketResult,
  noticeResult,
  profileResult,
  say,
  write,
  type Beat,
  type MockTools,
} from "./mock-copilot";
import { addNote, readMemory, setStage } from "./mock-memory";

/** "[placeholder: x]" becomes a stated assumption, so the autopilot's drafts leave nothing blank. */
function assume(body: string): string {
  return body
    .replace(/\[placeholder: ([^\]]+)\]/g, (_, what: string) => `*Assumed: ${what.replace(/^confirm; /, "")}, to re-check against the tender documents.*`)
    .replace(/\[placeholder\]/g, "*Assumed from the notice; re-check against the tender documents.*");
}

function remember(session: string, note: string): Beat[] {
  const [callBeat, result] = call("remember", { note }, "Saved to the bid memory", 340);
  return [callBeat, { ...result, effect: () => addNote(session, note, "kopi") }];
}

function stage(session: string, to: BidStage, next: string): Beat[] {
  const [callBeat, result] = call("set_bid_stage", { stage: to, next_step: next }, `The bid is at ${to}. Next: ${next}`, 340);
  return [callBeat, { ...result, effect: () => setStage(session, to, next) }];
}

/** A price for the work: the band's median, moved toward the top when the scope looks larger. */
function priceFor(market: MarketContext, items: number): number | null {
  if (!market.median_amount) return null;
  const top = market.p75_amount ?? market.median_amount;
  return Math.round((market.median_amount + (top - market.median_amount) * Math.min(items, 3) * 0.15) / 1000) * 1000;
}

function planDraft(n: Notice, profile: Profile, checks: EligibilityCheck[], market: MarketContext): string {
  const { why } = bidCall(checks);
  const gaps = checks.filter((c) => c.status !== "met" && c.kind !== "closing");
  return [
    `# Bid plan: ${n.doc_no} ${n.title}`,
    "",
    `**Call: Go.** Decided by Kopi on autopilot. ${why} Any gap below is a risk with an owner and a date, not a reason to stop.`,
    "",
    "## Why",
    "",
    `- **What ${n.agency} is buying:** ${(n.description ?? n.title).split(/(?<=\.)\s+/)[0]}`,
    `- **What ${profile.name} brings:** ${profile.capabilities.slice(0, 3).join("; ")}.`,
    `- **Market:** ${market.similar_count ? `${market.similar_count} similar awards, median ${moneyShort(market.median_amount ?? 0)}.` : "no close past awards; priced from the scope."}`,
    "",
    "## Gaps, each with a plan",
    "",
    ...(gaps.length ? gaps.map((c) => `- **${c.requirement}**: ${c.reason}. Plan: confirm it in the clarification questions and name it in the submission pack.`) : ["- None the notice names."]),
    "",
    "## Timeline, back from closing",
    "",
    "| When | What | Who |",
    "|---|---|---|",
    `| Today | Plan, questions, matrix, proposal, price and pack | Kopi (autopilot) |`,
    `| ${before(n.closing, 10)} | Clarification questions sent on GeBIZ | You |`,
    `| ${before(n.closing, 3)} | Internal review of the pack | You |`,
    `| ${before(n.closing, 1)} | Submit on GeBIZ, a day early | You |`,
    `| ${shortDate(n.closing)} | Closes ${dateTime(n.closing)} | |`,
    "",
  ].join("\n");
}

function proposalDraft(n: Notice, profile: Profile): string {
  const items = n.items?.length ? n.items : [n.title];
  return [
    `# Proposal: ${n.doc_no} ${n.title}`,
    "",
    `Submitted by ${profile.name} to ${n.agency}.`,
    "",
    "## 1. Executive summary",
    "",
    `${n.agency} needs ${(n.description ?? n.title).split(/(?<=\.)\s+/)[0].replace(/\.$/, "").toLowerCase()}. ${profile.name} ${profile.summary.charAt(0).toLowerCase()}${profile.summary.slice(1)} We propose to deliver it in three phases, with something the agency can use at the end of each, and a named lead who stays from kickoff to handover.`,
    "",
    "## 2. Our understanding",
    "",
    `The notice asks for ${items.length} item${items.length === 1 ? "" : "s"} to respond to. We read the requirement as an outcome, not a list of tasks: officers spend less time on the work this replaces, and the agency can see that it does.`,
    "",
    "## 3. Approach, item by item",
    "",
    ...items.flatMap((item, i) => [
      `### 3.${i + 1} ${item}`,
      "",
      `We start with two weeks alongside the officers who own "${item}", map how the work is done today, and agree what done looks like. We then build in two-week increments, each shown to the agency, and hand over with documentation and training. *Assumed: volumes and service levels as described in the notice, to re-check against the tender documents.*`,
      "",
    ]),
    "## 4. Plan and milestones",
    "",
    "| Phase | Weeks | The agency sees |",
    "|---|---|---|",
    "| Discovery | 1–2 | A written scope and acceptance criteria |",
    "| Build | 3–10 | A working increment every two weeks |",
    "| Go-live and handover | 11–12 | The system in use, documentation and trained officers |",
    "",
    "## 5. Team and track record",
    "",
    `${profile.past_work.map((w) => w.replace(/[.\s]*$/, ".")).join(" ")} The team is senior and small: the people in the proposal are the people who do the work.`,
    "",
    "## 6. Compliance",
    "",
    "Every requirement the notice names is answered in the compliance matrix, attached.",
    "",
  ].join("\n");
}

function coverLetterDraft(n: Notice, profile: Profile): string {
  return [
    `# Cover letter: ${n.doc_no}`,
    "",
    `To ${n.agency},`,
    "",
    `${profile.name} is pleased to submit its response to ${n.doc_no}, ${n.title}. ${profile.summary}`,
    "",
    "Our proposal, compliance matrix and price schedule are enclosed. We would welcome the chance to clarify any part of them.",
    "",
    `Yours sincerely,`,
    "",
    `For ${profile.name}. *The authorised signatory signs here: see "Only you can do" in the submission pack.*`,
    "",
  ].join("\n");
}

function pricingDraft(n: Notice, market: MarketContext): string {
  const price = priceFor(market, n.items?.length ?? 1);
  return [
    `# Pricing notes: ${n.doc_no}`,
    "",
    price ? `**Recommended price: ${moneyShort(price)}** (before GST).` : "**Recommended price:** priced from the scope; no close past awards.",
    "",
    "## Method",
    "",
    market.similar_count
      ? `- ${market.similar_count} similar past awards: median ${moneyShort(market.median_amount ?? 0)}, middle half ${moneyShort(market.p25_amount ?? 0)}–${moneyShort(market.p75_amount ?? 0)}.`
      : "- No similar awards to anchor on.",
    `- Moved from the median toward the upper quartile for ${n.items?.length ?? 1} item${(n.items?.length ?? 1) === 1 ? "" : "s"} to respond to, so the price carries the whole scope.`,
    "- Inside the company's value band, so no exception is needed.",
    "",
    "## Split by item",
    "",
    ...(n.items?.length ? n.items.map((item) => `- ${item}: ${price ? moneyShort(Math.round(price / n.items!.length / 1000) * 1000) : "from the scope"}`) : [`- ${n.title}: ${price ? moneyShort(price) : "from the scope"}`]),
    "",
  ].join("\n");
}

function riskDraft(n: Notice, checks: EligibilityCheck[]): string {
  const gaps = checks.filter((c) => c.status !== "met" && c.kind !== "closing");
  return [
    `# Risk register: ${n.doc_no}`,
    "",
    "| Risk | Likelihood | What we do |",
    "|---|---|---|",
    ...gaps.map((c) => `| ${c.requirement} not confirmed | Medium | Asked in the clarification questions; flagged in the pack |`),
    "| Tender documents differ from the notice | Medium | Re-check the matrix and price once they are uploaded |",
    `| Submission on the closing day | Low | Submit on ${before(n.closing, 1)}, a day early |`,
    "",
  ].join("\n");
}

function packDraft(n: Notice, profile: Profile, docs: string[]): string {
  return [
    `# Submission pack: ${n.doc_no} ${n.title}`,
    "",
    `Ready for ${profile.name} to review and submit. Closes **${dateTime(n.closing)}**; submit by **${before(n.closing, 1)}**.`,
    "",
    "## What is ready, in the order it goes in",
    "",
    ...docs.map((d, i) => `${i + 1}. ${d}`),
    "",
    "## Re-check once the tender documents are uploaded",
    "",
    "- The volumes and service levels the proposal assumes.",
    "- The price schedule's format and the items it must list.",
    "",
    "## Only you can do",
    "",
    `- Sign the cover letter as ${profile.name}'s authorised signatory.`,
    ...(profile.uen ? [] : ["- Add the company's UEN (the profile has none)."]),
    "- Approve the recommended price.",
    "- Submit on GeBIZ with CorpPass.",
    "",
  ].join("\n");
}

/** One autopilot turn: the step for the bid's stage, done completely, ending with the next. */
export async function autopilotTurn(request: ChatRequest, tools: MockTools, files: Map<string, string>): Promise<Beat[]> {
  const { profile } = request;
  const doc = request.doc_no!;
  const session = request.session_id ?? "";
  const n = tools.notice(doc);
  const checks = await tools.eligibility(doc, profile);
  const market = await tools.similarAwards(n.title, n.agency);
  const current = readMemory(session).stage;
  const name = (kind: string) => `${doc}-${kind}.md`;

  if (!current || current === "qualify") {
    return [
      ...say(`On autopilot. I'll qualify ${doc}, make the call, and keep going until the bid is ready to submit.`),
      ...call("get_company_profile", {}, profileResult(profile), 400),
      ...call("get_tender", { doc_no: doc }, noticeResult(n)),
      ...call("check_eligibility", { doc_no: doc }, checksResult(profile, doc, checks)),
      ...call("similar_awards", { description: n.title, agency: n.agency }, marketResult(market)),
      ...remember(session, `Closes ${dateTime(n.closing)}. ${n.procurement_method}; ${n.items?.length ?? 0} items to respond.`),
      ...(market.similar_count ? remember(session, `Price band: ${market.similar_count} similar awards, median ${moneyShort(market.median_amount ?? 0)}.`) : []),
      ...write(name("bid-plan"), planDraft(n, profile, checks, market), files),
      ...stage(session, "clarify", "Kopi writes the clarification questions and the compliance matrix"),
      ...say(`**Go.** ${bidCall(checks).why} Next: the clarification questions and the compliance matrix.`),
    ];
  }
  if (current === "clarify") {
    const { body, count } = clarificationDraft(n, profile, checks);
    return [
      ...say("Step 2 of 4: clarify. Questions for the agency, and every requirement answered."),
      ...write(name("clarification-questions"), assume(body), files),
      ...write(name("compliance-matrix"), assume(complianceDraft(n, profile, checks)), files),
      ...stage(session, "draft", "Kopi writes the proposal, the cover letter and the price"),
      ...say(`${count} questions and the compliance matrix are written. Next: the proposal itself.`),
    ];
  }
  if (current === "draft") {
    const price = priceFor(market, n.items?.length ?? 1);
    return [
      ...say("Step 3 of 4: draft. The proposal in full, the cover letter, and a price."),
      ...call("get_company_profile", {}, profileResult(profile), 300),
      ...write(name("proposal"), proposalDraft(n, profile), files),
      ...write(name("cover-letter"), coverLetterDraft(n, profile), files),
      ...write(name("pricing-notes"), pricingDraft(n, market), files),
      ...(price ? remember(session, `Recommended price ${moneyShort(price)}, from the market band.`) : []),
      ...stage(session, "review", "Kopi reviews everything and builds the submission pack"),
      ...say(`The proposal, cover letter and pricing notes are written${price ? `; recommended price ${moneyShort(price)}` : ""}. Next: review and the pack.`),
    ];
  }
  if (current === "review") {
    const items = await tools.checklist(doc, profile);
    const docs = ["Cover letter", "Proposal", "Compliance matrix", "Price schedule (from the pricing notes)", "Registrations and licences the matrix names"];
    return [
      ...say("Step 4 of 4: review and pack. Reading the drafts as an evaluator would."),
      ...call("Read", { file_path: `/workspace/drafts/${name("proposal")}` }, `# Proposal: ${doc}`, 500),
      ...call("Read", { file_path: `/workspace/drafts/${name("compliance-matrix")}` }, `# Compliance matrix: ${doc}`, 500),
      ...write(name("risk-register"), riskDraft(n, checks), files),
      ...write(name("checklist"), checklistDraft(n, items), files),
      ...write(name("submission-pack"), packDraft(n, profile, docs), files),
      ...stage(session, "submit", `Submit on GeBIZ by ${before(n.closing, 1)}`),
      ...say(`**Ready to submit.** The submission pack lists what goes in, in order, and the few things only you can do. Submit on GeBIZ by ${before(n.closing, 1)}.`),
    ];
  }
  return say(`The bid is ready. Open the submission pack for what goes in and what only you can do.`);
}
