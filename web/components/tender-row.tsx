import Link from "next/link";

import type { NoticeSummary } from "@/lib/api";
import { categoryLeaf, closingLabel, daysUntil, shortDate } from "@/lib/format";
import { displayTitle } from "@/lib/title-case";
import { cn } from "@/lib/utils";

export function tenderHref(docNo: string): string {
  return `/tender/?doc=${encodeURIComponent(docNo)}`;
}

/**
 * `text` with the words in `words` set in a heavier weight. `words` are the API's
 * highlights: lower-case tokens, split the way kopi.search.tokens splits.
 */
export function Highlighted({ text, words }: { text: string; words?: string[] }) {
  if (!words?.length) return <>{text}</>;
  const wanted = new Set(words.map((w) => w.toLowerCase()));
  return (
    <>
      {text.split(/([A-Za-z0-9]+)/).map((part, i) =>
        i % 2 === 1 && wanted.has(part.toLowerCase()) ? (
          <mark key={i} className="bg-transparent font-medium text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** A closing deadline as Linear shows priority: a small glyph, filled as time runs out. */
function Urgency({ days }: { days: number }) {
  const level = days <= 3 ? 3 : days <= 7 ? 2 : 1;
  return (
    <span className="flex h-3.5 shrink-0 items-end gap-[2px]" aria-hidden>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn("w-[3px] rounded-full", bar <= level ? (level === 3 ? "bg-unmet" : "bg-foreground/60") : "bg-foreground/12")}
          style={{ height: `${bar * 4 + 2}px` }}
        />
      ))}
    </span>
  );
}

/**
 * A row's hairline sits between it and the row above, inset from the card's edge, and fades
 * while either row is hovered so the rounded hover never has a line across it.
 */
export const ROW =
  "kopi-row relative rounded-lg transition-colors hover:bg-muted/80 before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-border/80 before:transition-opacity first:before:hidden hover:before:opacity-0 [.kopi-row:hover+&]:before:opacity-0";

/** One opportunity in a list: what, who, and how long is left. Search adds highlights and a score. */
export function TenderRow({
  notice,
  compact = false,
  highlights,
  score,
}: {
  notice: NoticeSummary;
  compact?: boolean;
  highlights?: string[];
  score?: number;
}) {
  const days = daysUntil(notice.closing);
  const urgent = days <= 3;
  // A search result sets its title in the regular weight, so the matched words can stand out.
  const highlighted = highlights !== undefined;
  return (
    <Link
      href={tenderHref(notice.doc_no)}
      className={cn(ROW, "flex items-start gap-3 px-3 py-3")}
    >
      <span className="mt-[5px]">
        <Urgency days={days} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p
            className={cn(
              "line-clamp-2 text-[14px] leading-[1.4] tracking-[-0.005em] text-pretty text-foreground",
              highlighted ? "font-normal" : "font-book",
            )}
          >
            <Highlighted text={displayTitle(notice.title)} words={highlights} />
          </p>
          <p className="truncate text-[12.5px] text-muted-foreground">
            {notice.agency}
            {!compact && notice.category && <span> · {categoryLeaf(notice.category)}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 text-[12.5px] sm:flex-col sm:flex-nowrap sm:items-end sm:gap-1">
          <span className={cn("tabular-nums", urgent ? "font-book text-unmet" : "text-foreground/85")}>{closingLabel(notice.closing)}</span>
          {!compact && (
            <span className="text-muted-foreground tabular-nums">
              {notice.type} · {shortDate(notice.closing)}
              {score !== undefined && (
                <span title="How closely this notice matches your search, from 0 to 1"> · Match {score.toFixed(2)}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** A list in a card: a quiet header, then rows separated by inset hairlines. */
export function ListCard({
  id,
  title,
  count,
  action,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card">
      <div className="flex h-12 items-center gap-2 px-5">
        <h2 id={id} className="truncate text-[14px] font-medium tracking-[-0.01em]">
          {title}
        </h2>
        {count !== undefined && <span className="text-[13px] text-muted-foreground tabular-nums">{count}</span>}
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      <div className="flex flex-col px-2 pb-2">{children}</div>
    </section>
  );
}
