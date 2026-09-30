"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { useApi } from "@/components/kopi-provider";

import type { KopiApi, NoticeSummary, TenderFilters } from "./api";
import { sgDayEnd } from "./format";
import { useStored } from "./stored";

/** A search as the URL carries it: the words, and the four filters. */
export type SearchQuery = { q: string; category: string | null; method: string | null; closing: string | null; agency: string | null };

/** "Closes within 7 days" and "within 30": the only windows the Closing filter offers. */
export const CLOSING_WINDOWS = ["7", "30"];

export function readSearchQuery(params: URLSearchParams): SearchQuery {
  const closing = params.get("closing");
  return {
    q: (params.get("q") ?? "").trim(),
    category: params.get("category"),
    method: params.get("method"),
    closing: closing && CLOSING_WINDOWS.includes(closing) ? closing : null,
    agency: params.get("agency"),
  };
}

export function searchFilters(query: SearchQuery): TenderFilters {
  return {
    status: "open",
    category: query.category ?? undefined,
    method: query.method ?? undefined,
    agency: query.agency ?? undefined,
    closing_before: query.closing ? sgDayEnd(Number(query.closing)) : undefined,
  };
}

/** The live API's search depth: it re-ranks the 50 nearest notices, so 50 is everything it has. */
export const SEARCH_LIMIT = 50;

/** What a search finds: by meaning when it has words, otherwise the newest notices the filters allow. */
export async function runSearch(api: KopiApi, query: SearchQuery): Promise<{ mode: "search" | "browse"; total: number; rows: { notice: NoticeSummary; score?: number; highlights?: string[] }[] }> {
  if (query.q) {
    const found = await api.search(query.q, searchFilters(query), SEARCH_LIMIT);
    return { mode: "search", total: found.total, rows: found.hits };
  }
  const list = await api.tenders(searchFilters(query), SEARCH_LIMIT, 0);
  return { mode: "browse", total: list.length, rows: list.map((notice) => ({ notice })) };
}

/**
 * A saved search, pinned in the sidebar like a Linear view. `seen` is when the person last
 * opened it; the sidebar counts the notices published since.
 */
export type View = { id: string; name: string; query: SearchQuery; seen: string | null };

const VIEWS_KEY = "kopi.views";
export const EMPTY_QUERY: SearchQuery = { q: "", category: null, method: null, closing: null, agency: null };

/** What a first visit starts with, so Views shows what it is for before anything is saved. */
const SEEDED: View[] = [
  { id: "closing-this-week", name: "Closing this week", query: { ...EMPTY_QUERY, closing: "7" }, seen: null },
  { id: "it-and-telecoms", name: "IT & telecoms", query: { ...EMPTY_QUERY, category: "IT&Telecommunication" }, seen: null },
];

/** Whether the person saved this view, rather than it coming with Kopi. */
export const isOwnView = (view: View) => !SEEDED.some((seeded) => seeded.id === view.id);

export function sameQuery(a: SearchQuery, b: SearchQuery): boolean {
  return a.q === b.q && a.category === b.category && a.method === b.method && a.closing === b.closing && a.agency === b.agency;
}

export function viewHref(view: View): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(view.query)) if (value) params.set(key, value);
  params.set("view", view.id);
  return `/search/?${params.toString()}`;
}

