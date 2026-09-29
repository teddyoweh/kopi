"use client";

import { Check, CircleHelp, ExternalLink, FileSearch, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useApi, useKopi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { AiOverview, BidButton, TenderActions } from "@/components/tender-ai";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { EligibilityCheck, MarketContext, Notice, Profile } from "@/lib/api";
import { categoryLeaf, closingLabel, dateTime, daysUntil, money, moneyShort } from "@/lib/format";
import { rememberTitle } from "@/lib/submissions";
import { displayTitle } from "@/lib/title-case";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-3 py-[7px]">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-[13px] font-book break-words">{children}</dd>
    </div>
  );
}

function yesNo(value: boolean | null | undefined): string {
  return value === true ? "Yes" : value === false ? "No" : "Not stated";
}

/** The notice's facts as Linear's properties panel: a soft surface, not another bordered card. */
function Properties({ notice }: { notice: Notice }) {
  return (
    <section aria-label="Properties" className="rounded-xl bg-muted/60 px-4 py-3">
      <dl className="flex flex-col">
        <Property label="Closes">{dateTime(notice.closing)}</Property>
        <Property label="Published">{dateTime(notice.published)}</Property>
        <Property label="Method">{notice.procurement_method || notice.type}</Property>
        <Property label="Category">{categoryLeaf(notice.category) || "Not stated"}</Property>
        <Property label="Procurement type">{notice.procurement_type || "Not stated"}</Property>
        <Property label="Two envelopes">{yesNo(notice.two_envelope)}</Property>
        <Property label="WTO-GPA / FTA">{yesNo(notice.wto_gpa)}</Property>
        <Property label="Document no.">
          <span className="font-mono text-[12px]">{notice.doc_no}</span>
        </Property>
      </dl>
    </section>
  );
}

