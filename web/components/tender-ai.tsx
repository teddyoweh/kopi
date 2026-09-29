"use client";

import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  RotateCcw,
  Sparkles,
  TableProperties,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useApi } from "@/components/kopi-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, type Notice, type Overview, type Profile } from "@/lib/api";
import { tenderAsks } from "@/lib/copilot";
import { dateTime } from "@/lib/format";
import { writeStored, useStored } from "@/lib/stored";
import { useTracked } from "@/lib/submissions";
import { cn } from "@/lib/utils";

/** `/copilot?doc=…&ask=…`: the copilot opened on a tender with a request already made. */
export function copilotHref(doc: string, ask?: string): string {
  const params = new URLSearchParams({ doc });
  if (ask) params.set("ask", ask);
  return `/copilot/?${params.toString()}`;
}

// ---------------------------------------------------------------- AI overview

/** The overview depends on the whole profile, not just its id: an edited profile is a new read. */
function profileKey(profile: Profile): string {
  const text = JSON.stringify(profile);
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  return `${profile.id}.${(hash >>> 0).toString(36)}`;
}

const REC = {
  BID: { label: "Bid", className: "bg-met-soft text-met" },
  MAYBE: { label: "Maybe", className: "bg-kopi-soft text-kopi" },
  NO_BID: { label: "No bid", className: "bg-unmet-soft text-unmet" },
} as const;

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13px] font-semibold">{children}</h3>;
}

function Verdict({ overview, profile }: { overview: Overview; profile: Profile }) {
  const rec = REC[overview.fit.recommendation];
  const score = Math.max(0, Math.min(100, overview.fit.score));
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
        <p className="text-xs text-muted-foreground">Recommendation</p>
        <span className={cn("inline-flex h-7 w-fit items-center rounded-md px-2.5 text-[13px] font-semibold tracking-wide uppercase", rec.className)}>
          {rec.label}
        </span>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
        <p className="truncate text-xs text-muted-foreground">Fit for {profile.name}</p>
        <p className="flex items-baseline gap-1">
          <span className="text-[20px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{score}</span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </p>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label="Fit score">
          <div className="h-full rounded-full bg-kopi" style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Where code found a verified quote word for word. Overviews cached before `found_in` existed say only "Verified". */
const FOUND_IN = { notice: "Verified in the notice", profile: "From your profile", unknown: "Verified" } as const;

function Reasons({ overview }: { overview: Overview }) {
  return (
    <ul className="flex flex-col overflow-hidden rounded-lg border">
      {overview.fit.reasons.map((reason, i) => (
        <li key={i} className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0">
          <p className="text-[13.5px] font-medium">{reason.point}</p>
          {reason.quote && (
            <blockquote
              className={cn(
                "rounded-md px-3 py-2 text-[13px] leading-relaxed",
                reason.verified ? "bg-secondary text-foreground/85" : "bg-unmet-soft text-muted-foreground",
              )}
            >
              <span aria-hidden>“</span>
              {reason.quote}
              <span aria-hidden>”</span>
            </blockquote>
          )}
          {reason.quote &&
            (reason.verified ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-met">
                <Check className="size-3.5" aria-hidden /> {FOUND_IN[reason.found_in ?? "unknown"]}
              </p>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-unmet">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium">Not found in the notice or your profile.</span> Kopi couldn&apos;t match these words to either, so
                  don&apos;t rely on them.
                </span>
              </p>
            ))}
        </li>
      ))}
    </ul>
  );
}

