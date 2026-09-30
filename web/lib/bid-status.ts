"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import { useApi } from "@/components/kopi-provider";

import type { BidMemory, KopiApi, SessionFile } from "./api";

/** What a started bid's session says about it: where it stands, and what Kopi has written for it. */
export type BidStatus = { memory: BidMemory; drafts: number; uploads: number };

type Entry = { at: number; status?: BidStatus; failed?: boolean; pending?: boolean };

/**
 * The sidebar, Home, Bids and Inbox all show every bid's stage. One store serves them: a
 * session is fetched at most once a minute however many views show it, and the bid page
 * writes what it learns first (primeBidStatus), so a stage Kopi moves shows everywhere at once.
 */
const FRESH_MS = 60_000;
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function counts(files: SessionFile[]) {
  const uploads = files.filter((f) => f.kind === "upload").length;
  return { drafts: files.length - uploads, uploads };
}

function load(api: KopiApi, session: string) {
  const entry = entries.get(session);
  if (entry?.pending || (entry && Date.now() - entry.at < FRESH_MS)) return;
  entries.set(session, { ...entry, at: entry?.at ?? 0, pending: true });
  Promise.all([api.memory(session), api.sessionFiles(session)])
    .then(
      ([memory, files]) => entries.set(session, { at: Date.now(), status: { memory, ...counts(files) } }),
      () => entries.set(session, { at: Date.now(), status: entry?.status, failed: true }),
    )
    .finally(notify);
}

/** The bid page's own reading of its session, shared with every other view. */
export function primeBidStatus(session: string, memory: BidMemory, files?: SessionFile[]): void {
  const previous = entries.get(session)?.status;
  const known = files ? counts(files) : { drafts: previous?.drafts ?? 0, uploads: previous?.uploads ?? 0 };
  entries.set(session, { at: Date.now(), status: { memory, ...known } });
  notify();
}

/** Each session's status, fetched when missing or stale; `settled` once every session has answered or failed. */
export function useBidStatuses(sessions: (string | null | undefined)[]): { statuses: Map<string, BidStatus>; settled: boolean } {
  const api = useApi();
  const seen = useSyncExternalStore(subscribe, () => version, () => 0);
  const key = sessions.filter(Boolean).join(",");
  useEffect(() => {
    if (!api) return;
    for (const session of key.split(",").filter(Boolean)) load(api, session);
  }, [api, key]);
  return useMemo(() => {
    const statuses = new Map<string, BidStatus>();
    let settled = true;
    for (const session of key.split(",").filter(Boolean)) {
      const entry = entries.get(session);
      if (entry?.status) statuses.set(session, entry.status);
      else if (!entry?.failed) settled = false;
    }
    return { statuses, settled };
    // `seen` is the store's version: a new one means an entry changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, seen]);
}

/** One bid's status: null until its session has answered, or when the bid has not started. */
export function useBidStatus(session: string | null | undefined): { status: BidStatus | null; loading: boolean } {
  const { statuses, settled } = useBidStatuses([session]);
  return { status: session ? (statuses.get(session) ?? null) : null, loading: !settled };
}
