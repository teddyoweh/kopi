/**
 * Dates on GeBIZ are Singapore time, and a deadline read in the viewer's own zone is a
 * wrong deadline. Every date here is computed and shown in Asia/Singapore.
 */
const TZ = "Asia/Singapore";
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Singapore calendar day a moment falls on, as a day number. */
function sgDay(time: number): number {
  return Math.floor((time + SGT_OFFSET_MS) / DAY_MS);
}

/** Calendar days from today (Singapore) to the given moment: 0 is today, 1 tomorrow. */
export function daysUntil(iso: string, now = Date.now()): number {
  return sgDay(new Date(iso).getTime()) - sgDay(now);
}

/** "Closes today", "Closes tomorrow", "Closes in 9 days", "Closed". */
export function closingLabel(iso: string, now = Date.now()): string {
  if (new Date(iso).getTime() < now) return "Closed";
  const days = daysUntil(iso, now);
  if (days <= 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
}

export function isToday(iso: string, now = Date.now()): boolean {
  return daysUntil(iso, now) === 0;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
}

export function longToday(now = new Date()): string {
  return now.toLocaleDateString("en-SG", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
}

/** "22 Oct 2026, 4:00 pm SGT". */
export function dateTime(iso: string): string {
  const text = new Date(iso).toLocaleString("en-SG", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${text} SGT`;
}

const sgd = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });
const sgdCompact = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", notation: "compact", maximumFractionDigits: 1 });

export function money(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined) return "—";
  return (compact ? sgdCompact : sgd).format(value);
}

/** "IT&Telecommunication ⇒ Software Development" → "Software Development". */
export function categoryLeaf(category: string | null | undefined): string {
  if (!category) return "";
  return category.split("⇒").pop()!.trim();
}