function Section({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-[15px] font-medium tracking-[-0.01em]">
          {title}
        </h2>
        {description && <div className="text-[13px] text-pretty text-muted-foreground">{description}</div>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- eligibility

const STATUS: Record<EligibilityCheck["status"], { label: string; icon: LucideIcon; className: string }> = {
  met: { label: "Met", icon: Check, className: "bg-met-soft text-met" },
  unmet: { label: "Not met", icon: X, className: "bg-unmet-soft text-unmet" },
  unknown: { label: "Unknown", icon: CircleHelp, className: "bg-unknown-soft text-unknown" },
};

const KIND: Record<EligibilityCheck["kind"], string> = {
  closing: "Closing date",
  gra: "GRA registration",
  bca: "BCA registration",
  licence: "Licence",
  value: "Contract value",
  company: "Company",
};

function StatusPill({ status }: { status: EligibilityCheck["status"] }) {
  const { label, icon: Icon, className } = STATUS[status];
  return (
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full pr-2.5 pl-2 text-xs font-book", className)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

/**
 * The closing check, worded from the notice with lib/format: the API counts whole 24-hour
 * days ("closes in 5 days") where every other date on the page counts Singapore calendar days.
 */
function closingCheck(check: EligibilityCheck, notice: Notice): EligibilityCheck {
  if (check.kind !== "closing") return check;
  const label = closingLabel(notice.closing);
  return {
    ...check,
    requirement: `Closes ${dateTime(notice.closing)}`,
    reason: label === "Closed" ? check.reason : `Open; ${label.charAt(0).toLowerCase()}${label.slice(1)}`,
  };
}

function Eligibility({ checks, notice, profile }: { checks: EligibilityCheck[]; notice: Notice; profile: Profile }) {
  const count = (status: EligibilityCheck["status"]) => checks.filter((c) => c.status === status).length;
  const tally = [
    [count("met"), "met"],
    [count("unmet"), "not met"],
    [count("unknown"), "unknown"],
  ]
    .filter(([n]) => n)
    .map(([n, word]) => `${n} ${word}`)
    .join(", ");
  return (
    <Section
      id="eligibility"
      title={`Can ${profile.name} bid?`}
      description={checks.length ? `Checked against the ${profile.name} profile: ${tally}.` : `No checks apply to this notice.`}
    >
      {checks.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border bg-card">
          {checks.map((raw, i) => {
            const check = closingCheck(raw, notice);
            return (
              <li
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2.5 px-4 py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:px-5"
              >
                <div className="col-start-1 row-start-1 sm:pt-px">
                  <StatusPill status={check.status} />
                </div>
                <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-0.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <p className="text-xs text-muted-foreground">{KIND[check.kind] ?? check.kind}</p>
                  <p className="text-[13.5px] font-book break-words">{check.requirement}</p>
                  <p className="text-[13px] break-words text-muted-foreground">{check.reason}</p>
                </div>
                {check.source_url && (
                  <a
                    href={check.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="col-start-2 row-start-1 flex items-center gap-1 self-center text-[13px] font-book text-muted-foreground transition-colors hover:text-kopi sm:col-start-3 sm:self-start sm:pt-4"
                  >
                    Source <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {count("unknown") > 0 && (
        <p className="text-[13px] text-muted-foreground">
          Unknown means we can&apos;t tell yet: neither the notice nor the profile settles it. Adding registrations and licences on the{" "}
          <Link href="/profile" className="font-book text-kopi underline-offset-4 hover:underline">
            Profile
          </Link>{" "}
          page settles more of them.
        </p>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- market context

function Figure({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl bg-muted/60 px-4 py-3.5", className)}>
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className="text-[22px] leading-none font-medium tracking-[-0.03em] tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Suppliers({ title, rows, empty }: { title: string; rows: MarketContext["top_suppliers"]; empty: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-[13px] font-medium">{title}</h3>
      {rows.length ? (
        <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border bg-card">
          {rows.map((row) => (
            <li key={row.supplier} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[13px]">
              <span className="min-w-0 truncate" title={row.supplier}>
                {displayTitle(row.supplier)}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {row.wins} {row.wins === 1 ? "win" : "wins"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-muted/60 px-4 py-2.5 text-[13px] text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Market({ market, agency }: { market: MarketContext; agency: string }) {
  const n = market.similar_count;
  const range = market.p25_amount !== null && market.p75_amount !== null ? `${moneyShort(market.p25_amount)} – ${moneyShort(market.p75_amount)}` : null;
  const noAward = market.no_award_share ? Math.round(market.no_award_share * 100) : 0;
  return (
    <Section
      id="market"
      title="Market context"
      description="From past GeBIZ awards on data.gov.sg whose descriptions read most like this notice."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
        <Figure label="Similar tenders" value={n.toLocaleString("en-SG")} hint="Awarded before" />
        <Figure label="Median award" value={market.median_amount !== null ? moneyShort(market.median_amount) : "Not published"} hint="Half were awarded for less" />
        <Figure
          className="col-span-2 sm:col-span-1"
          label="Middle half of awards"
          value={range ?? "Not published"}
          hint={range ? "25th to 75th percentile" : undefined}
        />
      </div>
      {noAward > 0 && <p className="text-[13px] text-muted-foreground">{noAward}% of the similar tenders ended without an award.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Suppliers title="Top suppliers" rows={market.top_suppliers} empty="No supplier names in these awards." />
        <Suppliers title={`${agency}'s incumbents`} rows={market.agency_incumbents} empty="This agency has no past awards among the similar tenders." />
      </div>
      {market.examples.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-medium">Past awards like this one</h3>
          <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border bg-card">
            {market.examples.slice(0, 3).map((example) => (
              <li key={example.tender_no} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-6">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="line-clamp-2 text-[13px]">{displayTitle(example.description)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[example.agency, example.year, example.suppliers[0] && `Won by ${displayTitle(example.suppliers[0])}${example.suppliers.length > 1 ? ` and ${example.suppliers.length - 1} more` : ""}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 text-[13px] font-book tabular-nums">{example.amount !== null ? moneyShort(example.amount) : "Amount not published"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- page

function TenderSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-full max-w-3xl" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-48 rounded-full" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function TenderView() {
  const doc = useSearchParams().get("doc");
  const api = useApi();
  const { profile } = useKopi();
  const [attempt, setAttempt] = useState(0);
  const state = useAsync(async () => (api && doc ? api.tender(doc, profile) : null), [api, doc, profile, attempt]);
  const loaded = state.data?.notice;
  useEffect(() => {
    if (loaded) rememberTitle(loaded.doc_no, loaded.title);
  }, [loaded]);

  if (!doc) {
    return (
      <EmptyState icon={FileSearch} title="No tender chosen">
        Open a tender from the{" "}
        <Link href="/" className="text-kopi underline-offset-4 hover:underline">
          overview
        </Link>{" "}
        or{" "}
        <Link href="/search" className="text-kopi underline-offset-4 hover:underline">
          search
        </Link>
        .
      </EmptyState>
    );
  }
  if (state.status === "error") return <ErrorState error={state.error} onRetry={() => setAttempt((n) => n + 1)} />;
  if (state.status === "loading" || !state.data) return <TenderSkeleton />;

  const { notice, eligibility, market } = state.data;
  const registrations = [
    ...(notice.gra_heads ?? []).map((h) => ({
      code: h.code,
      label: h.label,
      detail: [h.grade, money(h.capacity_sgd, true)].filter((x) => x && x !== "—").join(" · "),
    })),
    ...(notice.bca_workheads ?? []).map((w) => ({ code: w.code, label: "BCA workhead", detail: w.grade ?? "" })),
  ];

  return (
    <article className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <PageHeader
        title={notice.doc_no}
        crumbs={[{ label: "Overview", href: "/" }]}
        actions={
          <>
            <a
              href={notice.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-8 items-center gap-1.5 rounded-full border bg-card pr-3 pl-3.5 text-[13px] font-medium transition-colors hover:bg-muted sm:flex"
            >
              View on GeBIZ <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
            </a>
            <BidButton notice={notice} />
          </>
        }
      />

      <div className="flex min-w-0 flex-col gap-9">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{notice.type}</Badge>
            <Badge className={cn(daysUntil(notice.closing) <= 3 ? "bg-unmet-soft text-unmet" : "bg-kopi-soft text-kopi")}>{closingLabel(notice.closing)}</Badge>
          </div>
          <h1 className="max-w-4xl text-[24px] leading-[1.2] font-medium tracking-[-0.025em] text-balance break-words sm:text-[28px]">
            {displayTitle(notice.title)}
          </h1>
          <p className="text-[14px] text-muted-foreground">{notice.agency}</p>
          <a
            href={notice.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-fit items-center gap-1 text-[13px] font-book text-kopi hover:underline sm:hidden"
          >
            View on GeBIZ <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </header>

        <div className="lg:hidden">
          <Properties notice={notice} />
        </div>

        <Eligibility checks={eligibility} notice={notice} profile={profile} />

        <AiOverview doc={notice.doc_no} profile={profile} />

        <div className="lg:hidden">
          <TenderActions notice={notice} profile={profile} />
        </div>

        {notice.description && (
          <section className="flex max-w-3xl flex-col gap-2">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">What the notice says</h2>
            <p className="text-[14px] leading-relaxed break-words whitespace-pre-line text-foreground/90">{notice.description}</p>
          </section>
        )}

        {registrations.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">Registrations named</h2>
            <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border bg-card">
              {registrations.map((r) => (
                <li key={r.code} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
                  <span className="font-mono text-[12px]">{r.code}</span>
                  <span className="text-muted-foreground">{r.label}</span>
                  {r.detail && <span className="ml-auto tabular-nums">{r.detail}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(notice.items ?? []).length > 0 && (
          <section className="flex max-w-3xl flex-col gap-3">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">Items to respond</h2>
            <ol className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border bg-card text-[13.5px]">
              {notice.items!.map((item, i) => (
                <li key={i} className="flex gap-3 px-4 py-2.5">
                  <span className="w-4 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {market && market.similar_count > 0 && <Market market={market} agency={notice.agency} />}
      </div>

      <aside className="hidden flex-col gap-4 lg:sticky lg:top-18 lg:flex lg:self-start">
        <Properties notice={notice} />
        <TenderActions notice={notice} profile={profile} />
      </aside>
    </article>
  );
}