function OverviewBody({ overview, profile, doc }: { overview: Overview; profile: Profile; doc: string }) {
  const extractive = overview.model === "extractive";
  // The extractive read quotes the sentence it also shows as "what they're buying"; show it once.
  const shown = `${overview.summary} ${overview.buying}`;
  const quotes = overview.fit.reasons.filter((r) => r.quote && !shown.includes(r.quote));
  return (
    <div className="flex flex-col gap-6">
      {extractive ? (
        <p className="rounded-lg border bg-muted/50 px-4 py-3 text-[13px] text-muted-foreground">
          Kopi&apos;s model isn&apos;t connected on this deployment yet, so this is the notice&apos;s own words rather than an assessment: no fit score,
          no recommendation.
        </p>
      ) : (
        <Verdict overview={overview} profile={profile} />
      )}

      <p className="text-[14px] leading-relaxed">{overview.summary}</p>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">What they&apos;re buying</dt>
          <dd className="text-[13.5px] leading-relaxed">{overview.buying}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Who can bid</dt>
          <dd className="text-[13.5px] leading-relaxed">{overview.who_can_bid}</dd>
        </div>
      </dl>

      {extractive
        ? quotes.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <Heading>In the notice&apos;s words</Heading>
              {quotes.map((r, i) => (
                <blockquote key={i} className="rounded-md bg-muted px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground/85">
                  <span aria-hidden>“</span>
                  {r.quote}
                  <span aria-hidden>”</span>
                </blockquote>
              ))}
            </div>
          )
        : overview.fit.reasons.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <Heading>Why</Heading>
              {overview.unverified_quotes > 0 && (
                <p className="flex items-start gap-2 rounded-lg border border-unmet/20 bg-unmet-soft px-3.5 py-2.5 text-[13px] text-unmet">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {overview.unverified_quotes === 1
                    ? "One quote below wasn't found in the notice or your profile. It is shown so you can see it, not as evidence."
                    : `${overview.unverified_quotes} quotes below weren't found in the notice or your profile. They are shown so you can see them, not as evidence.`}
                </p>
              )}
              <Reasons overview={overview} />
            </div>
          )}

      {overview.key_dates.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <Heading>Key dates</Heading>
          <ul className="flex flex-col overflow-hidden rounded-lg border">
            {overview.key_dates.map((d, i) => (
              <li key={i} className="flex flex-col gap-0.5 border-b px-4 py-2 text-[13px] last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="text-muted-foreground">{d.label}</span>
                <span className="font-medium tabular-nums">{dateTime(d.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {overview.risks.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <Heading>What could go wrong</Heading>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed marker:text-muted-foreground/70">
            {overview.risks.map((risk, i) => (
              <li key={i}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {overview.questions_for_agency.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <Heading>Questions for the agency</Heading>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed marker:text-muted-foreground">
            {overview.questions_for_agency.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
          <Link
            href={copilotHref(doc, `Draft clarification questions for ${doc}, starting from these: ${overview.questions_for_agency.join(" ")}`)}
            className="flex w-fit items-center gap-1 text-[13px] font-medium text-kopi hover:underline"
          >
            Draft these as clarification questions <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {extractive
          ? `Taken from the notice, ${dateTime(overview.generated_at)}.`
          : `Written by ${overview.model || "Kopi's model"} for ${profile.name}, ${dateTime(overview.generated_at)}. Every quote is checked against the notice's text.`}
      </p>
    </div>
  );
}

function overviewError(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Kopi reads up to 40 notices an hour for each person. Try this one again later in the hour.";
    if (error.status === 503) return "The model behind the overview is being connected. The notice itself is below.";
    if (error.status === 401 || error.status === 403) return "Your access has expired. Sign in again to read this notice.";
  }
  return "Kopi couldn't read this notice just now.";
}

const NO_OVERVIEW = null;

/**
 * The AI overview, read when the person asks: the route costs a model call and is limited to
 * 40 an hour, so it never runs on page view. A read is kept for this tab, per notice and profile.
 */
export function AiOverview({ doc, profile }: { doc: string; profile: Profile }) {
  const api = useApi();
  const key = `kopi.overview.${doc}.${profileKey(profile)}`;
  const [overview] = useStored<Overview | null>(key, NO_OVERVIEW, "session");
  const [run, setRun] = useState<{ key: string; busy: boolean; error?: Error } | null>(null);
  const busy = run?.key === key && run.busy;
  const error = run?.key === key ? run.error : undefined;

  async function read() {
    if (!api) return;
    setRun({ key, busy: true });
    try {
      writeStored(key, await api.overview(doc, profile), "session");
      setRun(null);
    } catch (e) {
      setRun({ key, busy: false, error: e instanceof Error ? e : new Error(String(e)) });
    }
  }

  const extractive = overview?.model === "extractive";
  return (
    <section aria-labelledby="ai-overview" aria-busy={busy} className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-11 items-center gap-2.5 border-b bg-muted/60 px-4">
        <Sparkles className="size-4 text-kopi" aria-hidden />
        <h2 id="ai-overview" className="text-[13.5px] font-semibold">
          AI overview
        </h2>
        {overview && (
          <span className="rounded-md border bg-card px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            {extractive ? "From the notice" : `For ${profile.name}`}
          </span>
        )}
        {overview && (
          <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={read} disabled={busy} aria-label="Read it again">
            {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-5 p-4 sm:p-5">

      {overview ? (
        <OverviewBody overview={overview} profile={profile} doc={doc} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="max-w-2xl text-[13.5px] text-muted-foreground">
            A short read of this notice for {profile.name}: what the agency is buying, who can bid, how well it fits and what could go wrong,
            with every claim quoted from the notice and checked against it.
          </p>
          {busy ? (
            <div className="flex flex-col gap-2.5" aria-label="Reading the notice">
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-kopi" aria-hidden /> Reading the notice
              </p>
              <Skeleton className="h-4 w-full max-w-xl" />
              <Skeleton className="h-4 w-4/5 max-w-lg" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={read}>
                <Sparkles /> Read it for {profile.name}
              </Button>
              <span className="text-xs text-muted-foreground">Takes a few seconds.</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3.5 py-2.5 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{overviewError(error)}</span>
        </p>
      )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- actions

export function TenderActions({ notice, profile }: { notice: Notice; profile: Profile }) {
  const asks = tenderAsks(notice.doc_no, notice.agency, profile);
  const actions: { label: string; what: string; icon: LucideIcon; ask: string }[] = [
    { label: "Draft clarification questions", what: "Questions for the agency, from gaps in the notice", icon: MessageCircleQuestion, ask: asks.clarification },
    { label: "Draft compliance matrix", what: "Each requirement, and how you meet it", icon: TableProperties, ask: asks.compliance },
    { label: "Build submission checklist", what: "Every document and form to send, and when", icon: ListChecks, ask: asks.checklist },
  ];
  return (
    <section aria-labelledby="actions" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="actions" className="text-[13.5px] font-semibold">
          Prepare a response
        </h2>
        <p className="text-[13px] text-muted-foreground">Kopi drafts these from the notice and your profile. You review and submit.</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {actions.map(({ label, what, icon: Icon, ask }) => (
          <li key={label}>
            <Link
              href={copilotHref(notice.doc_no, ask)}
              className="group flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-kopi" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{what}</span>
              </span>
              <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-kopi" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <Link href={copilotHref(notice.doc_no)} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
        <Sparkles className="text-kopi" /> Ask Kopi about this tender
      </Link>
    </section>
  );
}

export function TrackButton({ notice }: { notice: Notice }) {
  const { isTracked, track, untrack } = useTracked();
  const tracked = isTracked(notice.doc_no);
  return (
    <div className="flex items-center gap-3">
      {tracked && (
        <Link href="/submissions" className="hidden items-center gap-1 text-[13px] font-medium text-kopi hover:underline md:flex">
          Open in Submissions <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
      <Button
        variant={tracked ? "secondary" : "default"}
        aria-pressed={tracked}
        onClick={() => (tracked ? untrack(notice.doc_no) : track(notice))}
        title={tracked ? "Stop tracking this tender" : "Add it to Submissions"}
        className={cn("h-7 px-2.5", tracked && "bg-kopi-soft text-kopi hover:bg-kopi-soft/70")}
      >
        {tracked ? <BookmarkCheck /> : <BookmarkPlus />}
        {tracked ? "Tracking" : "Track this tender"}
      </Button>
    </div>
  );
}
