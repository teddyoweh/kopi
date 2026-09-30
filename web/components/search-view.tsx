"use client";

import { Layers, Search, SearchX } from "lucide-react";
import { useEffect, useState } from "react";

import { FilterChip, type ChipOption } from "@/components/filter-chip";
import { useApi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { QueryInput } from "@/components/query-input";
import { Results, type Row } from "@/components/search/results";
import { SaveView } from "@/components/search/save-view";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/states";
import { toast } from "@/components/ui/toast";
import { useAsync } from "@/lib/use-async";
import { useQueryText, useUrlParams } from "@/lib/use-url-query";
import { cn } from "@/lib/utils";
import { readSearchQuery, runSearch, sameQuery, SEARCH_LIMIT, useViews, type SearchQuery } from "@/lib/views";

const CATEGORIES: ChipOption[] = [
  { value: "IT&Telecommunication", label: "IT & Telecommunication" },
  { value: "Services", label: "Services" },
  { value: "Construction", label: "Construction" },
  { value: "Facilities Management", label: "Facilities Management" },
  { value: "Administration & Training", label: "Administration & Training" },
  { value: "Miscellaneous", label: "Miscellaneous" },
];

const METHODS: ChipOption[] = [
  { value: "Open Quotation", label: "Open Quotation" },
  { value: "Open Tender", label: "Open Tender" },
  { value: "Open Tender Lite", label: "Open Tender Lite" },
  { value: "Open Request for Information", label: "Request for Information" },
];

const WINDOWS: ChipOption[] = [
  { value: "7", label: "Closes within 7 days" },
  { value: "30", label: "Closes within 30 days" },
];

const EXAMPLES = [
  "CCTV installation and maintenance",
  "Cleaning services for schools",
  "Event management for a festival",
  "IT helpdesk and managed services",
  "Landscaping and tree pruning",
  "Training workshops for officers",
];

/** `key` names the query and filters it answers, so per-result UI state resets with it. */
type Result = { key: string; mode: "search" | "browse"; total: number; rows: Row[] };

/** Agencies in the results, most results first: the only values the exact agency filter can match. */
function agencyOptions(rows: Row[]): ChipOption[] {
  const counts = new Map<string, number>();
  for (const { notice } of rows) counts.set(notice.agency, (counts.get(notice.agency) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([agency, count]) => ({ value: agency, label: agency, count }));
}

function summaryLine(result: Result, q: string): string {
  const n = result.rows.length;
  if (result.mode === "browse") return n >= SEARCH_LIMIT ? `The ${SEARCH_LIMIT} newest open tenders that fit these filters` : `${n} open tender${n === 1 ? "" : "s"} fit these filters, newest first`;
  if (result.total > n) return `The ${n} closest of ${result.total} open tenders for “${q}”`;
  return n >= SEARCH_LIMIT ? `The ${n} closest open tenders for “${q}”` : `${n} open tender${n === 1 ? "" : "s"} for “${q}”, closest first`;
}

/** "tenders matching “cleaning”, closing within 7 days": a view's search, read back. */
function describe(query: SearchQuery): string {
  const parts = [
    query.q ? `tenders matching “${query.q}”` : "open tenders",
    query.category && CATEGORIES.find((c) => c.value === query.category)?.label,
    query.method,
    query.closing && WINDOWS.find((w) => w.value === query.closing)?.label.toLowerCase(),
    query.agency && `from ${query.agency}`,
  ];
  return parts.filter(Boolean).join(", ");
}

function Examples({ onPick }: { onPick: (query: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">Describe the work in your own words; Kopi searches every open notice by meaning. A few to start with:</p>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="group flex h-9 items-center gap-2 rounded-full border bg-card pr-4 pl-3 text-left text-[13px] transition-colors hover:border-kopi/30 hover:bg-kopi-soft/60"
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-kopi" aria-hidden />
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SearchView() {
  const api = useApi();
  const [params, update] = useUrlParams();
  const query = readSearchQuery(params);
  const { q, category, method, closing, agency } = query;
  const box = useQueryText(q, update);
  const [attempt, setAttempt] = useState(0);
  const filtered = Boolean(category || method || closing || agency);
  const idle = !q && !filtered;
  const { views, markSeen, restore } = useViews();
  const viewId = params.get("view");
  const view = views.find((v) => v.id === viewId && sameQuery(v.query, query)) ?? null;

  const state = useAsync<Result | null>(async () => {
    if (!api || idle) return null;
    const key = JSON.stringify([q, category, method, closing, agency]);
    return { key, ...(await runSearch(api, { q, category, method, closing, agency })) };
  }, [api, idle, q, category, method, closing, agency, attempt]);

  // Opening a view is reading it: the sidebar's count of new notices starts again from now.
  const opened = view?.id;
  useEffect(() => {
    if (opened && state.status === "ready") markSeen(opened);
  }, [opened, state.status, markSeen]);
  // Changing the words or filters leaves the view; the sidebar stops marking it.
  useEffect(() => {
    if (viewId && !view) update({ view: null });
  }, [viewId, view, update]);

  // Keep the last answer on screen, dimmed, while the next one is on its way.
  const [shown, setShown] = useState<Result | null>(null);
  if (state.status === "ready" && state.data !== shown) setShown(state.data);
  const loading = state.status === "loading" && !idle;

  const found = agencyOptions(shown?.rows ?? []);
  const agencies = agency && !found.some((o) => o.value === agency) ? [{ value: agency, label: agency }, ...found] : found;

  return (
    <>
      <PageHeader
        title={view ? view.name : "Search"}
        crumbs={view ? [{ label: "Views" }] : []}
        description={view ? `A saved view: ${describe(query)}. The sidebar counts what is published after each visit.` : "Every open GeBIZ opportunity, searched by meaning rather than exact words."}
        actions={
          !idle && (
            <SaveView
              query={query}
              onSaved={(saved) => {
                update({ view: saved.id });
                toast({ title: `Saved “${saved.name}” to Views`, description: "The sidebar counts what is new each time you look.", icon: Layers });
              }}
              onRemoved={(removed, index) => {
                update({ view: null });
                toast({ title: `Removed “${removed.name}”`, icon: Layers, action: { label: "Undo", onClick: () => restore(removed, index) } });
              }}
            />
          )
        }
      />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3.5">
          <QueryInput
            value={box.text}
            onChange={box.setText}
            onClear={() => box.commit("")}
            busy={loading && Boolean(shown)}
            label="Search open tenders"
            placeholder="What does your company do?"
          />
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip label="Category" anyLabel="Any category" value={category} options={CATEGORIES} onChange={(v) => update({ category: v })} />
            <FilterChip label="Method" anyLabel="Any method" value={method} options={METHODS} onChange={(v) => update({ method: v })} />
            <FilterChip label="Closing" anyLabel="Any closing date" value={closing} options={WINDOWS} onChange={(v) => update({ closing: v })} />
            <FilterChip
              label="Agency"
              anyLabel="Any agency"
              value={agency}
              options={agencies}
              onChange={(v) => update({ agency: v })}
              disabled={!agency && agencies.length === 0}
            />
            {filtered && (
              <button
                type="button"
                onClick={() => update({ category: null, method: null, closing: null, agency: null })}
                className="h-8 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {idle ? (
          <Examples onPick={box.commit} />
        ) : state.status === "error" ? (
          <ErrorState error={state.error} onRetry={() => setAttempt((n) => n + 1)} />
        ) : !shown ? (
          <RowsSkeleton rows={6} />
        ) : (
          <div aria-busy={loading} className={cn("flex flex-col gap-3 transition-opacity", loading && "opacity-60")}>
            {shown.rows.length > 0 ? (
              <Results key={shown.key} rows={shown.rows} summary={summaryLine(shown, q)} q={q} />
            ) : (
              <EmptyState icon={SearchX} title={q ? `No open tenders match “${q}”` : "No open tenders fit these filters"}>
                {filtered ? (
                  <>
                    Try fewer words, or{" "}
                    <button
                      type="button"
                      onClick={() => update({ category: null, method: null, closing: null, agency: null })}
                      className="font-medium text-kopi underline-offset-4 hover:underline"
                    >
                      clear the filters
                    </button>
                    .
                  </>
                ) : (
                  "Try fewer words, or describe the work differently: what you would deliver, not the product name."
                )}
              </EmptyState>
            )}
          </div>
        )}
      </div>
    </>
  );
}
