"use client";

import { useCallback, useMemo } from "react";

import { useNow } from "@/components/bid/time";
import { useKopi } from "@/components/kopi-provider";

import type { BidStage, NoticeSummary } from "./api";
import { useBidStatuses } from "./bid-status";
import { useBids, type Bid } from "./bids";
import { daysUntil } from "./format";
import { profileQuery } from "./profiles";
import { useStored } from "./stored";
import { EMPTY_QUERY, queryKey, useMatches, useViews, type SearchQuery } from "./views";

/**
 * What needs the person, worked out from what Kopi already knows rather than from a feed:
 * each bid once (its deadline if that is within a week, else the next step Kopi set, or that
 * nobody has started it), then notices published this week near the top of the company's
 * own search or a saved view's. Only read and done
 * state is stored, so the Inbox is always true to the bids and the market as they are now.
 */
export type InboxKind = "deadline" | "next" | "unstarted" | "match";

export type InboxItem = {
  id: string;
  kind: InboxKind;
  doc: string;
  title: string;
  agency: string;
  closing: string;
  /** When it happened, for the time shown on the row. */
  at: string;
  /** The line under the title: the next step, or why a notice is here. */
  text: string;
  urgent: boolean;
  bid?: Bid;
  stage?: BidStage | null;
  notice?: NoticeSummary;
};

/** Match notices published in the last week, from the top of each search. */
const MATCH_DAYS = 7;
const MATCH_DEPTH = 10;
const DEADLINE_DAYS = 7;
const KEEP = 400;

type ReadState = { read: string[]; done: string[] };
const NO_STATE: ReadState = { read: [], done: [] };
const INBOX_KEY = "kopi.inbox";

/** A short stable tag for a piece of text, so a changed next step is a new item. */
function tag(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

const WEIGHT: Record<InboxKind, number> = { deadline: 0, next: 1, unstarted: 2, match: 3 };

export function useInbox() {
  const now = useNow(60_000);
  const { bids } = useBids();
  const { views } = useViews();
  const { profile } = useKopi();
  const { statuses, settled: bidsSettled } = useBidStatuses(bids.map((b) => b.session_id));

  const profileSearch = useMemo<SearchQuery>(() => ({ ...EMPTY_QUERY, q: profileQuery(profile) }), [profile]);
  const searches = useMemo(
    () => [{ query: profileSearch, source: `Matches ${profile.name}` }, ...views.filter((v) => v.query.q).map((v) => ({ query: v.query, source: `New in ${v.name}` }))],
    [profileSearch, profile.name, views],
  );
  const { rows, settled: matchesSettled } = useMatches(searches.map((s) => s.query));

  const items = useMemo(() => {
    const list: InboxItem[] = [];
    const bidding = new Set(bids.map((b) => b.doc_no));

    // One item per bid, so a bid never shows twice: its deadline when that is close, else its next step.
    for (const bid of bids) {
      const closingAt = new Date(bid.closing).getTime();
      if (closingAt <= now) continue;
      const status = bid.session_id ? statuses.get(bid.session_id) : undefined;
      const step = status?.memory.next_step ?? null;
      const base = { doc: bid.doc_no, title: bid.title, agency: bid.agency, closing: bid.closing, bid, stage: status?.memory.stage };
      const text = bid.session_id ? (step ?? "") : "Kopi hasn't started on this bid yet.";
      if (daysUntil(bid.closing, now) <= DEADLINE_DAYS) {
        const final = closingAt - now < 48 * 3600e3;
        list.push({ ...base, id: `deadline:${bid.doc_no}:${final ? "48h" : "7d"}:${tag(text)}`, kind: "deadline", at: bid.closing, text, urgent: final });
      } else if (!bid.session_id) {
        list.push({ ...base, id: `unstarted:${bid.doc_no}`, kind: "unstarted", at: bid.added, text, urgent: false });
      } else if (step) {
        list.push({ ...base, id: `next:${bid.doc_no}:${tag(step)}`, kind: "next", at: status?.memory.updated ?? bid.added, text: step, urgent: false });
      }
    }

    const since = now - MATCH_DAYS * 86400e3;
    const matched = new Set<string>();
    for (const { query, source } of searches) {
      for (const notice of (rows.get(queryKey(query)) ?? []).slice(0, MATCH_DEPTH)) {
        if (matched.has(notice.doc_no) || bidding.has(notice.doc_no)) continue;
        if (new Date(notice.published).getTime() < since || new Date(notice.closing).getTime() <= now) continue;
        matched.add(notice.doc_no);
        list.push({ id: `match:${notice.doc_no}`, kind: "match", doc: notice.doc_no, title: notice.title, agency: notice.agency, closing: notice.closing, at: notice.published, text: source, urgent: false, notice });
      }
    }

    return list.sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        WEIGHT[a.kind] - WEIGHT[b.kind] ||
        (a.kind === "deadline" ? a.closing.localeCompare(b.closing) : b.at.localeCompare(a.at)),
    );
  }, [bids, statuses, searches, rows, now]);

  const [state, update] = useStored<ReadState>(INBOX_KEY, NO_STATE);
  const read = useMemo(() => new Set(state.read), [state.read]);
  const done = useMemo(() => new Set(state.done), [state.done]);
  const open = useMemo(() => items.filter((i) => !done.has(i.id)), [items, done]);

  const add = useCallback(
    (field: keyof ReadState, ids: string[]) =>
      update((s) => ({ ...s, [field]: [...s[field].filter((id) => !ids.includes(id)), ...ids].slice(-KEEP) })),
    [update],
  );
  const markRead = useCallback((id: string) => add("read", [id]), [add]);
  const markAllRead = useCallback(() => add("read", open.map((i) => i.id)), [add, open]);
  const markDone = useCallback((id: string) => update((s) => ({ read: [...s.read.filter((x) => x !== id), id].slice(-KEEP), done: [...s.done.filter((x) => x !== id), id].slice(-KEEP) })), [update]);
  const undoDone = useCallback((id: string) => update((s) => ({ ...s, done: s.done.filter((x) => x !== id) })), [update]);

  return {
    items: open,
    unread: open.filter((i) => !read.has(i.id)).length,
    isRead: (id: string) => read.has(id),
    markRead,
    markAllRead,
    markDone,
    undoDone,
    loading: !bidsSettled || !matchesSettled,
  };
}
