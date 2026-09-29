"use client";

import Link from "next/link";
import { forwardRef } from "react";

import { TenderActions } from "@/components/search/actions";
import { ChipSkeleton, ClosingChip, EligibilityChip, EnvelopesChip, MatchMeter, MethodChip, ValueChip } from "@/components/search/chips";
import { Highlighted, tenderHref } from "@/components/tender-row";
import type { NoticeSummary, TenderInsight } from "@/lib/api";
import { categoryLeaf } from "@/lib/format";
import { displayTitle } from "@/lib/title-case";
import { cn } from "@/lib/utils";

const MINOR = new Set("of and the for to in on at by with a an".split(" "));

/** "Ministry of Education - Schools" → "ME": the agency's initials, for the card's disc. */
export function initials(agency: string): string {
  const words = agency.replace(/\(.*?\)/g, "").split(/[\s-]+/).filter((w) => w && !MINOR.has(w.toLowerCase()));
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function AgencyDisc({ agency }: { agency: string }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-foreground/70" aria-hidden>
      {initials(agency)}
    </span>
  );
}

/** A query's words, split the way kopi.search.tokens splits, for marking them in the snippet. */
export function queryWords(q: string): string[] {
  const stop = new Set("a an and at for from in of on or the to with by we our".split(" "));
  return (q.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !stop.has(w) && w.length > 1);
}

export type CardProps = {
  notice: NoticeSummary;
  score?: number;
  highlights?: string[];
  words: string[];
  insight: TenderInsight | "failed" | undefined;
  selected: boolean;
  onSelect: () => void;
};

/**
 * One search result as a card: who, what, why it matched, whether the company can bid, what
 * similar work sold for, and the three things to do next. A click selects it for the preview
 * pane (the title still opens the tender).
 */
export const ResultCard = forwardRef<HTMLElement, CardProps>(function ResultCard({ notice, score, highlights, words, insight, selected, onSelect }, ref) {
  const ready = insight && insight !== "failed" ? insight : null;
  return (
    <article
      ref={ref}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group/card flex cursor-default flex-col gap-3 rounded-xl border bg-card px-4 py-4 transition-[border-color,box-shadow] sm:px-5",
        selected ? "border-kopi/40 ring-3 ring-kopi/10" : "hover:border-foreground/15",
      )}
    >
      <div className="flex min-h-7 items-center gap-2.5">
        <AgencyDisc agency={notice.agency} />
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
          {notice.agency}
          {notice.category && <span> · {categoryLeaf(notice.category)}</span>}
        </p>
        <div className="hidden shrink-0 sm:block">
          <TenderActions notice={notice} compact emphasis={selected} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-[15px] leading-snug font-book tracking-[-0.01em] text-pretty">
          <Link href={tenderHref(notice.doc_no)} onClick={(e) => e.stopPropagation()} className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-kopi/30">
            <Highlighted text={displayTitle(notice.title)} words={highlights} />
          </Link>
        </h3>
        {ready?.snippet ? (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            <Highlighted text={ready.snippet} words={words} />
          </p>
        ) : insight === undefined ? (
          <span className="flex flex-col gap-1.5 py-0.5" aria-hidden>
            <ChipSkeleton width="w-4/5" />
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-live="polite">
          {score !== undefined && (
            <span className="mr-1">
              <MatchMeter score={score} />
            </span>
          )}
          {ready ? (
            <>
              <EligibilityChip summary={ready.eligibility} />
              <ClosingChip closing={notice.closing} />
              {ready.market && <ValueChip market={ready.market} />}
              <span className="hidden sm:contents">
                {ready.procurement_method && <MethodChip method={ready.procurement_method} />}
                {ready.two_envelope && <EnvelopesChip />}
              </span>
            </>
          ) : (
            <>
              {insight === undefined && <ChipSkeleton width="w-36" />}
              <ClosingChip closing={notice.closing} />
              {insight === undefined && <ChipSkeleton width="w-40" />}
              <span className="hidden sm:contents">
                <MethodChip method={notice.type} />
              </span>
            </>
          )}
        </div>
        <div className="sm:hidden">
          <TenderActions notice={notice} compact emphasis={false} />
        </div>
      </div>
    </article>
  );
});
