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
export type ChatRequest = Schemas["ChatRequest"];
export type SessionFile = Schemas["SessionFile"];
export type AuthResponse = Schemas["AuthResponse"];

/**
 * One event of a copilot turn (kopi.models.ChatEvent). The /chat route streams these as
 * SSE, so FastAPI's OpenAPI spec does not carry the schema; it is mirrored here by hand.
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
  similarAwards(q: string, agency?: string, k?: number): Promise<MarketContext>;
  licences(limit?: number, offset?: number): Promise<Licence[]>;
  searchLicences(q: string, limit?: number): Promise<Licence[]>;
  chat(request: ChatRequest, onEvent: (event: ChatEvent) => void, signal?: AbortSignal): Promise<void>;
  sessionFiles(sessionId: string): Promise<SessionFile[]>;
  sessionFile(sessionId: string, name: string): Promise<string>;
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
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(response.status, typeof body.detail === "string" ? body.detail : response.statusText);
    }
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
    return this.get<SearchResponse>(`/search${query({ q, limit, ...filters })}`);
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

  similarAwards(q: string, agency?: string, k = 25) {
    return this.get<MarketContext>(`/awards/similar${query({ q, agency, k })}`);
  }

  licences(limit = 50, offset = 0) {
    return this.get<Licence[]>(`/licences${query({ limit, offset })}`);
  }

  searchLicences(q: string, limit = 10) {
    return this.get<Licence[]>(`/licences/search${query({ q, limit })}`);
  }

  async chat(request: ChatRequest, onEvent: (event: ChatEvent) => void, signal?: AbortSignal) {
    const response = await fetch(`${this.base}/chat`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok || !response.body) throw new ApiError(response.status, response.statusText);
    await readEventStream(response.body, onEvent);
  }

  sessionFiles(sessionId: string) {
    return this.get<SessionFile[]>(`/sessions/${encodeURIComponent(sessionId)}/files`);
  }

  async sessionFile(sessionId: string, name: string) {
    const path = `/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(name)}`;
    const response = await fetch(`${this.base}${path}`, { headers: this.headers() });
    if (!response.ok) throw new ApiError(response.status, response.statusText);
    return response.text();
  }
}

/** Parse a text/event-stream body into ChatEvents (one JSON object per `data:` line). */
export async function readEventStream(body: ReadableStream<Uint8Array>, onEvent: (event: ChatEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const message = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = message
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as ChatEvent);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

let client: Promise<KopiApi> | null = null;

/** The API client for this build: live against NEXT_PUBLIC_KOPI_API, or the fixture mock. */
export function getApi(): Promise<KopiApi> {
  client ??=
    API_BASE === "mock" ? import("./mock").then((m) => new m.MockApi()) : Promise.resolve(new LiveApi(API_BASE.replace(/\/$/, "")));
  return client;
}
