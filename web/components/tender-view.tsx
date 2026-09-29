"use client";

import {
  ArrowLeft,
  Check,
  CircleHelp,
  ExternalLink,
  FileSearch,
  ListChecks,
  MessageCircleQuestion,
  Sparkles,
  TableProperties,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { useApi, useKopi } from "@/components/kopi-provider";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { EligibilityCheck, MarketContext, Notice, Profile } from "@/lib/api";
import { categoryLeaf, closingLabel, dateTime, money, moneyShort } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function yesNo(value: boolean | null | undefined): string {
  return value === true ? "Yes" : value === false ? "No" : "Not stated";
}

function Facts({ notice }: { notice: Notice }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl bg-secondary p-5 sm:grid-cols-4">
      <Fact label="Closes">{dateTime(notice.closing)}</Fact>
      <Fact label="Published">{dateTime(notice.published)}</Fact>
      <Fact label="Method">{notice.procurement_method || notice.type}</Fact>
      <Fact label="Category">{categoryLeaf(notice.category) || "Not stated"}</Fact>
      <Fact label="Procurement type">{notice.procurement_type || "Not stated"}</Fact>
      <Fact label="Two envelopes">{yesNo(notice.two_envelope)}</Fact>
      <Fact label="WTO-GPA / FTA">{yesNo(notice.wto_gpa)}</Fact>
      <Fact label="Document no." className="col-span-2 sm:col-span-1">
        {notice.doc_no}
      </Fact>
    </dl>
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
    <section aria-labelledby={id} className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
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
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full pr-2.5 pl-2 text-xs font-medium", className)}>
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
        <ul className="flex flex-col gap-2">
          {checks.map((raw, i) => {
            const check = closingCheck(raw, notice);
            return (
              <li
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2.5 rounded-lg bg-secondary px-4 py-3.5 sm:grid-cols-[6rem_minmax(0,1fr)_auto]"
              >
                <div className="col-start-1 row-start-1 sm:pt-px">
                  <StatusPill status={check.status} />
                </div>
                <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-0.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <p className="text-xs text-muted-foreground">{KIND[check.kind] ?? check.kind}</p>
                  <p className="text-sm font-medium break-words">{check.requirement}</p>
                  <p className="text-sm break-words text-muted-foreground">{check.reason}</p>
                </div>
                {check.source_url && (
                  <a
                    href={check.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="col-start-2 row-start-1 flex items-center gap-1 self-center text-sm font-medium text-kopi hover:underline sm:col-start-3 sm:self-start sm:pt-4"
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
        <p className="text-sm text-muted-foreground">
          Unknown means we can&apos;t tell yet: neither the notice nor the profile settles it. Adding registrations and licences on the{" "}
          <Link href="/profile" className="font-medium text-kopi underline-offset-4 hover:underline">
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
    <div className={cn("flex flex-col gap-1.5 rounded-xl bg-secondary px-5 py-4", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Suppliers({ title, rows, empty }: { title: string; rows: MarketContext["top_suppliers"]; empty: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length ? (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.supplier} className="flex items-baseline justify-between gap-4 rounded-lg bg-secondary px-3.5 py-2.5 text-sm">
              <span className="min-w-0 truncate" title={row.supplier}>
                {row.supplier}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {row.wins} {row.wins === 1 ? "win" : "wins"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">{empty}</p>
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
      {noAward > 0 && <p className="-mt-1 text-sm text-muted-foreground">{noAward}% of the similar tenders ended without an award.</p>}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Suppliers title="Top suppliers" rows={market.top_suppliers} empty="No supplier names in these awards." />
        <Suppliers title={`${agency}'s incumbents`} rows={market.agency_incumbents} empty="This agency has no past awards among the similar tenders." />
      </div>
      {market.examples.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Past awards like this one</h3>
          <ul className="flex flex-col gap-1">
            {market.examples.slice(0, 3).map((example) => (
              <li key={example.tender_no} className="flex flex-col gap-1 rounded-lg bg-secondary px-4 py-3 sm:flex-row sm:items-start sm:gap-6">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="line-clamp-2 text-sm">{example.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {[example.agency, example.year, example.suppliers[0] && `Won by ${example.suppliers[0]}${example.suppliers.length > 1 ? ` and ${example.suppliers.length - 1} more` : ""}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">{example.amount !== null ? moneyShort(example.amount) : "Amount not published"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- coming with the copilot

function ComingLabel() {
  return <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">Coming next</span>;
}

function AiOverviewComing({ profile }: { profile: Profile }) {
  return (
    <section aria-labelledby="ai-overview" className="flex flex-col gap-3 rounded-xl bg-secondary px-5 py-5 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-lg bg-background">
          <Sparkles className="size-4 text-kopi" aria-hidden />
        </span>
        <h2 id="ai-overview" className="text-base font-semibold tracking-tight">
          AI overview
        </h2>
        <ComingLabel />
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        A short read of this notice for {profile.name}: what the agency is buying, who can bid, how well it fits and what could go wrong,
        with every claim quoted from the notice. It arrives with the copilot; until then, the notice itself is below.
      </p>
    </section>
  );
}

const ACTIONS: { label: string; what: string; icon: LucideIcon }[] = [
  { label: "Draft clarification questions", what: "Questions for the agency, from gaps in the notice", icon: MessageCircleQuestion },
  { label: "Draft compliance matrix", what: "Each requirement, and how you meet it", icon: TableProperties },
  { label: "Build submission checklist", what: "Every document and form to send, and when", icon: ListChecks },
];

function ActionsComing() {
  return (
    <section aria-labelledby="actions" className="flex flex-col gap-4 rounded-xl bg-secondary p-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id="actions" className="text-base font-semibold tracking-tight">
            Prepare a response
          </h2>
          <ComingLabel />
        </div>
        <p className="text-sm text-muted-foreground">Drafts the copilot will write from this notice and your profile.</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {ACTIONS.map(({ label, what, icon: Icon }) => (
          <li key={label}>
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-start gap-3 rounded-lg bg-background px-3.5 py-3 text-left"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground/70">{label}</span>
                <span className="text-xs text-muted-foreground">{what}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
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
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
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
    <article className="flex flex-col gap-10">
      <div className="flex flex-col gap-5">
        <Link href="/" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden /> Overview
        </Link>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{notice.type}</Badge>
            <span className="text-sm font-medium text-kopi">{closingLabel(notice.closing)}</span>
          </div>
          <h1 className="max-w-4xl text-2xl leading-tight font-semibold tracking-tight break-words sm:text-[28px]">{notice.title}</h1>
          <p className="text-[15px] text-muted-foreground">{notice.agency}</p>
        </div>
        <a
          href={notice.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-kopi hover:underline"
        >
          View on GeBIZ <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>

      <Facts notice={notice} />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <Eligibility checks={eligibility} notice={notice} profile={profile} />

          <AiOverviewComing profile={profile} />

          {notice.description && (
            <section className="flex max-w-3xl flex-col gap-2">
              <h2 className="text-base font-semibold tracking-tight">What the notice says</h2>
              <p className="text-[15px] leading-relaxed break-words whitespace-pre-line">{notice.description}</p>
            </section>
          )}

          {registrations.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold tracking-tight">Registrations named</h2>
              <ul className="flex flex-col gap-2">
                {registrations.map((r) => (
                  <li key={r.code} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-secondary px-4 py-3 text-sm">
                    <span className="font-mono text-[13px] font-medium">{r.code}</span>
                    <span className="text-muted-foreground">{r.label}</span>
                    {r.detail && <span className="ml-auto tabular-nums">{r.detail}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(notice.items ?? []).length > 0 && (
            <section className="flex max-w-3xl flex-col gap-3">
              <h2 className="text-base font-semibold tracking-tight">Items to respond</h2>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px]">
                {notice.items!.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ol>
            </section>
          )}

          {market && market.similar_count > 0 && <Market market={market} agency={notice.agency} />}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <ActionsComing />
        </aside>
      </div>
    </article>
  );
}
