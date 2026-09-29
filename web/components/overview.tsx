"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { useApi, useKopi } from "@/components/kopi-provider";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { ErrorState, RowsSkeleton } from "@/components/states";
import { TenderRow } from "@/components/tender-row";
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

function Stat({ label, value, hint }: { label: string; value?: number; hint: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-secondary px-3.5 py-3.5 sm:px-5 sm:py-4">
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
      {value === undefined ? (
        <Skeleton className="h-6 w-12 sm:h-8 sm:w-16" />
      ) : (
        <p className="mt-auto text-2xl leading-none font-semibold tracking-tight tabular-nums sm:mt-0 sm:text-[32px]">{value.toLocaleString("en-SG")}</p>
      )}
      <p className="hidden text-xs text-muted-foreground sm:block">{hint}</p>
    </div>
  );
}

function Stats({ api }: { api: KopiApi }) {
  const state = useAsync(() => allOpen(api), [api]);
  if (state.status === "error") return <ErrorState error={state.error} />;
  const open = state.data;
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <Stat label="Open opportunities" value={open?.length} hint="Accepting responses on GeBIZ" />
      <Stat label="Published today" value={open?.filter((n) => isToday(n.published)).length} hint="New since midnight, Singapore time" />
      <Stat label="Closing in 7 days" value={open?.filter((n) => daysUntil(n.closing) <= 7).length} hint="Decide on these first" />
    </div>
  );
}

function BestMatches({ api }: { api: KopiApi }) {
  const { profile } = useKopi();
  const state = useAsync(() => api.search(profileQuery(profile), { status: "open" }, 6), [api, profile]);
  return (
    <section aria-labelledby="best-matches">
      <SectionHeader
        id="best-matches"
        title={`Best matches for ${profile.name}`}
        description="Open tenders closest to what your company does."
        action={
          <Link href="/search" className="hidden items-center gap-1 text-sm font-medium text-kopi hover:underline sm:flex">
            Search all <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      {state.status === "loading" && <RowsSkeleton rows={6} />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" &&
        (state.data.hits.length ? (
          <div className="-mx-3 flex flex-col">
            {state.data.hits.map((hit) => (
              <TenderRow key={hit.notice.doc_no} notice={hit.notice} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing open matches this profile yet. Add capabilities on the Profile page.</p>
        ))}
    </section>
  );
}

function Newest({ api }: { api: KopiApi }) {
  const state = useAsync(() => api.tenders({ status: "open" }, 8, 0), [api]);
  return (
    <section aria-labelledby="newest">
      <SectionHeader id="newest" title="Newest on GeBIZ" description="Most recently published." />
      {state.status === "loading" && <RowsSkeleton rows={8} />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && (
        <div className="-mx-3 flex flex-col">
          {state.data.map((notice) => (
            <TenderRow key={notice.doc_no} notice={notice} compact />
          ))}
        </div>
      )}
    </section>
  );
}

export function OverviewPage() {
  const api = useApi();
  const { profile } = useKopi();
  return (
    <>
      <PageHeader title="Overview" description={`${longToday()}. What is open on GeBIZ, read for ${profile.name}.`} />
      {api && (
        <div className="flex flex-col gap-12">
          <Stats api={api} />
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-5 lg:gap-10">
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
