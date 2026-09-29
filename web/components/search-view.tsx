"use client";

import { Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";

import { FilterChip, type ChipOption } from "@/components/filter-chip";
import { useApi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { QueryInput } from "@/components/query-input";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/states";
import { ListCard, TenderRow } from "@/components/tender-row";
import type { NoticeSummary, TenderFilters } from "@/lib/api";
import { sgDayEnd } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import { useQueryText, useUrlParams } from "@/lib/use-url-query";
import { cn } from "@/lib/utils";

/** The live API's search depth: it re-ranks the 50 nearest notices, so 50 is everything it has. */
const LIMIT = 50;
const FIRST_PAGE = 20;

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

type Row = { notice: NoticeSummary; score?: number; highlights?: string[] };
/** `key` names the query and filters it answers, so per-result UI state resets with it. */
type Result = { key: string; mode: "search" | "browse"; total: number; rows: Row[] };

type Filters = { category: string | null; method: string | null; closing: string | null; agency: string | null };

function readFilters(params: URLSearchParams): Filters {
  const closing = params.get("closing");
  return {
    category: params.get("category"),
    method: params.get("method"),
    closing: closing && WINDOWS.some((w) => w.value === closing) ? closing : null,
    agency: params.get("agency"),
  };
}

function toApi(f: Filters): TenderFilters {
  return {
    status: "open",
    category: f.category ?? undefined,
    method: f.method ?? undefined,
    agency: f.agency ?? undefined,
    closing_before: f.closing ? sgDayEnd(Number(f.closing)) : undefined,
  };
}

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
  if (result.mode === "browse") return n >= LIMIT ? `The ${LIMIT} newest open tenders that fit these filters` : `${n} open tender${n === 1 ? "" : "s"} fit these filters, newest first`;
  if (result.total > n) return `The ${n} closest of ${result.total} open tenders for “${q}”`;
  return n >= LIMIT ? `The ${n} closest open tenders for “${q}”` : `${n} open tender${n === 1 ? "" : "s"} for “${q}”, closest first`;
}

function Examples({ onPick }: { onPick: (query: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">Describe the work in your own words; Kopi searches every open notice by meaning. A few to start with:</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="group flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3 text-left text-[13.5px] transition-colors hover:bg-muted/60"
          >
            <Search className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-kopi" aria-hidden />
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function Results({ rows, summary }: { rows: Row[]; summary: string }) {
  const [all, setAll] = useState(false);
  const visible = all ? rows : rows.slice(0, FIRST_PAGE);
  return (
    <ListCard id="results" title={summary}>
      {visible.map((row) => (
        <TenderRow key={row.notice.doc_no} notice={row.notice} highlights={row.highlights} score={row.score} />
      ))}
      {visible.length < rows.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="w-full border-t px-4 py-2.5 text-left text-[13px] font-medium text-kopi transition-colors hover:bg-muted/60"
        >
          Show all {rows.length}
        </button>
      )}
    </ListCard>
  );
}

export function SearchView() {
  const api = useApi();
  const [params, update] = useUrlParams();
  const q = (params.get("q") ?? "").trim();
  const filters = readFilters(params);
  const { category, method, closing, agency } = filters;
  const box = useQueryText(q, update);
  const [attempt, setAttempt] = useState(0);
  const filtered = Boolean(category || method || closing || agency);
  const idle = !q && !filtered;

  const state = useAsync<Result | null>(async () => {
    if (!api || idle) return null;
    const apiFilters = toApi({ category, method, closing, agency });
    const key = JSON.stringify([q, category, method, closing, agency]);
    if (q) {
      const found = await api.search(q, apiFilters, LIMIT);
      return { key, mode: "search", total: found.total, rows: found.hits };
    }
    const list = await api.tenders(apiFilters, LIMIT, 0);
    return { key, mode: "browse", total: list.length, rows: list.map((notice) => ({ notice })) };
  }, [api, idle, q, category, method, closing, agency, attempt]);

  // Keep the last answer on screen, dimmed, while the next one is on its way.
  const [shown, setShown] = useState<Result | null>(null);
  if (state.status === "ready" && state.data !== shown) setShown(state.data);
  const loading = state.status === "loading" && !idle;

  const agencies = useMemo(() => {
    const found = agencyOptions(shown?.rows ?? []);
    return agency && !found.some((o) => o.value === agency) ? [{ value: agency, label: agency }, ...found] : found;
  }, [shown, agency]);

  return (
    <>
      <PageHeader title="Search" description="Every open GeBIZ opportunity, searched by meaning rather than exact words." />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
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
                className="h-7 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
          <section aria-label="Results" aria-busy={loading} className={cn("flex flex-col gap-3 transition-opacity", loading && "opacity-60")}>
            {shown.rows.length > 0 ? (
              <>
                <p className="sr-only" aria-live="polite">
                  {summaryLine(shown, q)}
                </p>
                <Results key={shown.key} rows={shown.rows} summary={summaryLine(shown, q)} />
              </>
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
          </section>
        )}
      </div>
    </>
  );
}
