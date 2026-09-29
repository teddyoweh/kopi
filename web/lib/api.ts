import type { components } from "./api-types";

type Schemas = components["schemas"];
export type Notice = Schemas["Notice"];
export type NoticeSummary = Schemas["NoticeSummary"];
export type SearchResponse = Schemas["SearchResponse"];
export type TenderDetail = Schemas["TenderDetail"];
export type Overview = Schemas["Overview"];
export type EligibilityCheck = Schemas["EligibilityCheck"];
export type MarketContext = Schemas["MarketContext"];
export type Licence = Schemas["Licence"];
export type Profile = Schemas["Profile"];
/** `bid` has a server default (false); openapi-typescript marks defaulted fields required, so it is optional here. */
export type ChatRequest = Omit<Schemas["ChatRequest"], "bid"> & { bid?: boolean };
export type SessionFile = Schemas["SessionFile"];
export type AuthResponse = Schemas["AuthResponse"];
export type ChecklistItem = Schemas["ChecklistItem"];
export type TenderInsight = Schemas["TenderInsight"];
export type EligibilitySummary = Schemas["EligibilitySummary"];
export type MarketBand = Schemas["MarketBand"];
export type BidMemory = Schemas["BidMemory"];
export type MemoryNote = Schemas["MemoryNote"];
export type BidStage = NonNullable<BidMemory["stage"]>;

/** The file types a bid accepts as uploads, and the API's size cap. */
export const UPLOAD_TYPES = [".pdf", ".md", ".txt", ".csv"] as const;
export const UPLOAD_LIMIT = 8 * 1024 * 1024;

/**
 * One event of a copilot turn (kopi.models.ChatEvent). The /chat route streams these as
 * SSE, so FastAPI's OpenAPI spec does not carry the schema; it is mirrored here by hand.
 * `text` is a delta to append; a `tool_result` carries no tool name and answers the oldest
 * unanswered `tool_call`; an `error` carries its message in `text`.
 */
export type ChatEvent = {
  type: "text" | "tool_call" | "tool_result" | "file" | "done" | "error";
  text?: string;
  tool?: string;
  input?: Record<string, unknown>;
  summary?: string;
  file?: string;
  session_id?: string;
  cost_usd?: number;
};

export type TenderFilters = {
  status?: "open" | "closed" | "awarded" | "cancelled" | null;
  agency?: string;
  category?: string;
  method?: string;
  closing_after?: string;
  closing_before?: string;
};

/** Everything the web app can ask of Kopi. The live and mock clients both implement it. */
export interface KopiApi {
  readonly mode: "live" | "mock";
  health(): Promise<{ ok: boolean; auth: boolean }>;
  auth(code: string): Promise<AuthResponse>;
  search(q: string, filters?: TenderFilters, limit?: number): Promise<SearchResponse>;
  tenders(filters?: TenderFilters, limit?: number, offset?: number): Promise<NoticeSummary[]>;
  tender(doc: string, profile?: Profile): Promise<TenderDetail>;
  overview(doc: string, profile: Profile): Promise<Overview>;
  eligibility(doc: string, profile: Profile): Promise<EligibilityCheck[]>;
  checklist(doc: string, profile: Profile): Promise<ChecklistItem[]>;
  similarAwards(q: string, agency?: string, k?: number): Promise<MarketContext>;
  licences(limit?: number, offset?: number): Promise<Licence[]>;
  searchLicences(q: string, limit?: number): Promise<Licence[]>;
  chat(request: ChatRequest, onEvent: (event: ChatEvent) => void, signal?: AbortSignal): Promise<void>;
  sessionFiles(sessionId: string): Promise<SessionFile[]>;
  sessionFile(sessionId: string, name: string): Promise<string>;
  /** A session file as bytes: uploads are PDFs as often as text. */
  sessionBlob(sessionId: string, name: string): Promise<Blob>;
  /** Eligibility, snippet and price band for up to 25 tenders, for one profile. */
  insights(docs: string[], profile: Profile, q?: string): Promise<TenderInsight[]>;
  memory(sessionId: string): Promise<BidMemory>;
  remember(sessionId: string, text: string): Promise<BidMemory>;
  forget(sessionId: string, noteId: string): Promise<BidMemory>;
  upload(sessionId: string, file: File): Promise<SessionFile>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const TOKEN_KEY = "kopi.token";

/** NEXT_PUBLIC_KOPI_API is the API origin, or "mock" (also the default) for the in-browser fixtures. */
export const API_BASE = process.env.NEXT_PUBLIC_KOPI_API ?? "mock";

/** The API rejects a `q` longer than this with a 422 (search, similar awards, licence search). */
export const MAX_QUERY = 300;

/** A query cut to MAX_QUERY at a word boundary. A profile's summary plus capabilities runs past it. */
export function clipQuery(q: string): string {
  const text = q.replace(/\s+/g, " ").trim();
  if (text.length <= MAX_QUERY) return text;
  const cut = text.slice(0, MAX_QUERY + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut.slice(0, MAX_QUERY)).replace(/[\s,.;:]+$/, "");
}

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

class LiveApi implements KopiApi {
  readonly mode = "live" as const;

  constructor(private readonly base: string) {}

