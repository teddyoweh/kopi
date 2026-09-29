import Link from "next/link";

import type { NoticeSummary } from "@/lib/api";
import { categoryLeaf, closingLabel, daysUntil, shortDate } from "@/lib/format";
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
          <mark key={i} className="bg-transparent font-semibold text-foreground">
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
          className={cn("w-[3px] rounded-[1px]", bar <= level ? (level === 3 ? "bg-unmet" : "bg-foreground/70") : "bg-foreground/15")}
          style={{ height: `${bar * 4 + 2}px` }}
        />
      ))}
    </span>
  );
}

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
      className="group flex items-start gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/70"
    >
      <span className="mt-1">
        <Urgency days={days} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p
            className={cn(
              "line-clamp-2 text-[14px] leading-snug text-foreground",
              highlighted ? "font-normal" : "font-medium",
            )}
          >
            <Highlighted text={notice.title} words={highlights} />
          </p>
          <p className="truncate text-[13px] text-muted-foreground">
            {notice.agency}
            {!compact && notice.category && <span> · {categoryLeaf(notice.category)}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 text-[13px] sm:flex-col sm:flex-nowrap sm:items-end sm:gap-0.5">
          <span className={cn("tabular-nums", urgent ? "font-medium text-unmet" : "text-foreground")}>{closingLabel(notice.closing)}</span>
          {!compact && (
            <span className="text-muted-foreground tabular-nums">
              {notice.type} · {shortDate(notice.closing)}
            </span>
          )}
          {score !== undefined && (
            <span className="text-xs text-muted-foreground tabular-nums" title="How closely this notice matches your search, from 0 to 1">
              <span className="sm:hidden">· </span>Match {score.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** A Linear list: a bordered card with a header strip, then hairline rows. */
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
    <section aria-labelledby={id} className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-10 items-center gap-2 border-b bg-muted/60 px-4">
        <h2 id={id} className="truncate text-[13px] font-medium">
          {title}
        </h2>
        {count !== undefined && <span className="text-[13px] text-muted-foreground tabular-nums">{count}</span>}
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
