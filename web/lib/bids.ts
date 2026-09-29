"use client";

import { useCallback } from "react";

import type { Notice, NoticeSummary } from "./api";
import { TRACKED_KEY, type Tracked } from "./submissions";
import { useStored } from "./stored";

/**
 * The bids this browser is working, one per tender. A bid is a tracked tender plus the copilot
 * session that works it, so everything tracked before bids existed shows up as a bid that has
 * not started yet. The session's memory and documents live on the API; this record only
 * remembers which session belongs to which tender, and for which company.
 */
export type Bid = Tracked & { session_id?: string | null; profile_id?: string | null };

const NO_BIDS: Bid[] = [];

export function bidHref(doc: string, start = false): string {
  const params = new URLSearchParams({ doc });
  if (start) params.set("start", "1");
  return `/bid/?${params.toString()}`;
}

export function useBids() {
  const [bids, update] = useStored<Bid[]>(TRACKED_KEY, NO_BIDS);

  const bidFor = useCallback((doc: string) => bids.find((b) => b.doc_no === doc) ?? null, [bids]);

  /** Open (or create) the bid for a tender. A bid with no session yet starts its copilot on arrival. */
  const startBid = useCallback(
    (notice: Notice | NoticeSummary, profileId: string): string => {
      const { doc_no, title, agency, closing, url } = notice;
      const existing = bids.find((b) => b.doc_no === doc_no);
      update((list) => [
        ...list.filter((b) => b.doc_no !== doc_no),
        { ...existing, doc_no, title, agency, closing, url, added: existing?.added ?? new Date().toISOString(), profile_id: existing?.profile_id ?? profileId },
      ]);
      return bidHref(doc_no, !existing?.session_id);
    },
    [bids, update],
  );

  /** The copilot session that works this bid, once its first turn has one. */
  const attachSession = useCallback(
    (doc: string, sessionId: string) => update((list) => list.map((b) => (b.doc_no === doc ? { ...b, session_id: sessionId } : b))),
    [update],
  );

  const dropBid = useCallback((doc: string) => update((list) => list.filter((b) => b.doc_no !== doc)), [update]);

  return { bids, bidFor, startBid, attachSession, dropBid };
}
