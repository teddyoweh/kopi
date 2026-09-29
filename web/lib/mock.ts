/**
 * The API served from the backend's synthetic fixtures, in the browser, for local
 * development without Python. It mirrors kopi.store.FixtureStore: word-overlap search,
 * a closing/GRA eligibility check, and a scripted copilot turn.
 */
import awardsJson from "./fixtures/awards.json";
import licencesJson from "./fixtures/licences.json";
import noticesJson from "./fixtures/notices.json";
import type {
  ChatEvent,
  ChatRequest,
  EligibilityCheck,
  KopiApi,
  Licence,
  MarketContext,
  Notice,
  NoticeSummary,
  Overview,
  Profile,
  SearchResponse,
  SessionFile,
  TenderDetail,
  TenderFilters,
} from "./api";
import { ApiError } from "./api";
import { closingLabel, dateTime } from "./format";

type AwardRow = {
  tender_no: string;
  tender_description: string;
  agency: string;
  award_date: string;
  supplier_name: string;
  awarded_amt: string | null;
};

const notices = noticesJson as unknown as Notice[];
const awards = awardsJson as AwardRow[];
const licenceList = licencesJson as Licence[];

// kopi.search.tokens: lower-case words, stopwords dropped.
const STOPWORDS = new Set("a an and at for from in of on or the to with by".split(" "));
const tokens = (text: string) => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t));

/** kopi.search.rerank's highlights: the title's words that are in the query, first seen first. */
function highlights(query: string[], title: string): string[] {
  const wanted = new Set(query);
  return [...new Set(tokens(title).filter((word) => wanted.has(word)))];
}

/** Live data says "Open Quotation" where the fixtures say "Quotation"; compare without "Open". */
const method = (text: string) => text.toLowerCase().replace(/^open\s+/, "").trim();

function overlap(query: string[], text: string): number {
  if (!query.length) return 0;
  const words = new Set(tokens(text));
  return query.filter((term) => words.has(term)).length / query.length;
}

function summary(n: Notice): NoticeSummary {
  const { doc_no, type, title, agency, published, closing, status, category, url } = n;
  return { doc_no, type, title, agency, published, closing, status, category, url };
}

function matches(n: Notice, f: TenderFilters): boolean {
  const status = f.status === undefined ? "open" : f.status;
  return (
    (!status || n.status === status) &&
    (!f.agency || n.agency.toLowerCase().includes(f.agency.toLowerCase())) &&
    (!f.category || (n.category ?? "").toLowerCase().includes(f.category.toLowerCase())) &&
    (!f.method || method(n.procurement_method ?? "") === method(f.method)) &&
    (!f.closing_after || n.closing >= f.closing_after) &&
    (!f.closing_before || n.closing <= f.closing_before)
  );
}

function find(doc: string): Notice {
  const notice = notices.find((n) => n.doc_no === doc);
  if (!notice) throw new ApiError(404, `no tender ${doc}`);
  return notice;
}

function amount(row: AwardRow): number | null {
  const value = Number(row.awarded_amt);
  return row.awarded_amt && Number.isFinite(value) ? value : null;
}