/** A name for a search nobody named yet: its words, or its filters. */
export function suggestName(query: SearchQuery): string {
  if (query.q) {
    const words = query.q.length > 40 ? `${query.q.slice(0, 38).trimEnd()}…` : query.q;
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  const parts = [
    query.closing && `Closing in ${query.closing} days`,
    query.category?.replace("IT&Telecommunication", "IT & telecoms"),
    query.method,
    query.agency,
  ].filter(Boolean);
  return parts.join(" · ") || "Open tenders";
}

export function useViews() {
  const [views, update] = useStored<View[]>(VIEWS_KEY, SEEDED);

  const find = useCallback((query: SearchQuery) => views.find((v) => sameQuery(v.query, query)) ?? null, [views]);

  const save = useCallback(
    (name: string, query: SearchQuery): View => {
      const view: View = { id: `v${Date.now().toString(36)}`, name: name.trim() || suggestName(query), query, seen: new Date().toISOString() };
      update((list) => [...list, view]);
      return view;
    },
    [update],
  );

  /** Put a removed view back where it was (the toast's Undo). */
  const restore = useCallback((view: View, index: number) => update((list) => [...list.slice(0, index), view, ...list.slice(index)]), [update]);

  const drop = useCallback((id: string) => update((list) => list.filter((v) => v.id !== id)), [update]);

  const markSeen = useCallback(
    (id: string) => update((list) => list.map((v) => (v.id === id ? { ...v, seen: new Date().toISOString() } : v))),
    [update],
  );

  return { views, find, save, restore, drop, markSeen };
}

/** Each search's matches, shared for five minutes: the sidebar and Inbox rerun every view on every page. */
const FRESH_MS = 5 * 60 * 1000;
const matches = new Map<string, { at: number; rows?: NoticeSummary[]; pending?: boolean }>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const queryKey = (query: SearchQuery) => JSON.stringify(query);

/**
 * A search by meaning always answers with its nearest 50, however far the 50th is. What
 * counts as a match for a view or the Inbox is the part near the top: within 0.12 of the best
 * hit, and never below 0.30 (the cards' "Fair"). On live data that keeps 2 of 50 for "AI
 * chatbot and knowledge base" and 5 for Pragnition's profile, and drops the kitchen staff.
 */
const NEAR_TOP = 0.12;
const FLOOR = 0.3;

function matchesOf(found: Awaited<ReturnType<typeof runSearch>>): NoticeSummary[] {
  if (found.mode === "browse") return found.rows.map((r) => r.notice);
  const bar = Math.max(FLOOR, (found.rows[0]?.score ?? 0) - NEAR_TOP);
  return found.rows.filter((r) => (r.score ?? 0) >= bar).map((r) => r.notice);
}

function fetchMatches(api: KopiApi, query: SearchQuery) {
  const key = queryKey(query);
  const entry = matches.get(key);
  if (entry?.pending || (entry && Date.now() - entry.at < FRESH_MS)) return;
  matches.set(key, { ...entry, at: entry?.at ?? 0, pending: true });
  runSearch(api, query)
    .then(
      (found) => matches.set(key, { at: Date.now(), rows: matchesOf(found) }),
      () => matches.set(key, { at: Date.now(), rows: entry?.rows ?? [] }),
    )
    .finally(() => {
      version += 1;
      listeners.forEach((listener) => listener());
    });
}

/** What each search finds, in rank order, keyed by queryKey; `settled` once every one has answered. */
export function useMatches(queries: SearchQuery[]): { rows: Map<string, NoticeSummary[]>; settled: boolean } {
  const api = useApi();
  const seen = useSyncExternalStore(subscribe, () => version, () => 0);
  const keys = queries.map(queryKey);
  const joined = keys.join("\n");
  useEffect(() => {
    if (api) for (const key of joined.split("\n").filter(Boolean)) fetchMatches(api, JSON.parse(key) as SearchQuery);
  }, [api, joined]);
  return useMemo(() => {
    const rows = new Map<string, NoticeSummary[]>();
    for (const key of joined.split("\n").filter(Boolean)) {
      const found = matches.get(key)?.rows;
      if (found) rows.set(key, found);
    }
    return { rows, settled: rows.size === new Set(joined.split("\n").filter(Boolean)).size };
    // `seen` is the cache's version: a new one means some search answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, seen]);
}

/** The first moment of today in Singapore, as ISO. */
export function startOfToday(): string {
  return new Date(new Date(sgDayEnd(-1)).getTime() + 1).toISOString();
}

/**
 * How many of each view's matches were published since the person last opened it. A view
 * never opened counts from the start of today, so a new visitor sees today's news, not 50.
 */
export function useViewCounts(views: View[]): Map<string, number> {
  const { rows } = useMatches(views.map((v) => v.query));
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const view of views) {
      const found = rows.get(queryKey(view.query));
      if (!found) continue;
      const since = new Date(view.seen ?? startOfToday()).getTime();
      counts.set(view.id, found.filter((n) => new Date(n.published).getTime() > since).length);
    }
    return counts;
  }, [views, rows]);
}
