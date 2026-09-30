"use client";

import type { NoticeSummary } from "./api";
import { readStored, updateStored, useStored } from "./stored";

/** Tenders opened in this browser, newest first: the command palette's Recent group. */
export type Recent = Pick<NoticeSummary, "doc_no" | "title" | "agency" | "closing">;

const RECENTS_KEY = "kopi.recents";
const KEEP = 8;
const NO_RECENTS: Recent[] = [];

export function recordVisit({ doc_no, title, agency, closing }: Recent): void {
  const newest = readStored(RECENTS_KEY, NO_RECENTS)[0];
  if (newest?.doc_no === doc_no && newest.title === title && newest.closing === closing) return;
  updateStored(RECENTS_KEY, NO_RECENTS, (list) => [{ doc_no, title, agency, closing }, ...list.filter((r) => r.doc_no !== doc_no)].slice(0, KEEP));
}

export function useRecents(): Recent[] {
  return useStored(RECENTS_KEY, NO_RECENTS)[0];
}
