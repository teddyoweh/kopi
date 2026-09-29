import type { ChecklistItem, EligibilityCheck, Notice } from "./api";
import { dateTime } from "./format";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What to prepare and send for a tender, by the same rules as kopi.checklist.submission_checklist,
 * for the mock (live serves `POST /tenders/{doc}/checklist`). Change both together.
 */
export function buildChecklist(notice: Notice, checks: EligibilityCheck[]): ChecklistItem[] {
  const unsettled = checks.filter((c) => c.kind !== "closing" && c.status !== "met");
  const items: ChecklistItem[] = unsettled.map((c, i) => ({
    id: `eligibility-${i + 1}`,
    label: `Settle: ${c.requirement}`,
    detail: c.reason,
    source: "eligibility",
  }));
  items.push({
    id: "clarify",
    label: "Send clarification questions early",
    source: "drafting",
    due: new Date(new Date(notice.closing).getTime() - 5 * DAY_MS).toISOString(),
    detail: "Agencies answer clarifications before a deadline set in the tender documents.",
  });
  (notice.items ?? []).forEach((item, i) =>
    items.push({ id: `item-${i + 1}`, label: `Price and respond to item ${i + 1}`, detail: item, source: "notice" }),
  );
  if (notice.two_envelope) {
    items.push({
      id: "envelopes",
      label: "Prepare two envelopes",
      source: "notice",
      detail: "The technical proposal and the price proposal are submitted separately.",
    });
  }
  items.push({
    id: "documents",
    label: "Download and read the tender documents on GeBIZ",
    source: "notice",
    detail: "They sit behind the GeBIZ login; Kopi reads only the public notice.",
  });
  items.push({
    id: "submit",
    label: "Submit on GeBIZ before closing",
    source: "submission",
    due: notice.closing,
    detail: `Closes ${dateTime(notice.closing)}. Kopi prepares; the submission is yours.`,
  });
  return items;
}
