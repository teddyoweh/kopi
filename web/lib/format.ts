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

/**
 * The last moment of the Singapore calendar day `daysAhead` days from today, as ISO.
 * `closing_before: sgDayEnd(7)` matches Overview's "Closing in 7 days" exactly.
 */
export function sgDayEnd(daysAhead: number, now = Date.now()): string {
  return new Date((sgDay(now) + daysAhead + 1) * DAY_MS - SGT_OFFSET_MS - 1).toISOString();
}

const grouped = new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 });

/** `value / unit` with one decimal while it is below `decimalsBelow`, dropping a trailing ".0". */
function scaled(value: number, unit: number, suffix: string, decimalsBelow: number): string {
  const n = value / unit;
  return `${n < decimalsBelow ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n)}${suffix}`;
}

/** "S$950", "S$84k", "S$410k", "S$1.2M", "S$18.7M"; never "S$1000k". en-SG writes a bare "$". */
export function moneyShort(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < 1_000) return `${sign}S$${Math.round(abs)}`;
  if (abs < 999_500) return `${sign}S$${scaled(abs, 1e3, "k", 10)}`;
  if (abs < 999_950_000) return `${sign}S$${scaled(abs, 1e6, "M", 100)}`;
  return `${sign}S$${scaled(abs, 1e9, "B", 100)}`;
}

/** "S$410,000", or "S$410k" when compact. */
export function money(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined) return "—";
  return compact ? moneyShort(value) : `${value < 0 ? "-" : ""}S$${grouped.format(Math.abs(value))}`;
}

/** "IT&Telecommunication ⇒ Software Development" → "Software Development". */
export function categoryLeaf(category: string | null | undefined): string {
  if (!category) return "";
  return category.split("⇒").pop()!.trim();
}

/** A copilot turn's cost, which the API reports in US dollars: "US$0.18". */
export function usd(value: number): string {
  if (value > 0 && value < 0.01) return "under US$0.01";
  return `US$${value.toFixed(2)}`;
}

/** "840 B", "2.4 KB", "1.1 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Time left until a deadline: the lead figure ("6 days", "5 hours", "12 minutes") and the
 * remainder ("4 hours", "12 minutes"), or `closed`. Absolute time, so the zone does not
 * matter; the deadline itself is shown with `dateTime` in SGT beside it.
 */
export function timeLeft(iso: string, now = Date.now()): { closed: boolean; lead: string; rest: string | null; hours: number } {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { closed: true, lead: "Closed", rest: null, hours: 0 };
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return { closed: false, lead: plural(days, "day"), rest: hours % 24 ? plural(hours % 24, "hour") : null, hours };
  if (hours >= 1) return { closed: false, lead: plural(hours, "hour"), rest: minutes % 60 ? plural(minutes % 60, "minute") : null, hours };
  return { closed: false, lead: plural(Math.max(minutes, 1), "minute"), rest: null, hours };
}
