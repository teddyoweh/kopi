"use client";

import { Check, CircleHelp, X, type LucideIcon } from "lucide-react";

import { useApi, useKopi } from "@/components/kopi-provider";
import { TenderActions } from "@/components/search/actions";
import { ClosingChip, EnvelopesChip, MethodChip } from "@/components/search/chips";
import { AgencyDisc } from "@/components/search/result-card";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { EligibilityCheck, KopiApi, NoticeSummary, Profile, TenderDetail } from "@/lib/api";
import { categoryLeaf, dateTime, moneyShort } from "@/lib/format";
import { displayTitle } from "@/lib/title-case";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";

/** Details already fetched for this profile, so moving back up the list is instant. */
const details = new Map<string, Promise<TenderDetail>>();

function detail(api: KopiApi, doc: string, profile: Profile): Promise<TenderDetail> {
  const key = `${profile.id}:${JSON.stringify(profile).length}:${doc}`;
  let found = details.get(key);
  if (!found) {
    found = api.tender(doc, profile);
    found.catch(() => details.delete(key));
    details.set(key, found);
  }
  return found;
}

const STATUS: Record<EligibilityCheck["status"], { icon: LucideIcon; tone: string; label: string }> = {
  met: { icon: Check, tone: "bg-met-soft text-met", label: "Met" },
  unmet: { icon: X, tone: "bg-unmet-soft text-unmet", label: "Not met" },
  unknown: { icon: CircleHelp, tone: "bg-muted text-muted-foreground", label: "Unknown" },
};

function Heading({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[12.5px] font-medium text-muted-foreground">{children}</h4>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-3 py-1">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="text-[12.5px] font-book break-words">{children}</dd>
    </div>
  );
}

function Body({ notice, data }: { notice: NoticeSummary; data: TenderDetail }) {
  const { notice: full, eligibility, market } = data;
  const band = market && market.similar_count > 0 ? market : null;
  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col rounded-xl bg-muted/60 px-3.5 py-2">
        <Fact label="Closes">{dateTime(full.closing)}</Fact>
        <Fact label="Published">{dateTime(full.published)}</Fact>
        <Fact label="Category">{categoryLeaf(full.category) || "Not stated"}</Fact>
        <Fact label="Items">{full.items?.length ? `${full.items.length} to respond` : "None listed"}</Fact>
        <Fact label="Document no.">
          <span className="font-mono text-[11.5px]">{full.doc_no}</span>
        </Fact>
      </dl>

      {eligibility.length > 0 && (
        <section className="flex flex-col gap-2">
          <Heading>Can you bid?</Heading>
          <ul className="flex flex-col gap-2">
            {eligibility.map((check, i) => {
              const { icon: Icon, tone, label } = STATUS[check.status];
              return (
                <li key={i} className="flex items-start gap-2.5">
                  <span className={cn("mt-px grid size-5 shrink-0 place-items-center rounded-full", tone)} title={label}>
                    <Icon className="size-3" aria-label={label} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[12.5px] font-book break-words">{check.requirement}</span>
                    <span className="text-[12px] text-muted-foreground">{check.reason}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {band && (
        <section className="flex flex-col gap-2">
          <Heading>What similar work sold for</Heading>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-3.5 py-2.5">
              <span className="text-[11.5px] text-muted-foreground">Median award</span>
              <span className="text-[17px] leading-none font-medium tracking-[-0.02em] tabular-nums">{band.median_amount !== null ? moneyShort(band.median_amount) : "—"}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-3.5 py-2.5">
              <span className="text-[11.5px] text-muted-foreground">Middle half</span>
              <span className="text-[17px] leading-none font-medium tracking-[-0.02em] tabular-nums">
                {band.p25_amount !== null && band.p75_amount !== null ? `${moneyShort(band.p25_amount)}–${moneyShort(band.p75_amount).replace("S$", "")}` : "—"}
              </span>
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground">
            From {band.similar_count} similar past award{band.similar_count === 1 ? "" : "s"}
            {band.top_suppliers[0] && <>; most often won by {displayTitle(band.top_suppliers[0].supplier).replace(/\.$/, "")}</>}.
          </p>
        </section>
      )}

      {full.items && full.items.length > 0 && (
        <section className="flex flex-col gap-2">
          <Heading>Items to respond</Heading>
          <ol className="flex list-decimal flex-col gap-1 pl-4 text-[12.5px] leading-relaxed marker:text-muted-foreground">
            {full.items.slice(0, 5).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
          {full.items.length > 5 && <p className="text-[12px] text-muted-foreground">and {full.items.length - 5} more</p>}
        </section>
      )}

      {full.description && full.description !== notice.title && (
        <section className="flex flex-col gap-2">
          <Heading>What the notice says</Heading>
          <p className="line-clamp-6 text-[12.5px] leading-relaxed whitespace-pre-line text-foreground/85">{full.description}</p>
        </section>
      )}
    </div>
  );
}

/** The selected result, in full, beside the list (1280px and wider). */
export function PreviewPane({ notice }: { notice: NoticeSummary | null }) {
  const api = useApi();
  const { profile } = useKopi();
  const doc = notice?.doc_no ?? null;
  const state = useAsync(async () => (api && doc ? detail(api, doc, profile) : null), [api, doc, profile]);

  if (!notice) {
    return (
      <aside className="rounded-xl border border-dashed bg-card/50 px-5 py-6 text-[13px] text-muted-foreground">
        Select a result to see it here: eligibility, what similar work sold for, and the items to respond.
      </aside>
    );
  }
  return (
    <aside aria-label="Preview" className="flex max-h-[calc(100dvh-6.5rem)] flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b border-border/70 px-5 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <AgencyDisc agency={notice.agency} />
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{notice.agency}</p>
        </div>
        <h3 className="text-[17px] leading-snug font-medium tracking-[-0.015em] text-pretty">{displayTitle(notice.title)}</h3>
        <div className="flex flex-wrap gap-1.5">
          <ClosingChip closing={notice.closing} />
          <MethodChip method={state.data?.notice.procurement_method || notice.type} />
          {state.data?.notice.two_envelope && <EnvelopesChip />}
        </div>
        <TenderActions notice={notice} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-busy={state.status === "loading"}>
        {state.status === "error" && <ErrorState error={state.error} />}
        {state.status === "loading" && (
          <div className="flex flex-col gap-3" aria-label="Loading">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-3.5 w-1/3 rounded-full" />
            <Skeleton className="h-3.5 w-4/5 rounded-full" />
            <Skeleton className="h-3.5 w-3/5 rounded-full" />
          </div>
        )}
        {state.status === "ready" && state.data && <Body notice={notice} data={state.data} />}
      </div>
    </aside>
  );
}
