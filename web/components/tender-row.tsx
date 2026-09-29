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
      className="group flex flex-col gap-1.5 rounded-lg px-3 py-3 transition-colors hover:bg-muted sm:flex-row sm:items-start sm:gap-6"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className={cn(
            "leading-snug text-foreground",
            highlighted ? "font-normal" : "font-medium",
            compact ? "line-clamp-2 text-sm" : "line-clamp-2 text-[15px]",
          )}
        >
          <Highlighted text={notice.title} words={highlights} />
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {notice.agency}
          {!compact && notice.category && <span> · {categoryLeaf(notice.category)}</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 text-sm sm:flex-col sm:flex-nowrap sm:items-end sm:gap-0.5">
        <span className={cn("font-medium tabular-nums", urgent ? "text-kopi" : "text-foreground")}>{closingLabel(notice.closing)}</span>
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
    </Link>
  );
}
