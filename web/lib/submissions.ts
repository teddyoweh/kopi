"use client";

import { useCallback, useMemo } from "react";

import type { Notice, NoticeSummary } from "./api";
import { readStored, updateStored, useStored } from "./stored";

/**
 * What the person is pursuing, kept in this browser: the tracked tenders, the checklist ticks
 * per tender, and the copilot drafts written for each tender.
 */
export const TRACKED_KEY = "kopi.submissions";
export const TICKS_KEY = "kopi.checklistTicks";
export const DRAFTS_KEY = "kopi.tenderDrafts";

export type Tracked = Pick<NoticeSummary, "doc_no" | "title" | "agency" | "closing" | "url"> & { added: string };
export type DraftRef = { session_id: string; file: string; at: string };

const NO_TRACKED: Tracked[] = [];
const NO_TICKS: Record<string, string[]> = {};
const NO_DRAFTS: Record<string, DraftRef[]> = {};
const NO_IDS: string[] = [];
const NO_REFS: DraftRef[] = [];

/** A GeBIZ document number: agency prefix, "ET", a type letter, then eight digits ("NYP000ETT26000014"). */
export const DOC_NO = /\b[A-Z0-9]{6}ET[A-Z]\d{8}\b/;

export function useTracked() {
  const [tracked, update] = useStored(TRACKED_KEY, NO_TRACKED);
  const isTracked = useCallback((doc: string) => tracked.some((t) => t.doc_no === doc), [tracked]);
  const track = useCallback(
    (notice: Notice | NoticeSummary) => {
      const { doc_no, title, agency, closing, url } = notice;
      update((list) => [...list.filter((t) => t.doc_no !== doc_no), { doc_no, title, agency, closing, url, added: new Date().toISOString() }]);
    },
    [update],
  );
  const untrack = useCallback((doc: string) => update((list) => list.filter((t) => t.doc_no !== doc)), [update]);
  return { tracked, isTracked, track, untrack };
}

export function useTicks(doc: string): [Set<string>, (id: string) => void] {
  const [all, update] = useStored(TICKS_KEY, NO_TICKS);
  const ids = all[doc] ?? NO_IDS;
  const ticked = useMemo(() => new Set(ids), [ids]);
  const toggle = useCallback(
    (id: string) =>
      update((current) => {
        const list = current[doc] ?? [];
        return { ...current, [doc]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
      }),
    [doc, update],
  );
  return [ticked, toggle];
}

export function useTenderDrafts(doc: string): DraftRef[] {
  const [all] = useStored(DRAFTS_KEY, NO_DRAFTS);
  return all[doc] ?? NO_REFS;
}

/** Remember that `file` in copilot session `session_id` was written for tender `doc`. */
export function recordDraft(doc: string, session_id: string, file: string): void {
  updateStored(DRAFTS_KEY, NO_DRAFTS, (current) => {
    const list = (current[doc] ?? []).filter((d) => !(d.session_id === session_id && d.file === file));
    return { ...current, [doc]: [...list, { session_id, file, at: new Date().toISOString() }] };
  });
}

/**
 * The tender a draft belongs to. The copilot names drafts `<doc_no>-<kind>.md`, so the file's
 * own document number wins (a conversation about one tender can draft for another); otherwise
 * it is the tender the conversation was opened from.
 */
export function draftTender(file: string, conversationDoc: string | null): string | null {
  return file.match(DOC_NO)?.[0] ?? conversationDoc;
}

/** Titles of tenders opened in this tab, so the copilot can name a tender without refetching it. */
const TITLES_KEY = "kopi.tenderTitles";
const NO_TITLES: Record<string, string> = {};

export function rememberTitle(doc: string, title: string): void {
  if (readStored(TITLES_KEY, NO_TITLES, "session")[doc] === title) return;
  updateStored(TITLES_KEY, NO_TITLES, (titles) => ({ ...titles, [doc]: title }), "session");
}

/** A tender's title if this browser already knows it: tracked, or opened in this tab. */
export function useKnownTitle(doc: string): string | null {
  const [tracked] = useStored(TRACKED_KEY, NO_TRACKED);
  const [titles] = useStored(TITLES_KEY, NO_TITLES, "session");
  return tracked.find((t) => t.doc_no === doc)?.title ?? titles[doc] ?? null;
}
