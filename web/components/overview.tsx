"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { useApi, useKopi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { ErrorState, RowsSkeleton } from "@/components/states";
import { ListCard, TenderRow } from "@/components/tender-row";
import { Skeleton } from "@/components/ui/skeleton";
import type { KopiApi, NoticeSummary } from "@/lib/api";
import { daysUntil, isToday, longToday } from "@/lib/format";
import { profileQuery } from "@/lib/profiles";
import { useAsync } from "@/lib/use-async";

/** The API's largest page, and how many pages to ask for at once (4 × 200 covers ~750 open). */
const PAGE = 200;
const BATCH = 4;
/** The live API re-reads notices every 5 minutes; counts younger than that are current. */
const FRESH_MS = 5 * 60 * 1000;

/**
 * Every open opportunity's summary; the counts need all of them. Pages are fetched a batch
 * at a time in parallel, so ~750 notices is one round trip instead of four in a row, and a
 * notice that shifts across a page boundary between requests is counted once.
 */
async function fetchAllOpen(api: KopiApi): Promise<NoticeSummary[]> {
  const byDoc = new Map<string, NoticeSummary>();
  for (let start = 0; ; start += PAGE * BATCH) {
    const pages = await Promise.all(
      Array.from({ length: BATCH }, (_, i) => api.tenders({ status: "open" }, PAGE, start + i * PAGE)),
    );
    for (const page of pages) for (const notice of page) byDoc.set(notice.doc_no, notice);
    if (pages.some((page) => page.length < PAGE)) return [...byDoc.values()];
  }
}

const openCache = new WeakMap<KopiApi, { at: number; promise: Promise<NoticeSummary[]> }>();

/** fetchAllOpen, shared for FRESH_MS: coming back to Overview does not refetch ~750 notices. */
function allOpen(api: KopiApi): Promise<NoticeSummary[]> {
  const cached = openCache.get(api);
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.promise;
  const promise = fetchAllOpen(api);
  openCache.set(api, { at: Date.now(), promise });
  promise.catch(() => openCache.delete(api));
  return promise;
}

function Stat({ label, short, value, hint }: { label: string; short: string; value?: number; hint: string }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-4 sm:px-6 sm:py-5">
      <p className="text-[12.5px] text-muted-foreground">
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{label}</span>
      </p>
      {value === undefined ? (
        <Skeleton className="h-7 w-14 rounded-full" />
      ) : (
        <p className="text-[24px] leading-none font-medium tracking-[-0.03em] tabular-nums sm:text-[30px]">{value.toLocaleString("en-SG")}</p>
      )}
      <p className="hidden text-[12.5px] text-muted-foreground sm:block">{hint}</p>
    </div>
  );
}

function Stats({ api }: { api: KopiApi }) {
  const state = useAsync(() => allOpen(api), [api]);
  if (state.status === "error") return <ErrorState error={state.error} />;
  const open = state.data;
  return (
    <div className="grid grid-cols-3 divide-x divide-border/80 rounded-xl border bg-card">
      <Stat label="Open opportunities" short="Open" value={open?.length} hint="Accepting responses on GeBIZ" />
      <Stat label="Published today" short="New today" value={open?.filter((n) => isToday(n.published)).length} hint="New since midnight, Singapore time" />
      <Stat label="Closing in 7 days" short="Within 7 days" value={open?.filter((n) => daysUntil(n.closing) <= 7).length} hint="Decide on these first" />
    </div>
  );
}

function BestMatches({ api }: { api: KopiApi }) {
  const { profile } = useKopi();
  const state = useAsync(() => api.search(profileQuery(profile), { status: "open" }, 6), [api, profile]);
  return (
    <ListCard
      id="best-matches"
      title={`Best matches for ${profile.name}`}
      action={
        <Link
          href="/search"
          className="-mr-2 flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-book text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Search all <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
    >
      {state.status === "loading" && <RowsSkeleton rows={6} />}
      {state.status === "error" && (
        <div className="p-1">
          <ErrorState error={state.error} />
        </div>
      )}
      {state.status === "ready" &&
        (state.data.hits.length ? (
          state.data.hits.map((hit) => <TenderRow key={hit.notice.doc_no} notice={hit.notice} />)
        ) : (
          <p className="px-3 py-3 text-[13px] text-muted-foreground">Nothing open matches this profile yet. Add capabilities on the Profile page.</p>
        ))}
    </ListCard>
  );
}

function Newest({ api }: { api: KopiApi }) {
  const state = useAsync(() => api.tenders({ status: "open" }, 8, 0), [api]);
  return (
    <ListCard id="newest" title="Newest on GeBIZ">
      {state.status === "loading" && <RowsSkeleton rows={8} />}
      {state.status === "error" && (
        <div className="p-1">
          <ErrorState error={state.error} />
        </div>
      )}
      {state.status === "ready" && state.data.map((notice) => <TenderRow key={notice.doc_no} notice={notice} compact />)}
    </ListCard>
  );
}

export function OverviewPage() {
  const api = useApi();
  const { profile } = useKopi();
  return (
    <>
      <PageHeader title="Overview" description={`${longToday()}. What is open on GeBIZ, read for ${profile.name}.`} />
      {api && (
        <div className="flex flex-col gap-5">
          <Stats api={api} />
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <BestMatches api={api} />
            </div>
            <div className="lg:col-span-2">
              <Newest api={api} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