  private headers(json = false): HeadersInit {
    const token = typeof window === "undefined" ? null : sessionStorage.getItem(TOKEN_KEY);
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.base}${path}`, init);
    if (!response.ok) throw await errorOf(response);
    return response.json() as Promise<T>;
  }

  private get<T>(path: string) {
    return this.request<T>(path, { headers: this.headers() });
  }

  private post<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: "POST", headers: this.headers(true), body: JSON.stringify(body) });
  }

  health() {
    return this.get<{ ok: boolean; auth: boolean }>("/health");
  }

  auth(code: string) {
    return this.post<AuthResponse>("/auth", { code });
  }

  search(q: string, filters: TenderFilters = {}, limit = 20) {
    return this.get<SearchResponse>(`/search${query({ q: clipQuery(q), limit, ...filters })}`);
  }

  tenders(filters: TenderFilters = {}, limit = 50, offset = 0) {
    return this.get<NoticeSummary[]>(`/tenders${query({ limit, offset, ...filters })}`);
  }

  tender(doc: string, profile?: Profile) {
    const path = `/tenders/${encodeURIComponent(doc)}`;
    return profile ? this.post<TenderDetail>(`${path}/detail`, { profile }) : this.get<TenderDetail>(path);
  }

  overview(doc: string, profile: Profile) {
    return this.post<Overview>(`/tenders/${encodeURIComponent(doc)}/overview`, { profile });
  }

  eligibility(doc: string, profile: Profile) {
    return this.post<EligibilityCheck[]>("/eligibility", { doc_no: doc, profile });
  }

  checklist(doc: string, profile: Profile) {
    return this.post<ChecklistItem[]>(`/tenders/${encodeURIComponent(doc)}/checklist`, { profile });
  }

  similarAwards(q: string, agency?: string, k = 25) {
    return this.get<MarketContext>(`/awards/similar${query({ q: clipQuery(q), agency, k })}`);
  }

  licences(limit = 50, offset = 0) {
    return this.get<Licence[]>(`/licences${query({ limit, offset })}`);
  }

  searchLicences(q: string, limit = 10) {
    return this.get<Licence[]>(`/licences/search${query({ q: clipQuery(q), limit })}`);
  }

  async chat(request: ChatRequest, onEvent: (event: ChatEvent) => void, signal?: AbortSignal) {
    const response = await fetch(`${this.base}/chat`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok) throw await errorOf(response);
    if (!response.body) throw new ApiError(response.status, "the copilot sent no stream");
    await readEventStream(response.body, onEvent);
  }

  sessionFiles(sessionId: string) {
    return this.get<SessionFile[]>(`/sessions/${encodeURIComponent(sessionId)}/files`);
  }

  async sessionFile(sessionId: string, name: string) {
    const path = `/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(name)}`;
    const response = await fetch(`${this.base}${path}`, { headers: this.headers() });
    if (!response.ok) throw await errorOf(response);
    return response.text();
  }

  async sessionBlob(sessionId: string, name: string) {
    const path = `/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(name)}`;
    const response = await fetch(`${this.base}${path}`, { headers: this.headers() });
    if (!response.ok) throw await errorOf(response);
    return response.blob();
  }

  insights(docs: string[], profile: Profile, q?: string) {
    return this.post<TenderInsight[]>("/search/insights", { doc_nos: docs.slice(0, 25), profile, query: q ? clipQuery(q) : null });
  }

  memory(sessionId: string) {
    return this.get<BidMemory>(`/sessions/${encodeURIComponent(sessionId)}/memory`);
  }

  remember(sessionId: string, text: string) {
    return this.post<BidMemory>(`/sessions/${encodeURIComponent(sessionId)}/memory`, { text });
  }

  forget(sessionId: string, noteId: string) {
    return this.post<BidMemory>(`/sessions/${encodeURIComponent(sessionId)}/memory/${encodeURIComponent(noteId)}/forget`, {});
  }

  upload(sessionId: string, file: File) {
    const path = `/sessions/${encodeURIComponent(sessionId)}/uploads${query({ name: file.name })}`;
    const headers = { ...this.headers(), "Content-Type": file.type || "application/octet-stream" };
    return this.request<SessionFile>(path, { method: "POST", headers, body: file });
  }
}

/** An ApiError carrying the API's own `detail` when it sent one (the 503 and 429 reasons live there). */
async function errorOf(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => ({}));
  return new ApiError(response.status, typeof body?.detail === "string" ? body.detail : response.statusText);
}

/** Parse a text/event-stream body into ChatEvents (one JSON object per `data:` line). */
export async function readEventStream(body: ReadableStream<Uint8Array>, onEvent: (event: ChatEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = (message: string) => {
    const data = message
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    let event: ChatEvent;
    try {
      event = JSON.parse(data) as ChatEvent;
    } catch {
      return; // a malformed message is skipped, not fatal to the turn
    }
    onEvent(event);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      emit(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
  emit(buffer + decoder.decode());
}

let client: Promise<KopiApi> | null = null;

/** The API client for this build: live against NEXT_PUBLIC_KOPI_API, or the fixture mock. */
export function getApi(): Promise<KopiApi> {
  client ??=
    API_BASE === "mock" ? import("./mock").then((m) => new m.MockApi()) : Promise.resolve(new LiveApi(API_BASE.replace(/\/$/, "")));
  return client;
}