function year(row: AwardRow): number | null {
  const part = row.award_date?.split("/")[2];
  return part ? Number(part) : null;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockApi implements KopiApi {
  readonly mode = "mock" as const;
  private files = new Map<string, Map<string, string>>();

  async health() {
    return { ok: true, auth: false };
  }

  async auth() {
    return { token: "mock", expires_at: new Date(Date.now() + 12 * 3600e3).toISOString() };
  }

  async search(q: string, filters: TenderFilters = {}, limit = 20): Promise<SearchResponse> {
    const terms = tokens(q);
    const hits = notices
      .filter((n) => matches(n, filters))
      .map((n) => ({
        notice: summary(n),
        score: Math.round(overlap(terms, `${n.title} ${n.title} ${n.agency} ${n.category} ${n.description}`) * 1000) / 1000,
        highlights: highlights(terms, n.title),
      }))
      .filter((hit) => hit.score > 0 || !terms.length)
      .sort((a, b) => b.score - a.score || a.notice.closing.localeCompare(b.notice.closing));
    return { query: q, total: hits.length, hits: hits.slice(0, limit) };
  }

  async tenders(filters: TenderFilters = {}, limit = 50, offset = 0) {
    return notices
      .filter((n) => matches(n, filters))
      .map(summary)
      .sort((a, b) => b.published.localeCompare(a.published))
      .slice(offset, offset + limit);
  }

  async tender(doc: string, profile?: Profile): Promise<TenderDetail> {
    const notice = find(doc);
    return {
      notice,
      eligibility: profile ? await this.eligibility(doc, profile) : [],
      market: await this.similarAwards(notice.title, notice.agency),
    };
  }

  async eligibility(doc: string, profile: Profile): Promise<EligibilityCheck[]> {
    const notice = find(doc);
    const open = new Date(notice.closing) > new Date();
    const checks: EligibilityCheck[] = [
      {
        kind: "closing",
        requirement: `Closes ${dateTime(notice.closing)}`,
        status: open ? "met" : "unmet",
        reason: open ? `Open; ${closingLabel(notice.closing).toLowerCase()}` : "Closed; submissions are no longer accepted",
        source_url: notice.url,
      },
    ];
    const graKnown = profile.gra_registrations != null;
    const graHeld = new Set((profile.gra_registrations ?? []).map((r) => r.code));
    for (const head of notice.gra_heads ?? []) {
      checks.push({
        kind: "gra",
        requirement: `GRA ${head.code} ${head.label}${head.grade ? ` at ${head.grade}` : ""}`,
        status: !graKnown ? "unknown" : graHeld.has(head.code) ? "met" : "unmet",
        reason: !graKnown
          ? "The profile does not list GRA registrations"
          : graHeld.has(head.code)
            ? `Registered under ${head.code}`
            : `Not registered under ${head.code}`,
        source_url: "https://www.gebiz.gov.sg/docs/Appln_Guidelines_for_Gov_Supp_Reg.pdf",
      });
    }
    const bcaKnown = profile.bca_registrations != null;
    const bcaHeld = new Set((profile.bca_registrations ?? []).map((r) => r.code));
    for (const head of notice.bca_workheads ?? []) {
      checks.push({
        kind: "bca",
        requirement: `BCA ${head.code}${head.grade ? ` at ${head.grade}` : ""}`,
        status: !bcaKnown ? "unknown" : bcaHeld.has(head.code) ? "met" : "unmet",
        reason: !bcaKnown
          ? "The profile does not list BCA registrations"
          : bcaHeld.has(head.code)
            ? `Registered under ${head.code}`
            : `Not registered under ${head.code}`,
        source_url: "https://www.bca.gov.sg/bca-directory/",
      });
    }
    const held = profile.licences_held;
    for (const named of notice.licences_mentioned ?? []) {
      const words = tokens(named.replace(/\(.*\)/, ""));
      const match = held?.find((h) => words.every((w) => tokens(h).includes(w)));
      checks.push({
        kind: "licence",
        requirement: named,
        status: held == null ? "unknown" : match ? "met" : "unmet",
        reason: held == null ? "The profile does not list licences held" : match ? `Held: ${match}` : "The notice names it and the profile does not list it",
        source_url: "https://licensing.gobusiness.gov.sg/licence-directory",
      });
    }
    return checks;
  }

  async overview(doc: string, profile: Profile): Promise<Overview> {
    const notice = find(doc);
    await pause(400);
    const first = (notice.description ?? "").split(". ")[0].replace(/\.$/, "");
    return {
      doc_no: doc,
      profile_id: profile.id,
      summary: `${notice.agency} is buying: ${notice.title}.`,
      buying: `${first}.`,
      who_can_bid:
        (notice.gra_heads ?? []).map((h) => `${h.code} ${h.grade ?? ""}`.trim()).join(", ") || "Any registered GeBIZ trading partner",
      fit: {
        score: Math.min(
          100,
          Math.round(100 * overlap(tokens((profile.capabilities ?? []).join(" ")), `${notice.title} ${notice.description}`)),
        ),
        recommendation: "MAYBE",
        reasons: [{ point: "What the notice asks for", quote: first, verified: true }],
      },
      key_dates: [{ label: "Closing", at: notice.closing }],
      risks: [],
      questions_for_agency: ["Is there an incumbent vendor, and when does their contract end?"],
      unverified_quotes: 0,
      model: "fixture",
      generated_at: new Date().toISOString(),
    };
  }

  async similarAwards(q: string, agency?: string, k = 25): Promise<MarketContext> {
    const terms = tokens(q);
    const ranked = awards
      .map((row) => ({ row, score: overlap(terms, row.tender_description) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => x.row);
    const amounts = ranked
      .map(amount)
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    const count = (rows: AwardRow[]) =>
      [...rows.reduce((m, r) => m.set(r.supplier_name, (m.get(r.supplier_name) ?? 0) + 1), new Map<string, number>())]
        .sort((a, b) => b[1] - a[1])
        .map(([supplier, wins]) => ({ supplier, wins }));
    return {
      similar_count: new Set(ranked.map((r) => r.tender_no)).size,
      median_amount: amounts.length ? amounts[Math.floor(amounts.length / 2)] : null,
      p25_amount: amounts.length ? amounts[Math.floor(amounts.length / 4)] : null,
      p75_amount: amounts.length ? amounts[Math.floor((3 * amounts.length) / 4)] : null,
      top_suppliers: count(ranked).slice(0, 5),
      agency_incumbents: count(ranked.filter((r) => agency && r.agency === agency)).slice(0, 3),
      no_award_share: null,
      examples: ranked.slice(0, 3).map((r) => ({
        tender_no: r.tender_no,
        description: r.tender_description,
        agency: r.agency,
        year: year(r),
        amount: amount(r),
        suppliers: [r.supplier_name],
      })),
    };
  }

  async licences(limit = 50, offset = 0) {
    return licenceList.slice(offset, offset + limit);
  }

  async searchLicences(q: string, limit = 10) {
    const terms = tokens(q);
    const text = (l: Licence) => `${l.name} ${l.description} ${l.who_needs_it}`;
    return licenceList
      .filter((l) => overlap(terms, text(l)) > 0)
      .sort((a, b) => overlap(terms, text(b)) - overlap(terms, text(a)))
      .slice(0, limit);
  }

  async chat(request: ChatRequest, onEvent: (event: ChatEvent) => void) {
    const session = request.session_id ?? `mock-${Date.now()}`;
    const results = await this.search(request.message, {}, 3);
    const titles = results.hits.map((h) => h.notice.title).join("; ") || "nothing matching";
    const name = "clarification-questions.md";
    const body = `# Clarification questions\n\n1. Is there an incumbent vendor for: ${titles}?\n`;
    this.files.set(session, (this.files.get(session) ?? new Map()).set(name, body));
    const script: ChatEvent[] = [
      { type: "tool_call", tool: "search_tenders", input: { query: request.message }, session_id: session },
      { type: "tool_result", tool: "search_tenders", summary: `${results.total} tenders found`, session_id: session },
      { type: "text", text: `Closest open tenders: ${titles}.`, session_id: session },
      { type: "file", file: name, session_id: session },
      { type: "done", session_id: session, cost_usd: 0 },
    ];
    for (const event of script) {
      await pause(250);
      onEvent(event);
    }
  }

  async sessionFiles(sessionId: string): Promise<SessionFile[]> {
    return [...(this.files.get(sessionId) ?? new Map<string, string>())].map(([name, body]) => ({
      name,
      title: body.split("\n")[0].replace(/^#\s*/, ""),
      size: body.length,
      modified: new Date().toISOString(),
    }));
  }

  async sessionFile(sessionId: string, name: string) {
    const body = this.files.get(sessionId)?.get(name);
    if (body === undefined) throw new ApiError(404, `no file ${name}`);
    return body;
  }
}
