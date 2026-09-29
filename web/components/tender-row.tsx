import Link from "next/link";

import type { NoticeSummary } from "@/lib/api";
import { categoryLeaf, closingLabel, daysUntil, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function tenderHref(docNo: string): string {
  return `/tender/?doc=${encodeURIComponent(docNo)}`;
}

/** One opportunity in a list: what, who, and how long is left. */
export function TenderRow({ notice, compact = false }: { notice: NoticeSummary; compact?: boolean }) {
  const days = daysUntil(notice.closing);
  const urgent = days <= 3;
  return (
    <Link
      href={tenderHref(notice.doc_no)}
      className="group flex flex-col gap-1.5 rounded-lg px-3 py-3 transition-colors hover:bg-muted sm:flex-row sm:items-start sm:gap-6"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("font-medium leading-snug text-foreground", compact ? "line-clamp-1 text-sm" : "line-clamp-2 text-[15px]")}>
          {notice.title}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {notice.agency}
          {!compact && notice.category && <span> · {categoryLeaf(notice.category)}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-sm sm:flex-col sm:items-end sm:gap-0.5">
        <span className={cn("font-medium tabular-nums", urgent ? "text-kopi" : "text-foreground")}>{closingLabel(notice.closing)}</span>
        {!compact && (
          <span className="text-muted-foreground tabular-nums">
            {notice.type} · {shortDate(notice.closing)}
          </span>
        )}
      </div>
    </Link>
  );
}
