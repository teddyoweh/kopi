"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useApi, useKopi } from "@/components/kopi-provider";
import { useStartBid } from "@/components/search/actions";
import { PreviewPane } from "@/components/search/preview-pane";
import { queryWords, ResultCard } from "@/components/search/result-card";
import { useInsights } from "@/components/search/use-insights";
import { tenderHref } from "@/components/tender-row";
import type { NoticeSummary } from "@/lib/api";

export type Row = { notice: NoticeSummary; score?: number; highlights?: string[] };

const FIRST_PAGE = 20;
const WIDE = "(min-width: 1280px)";

/** Whether the preview pane is showing: selecting a card previews it there instead of opening it. */
function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

/** Keys typed into a field belong to the field. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-md border bg-card px-1 font-sans text-[11px] text-foreground/70">{children}</kbd>;
}

/**
 * The results as cards, with the selected one previewed beside them on wide screens.
 * j/k (or the arrow keys) move the selection, Enter opens it, and b starts its bid.
 */
export function Results({ rows, summary, q }: { rows: Row[]; summary: string; q: string }) {
  const api = useApi();
  const { profile } = useKopi();
  const router = useRouter();
  const bids = useStartBid();
  const wide = useWide();
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState(0);
  const cards = useRef<(HTMLElement | null)[]>([]);
  const visible = all ? rows : rows.slice(0, FIRST_PAGE);
  const insights = useInsights(api, visible.map((row) => row.notice.doc_no), profile, q);
  const words = queryWords(q);
  const current = visible[Math.min(selected, visible.length - 1)];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      const move = (to: number) => {
        event.preventDefault();
        const next = Math.max(0, Math.min(visible.length - 1, to));
        setSelected(next);
        cards.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      if (event.key === "j" || event.key === "ArrowDown") move(selected + 1);
      else if (event.key === "k" || event.key === "ArrowUp") move(selected - 1);
      else if (event.key === "Enter" && current && !(event.target as HTMLElement | null)?.closest("a, button")) router.push(tenderHref(current.notice.doc_no));
      else if (event.key === "b" && current) bids.start(current.notice);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible.length, selected, current, router, bids]);

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <section aria-label="Results" className="flex min-w-0 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4 px-1">
          <h2 className="text-[13px] text-muted-foreground" aria-live="polite">
            {summary}
          </h2>
          <p className="hidden shrink-0 items-center gap-1 text-[12px] text-muted-foreground xl:flex">
            <Kbd>j</Kbd>
            <Kbd>k</Kbd> move <span className="px-1">·</span> <Kbd>↵</Kbd> open <span className="px-1">·</span> <Kbd>b</Kbd> start bid
          </p>
        </div>
        <ol className="flex flex-col gap-2.5">
          {visible.map((row, i) => (
            <li key={row.notice.doc_no}>
              <ResultCard
                ref={(el) => {
                  cards.current[i] = el;
                }}
                notice={row.notice}
                score={row.score}
                highlights={row.highlights}
                words={words}
                insight={insights.get(row.notice.doc_no)}
                selected={wide && row === current}
                onSelect={() => (wide ? setSelected(i) : router.push(tenderHref(row.notice.doc_no)))}
              />
            </li>
          ))}
        </ol>
        {visible.length < rows.length && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="h-10 w-full rounded-xl border border-dashed text-[13px] font-book text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            Show all {rows.length}
          </button>
        )}
      </section>
      <div className="sticky top-18 hidden xl:block">
        <PreviewPane notice={current?.notice ?? null} />
      </div>
    </div>
  );
}
