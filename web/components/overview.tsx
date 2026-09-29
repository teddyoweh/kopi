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

const PAGE = 200;

/** Every open opportunity's summary, a page at a time; the counts need all of them. */
async function allOpen(api: KopiApi): Promise<NoticeSummary[]> {
  const all: NoticeSummary[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await api.tenders({ status: "open" }, PAGE, offset);
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}

function Stat({ label, value, hint }: { label: string; value?: number; hint: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-secondary px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <p className="text-[32px] leading-none font-semibold tracking-tight tabular-nums">{value.toLocaleString("en-SG")}</p>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Stats({ api }: { api: KopiApi }) {
  const state = useAsync(() => allOpen(api), [api]);
  if (state.status === "error") return <ErrorState error={state.error} />;
  const open = state.data;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
