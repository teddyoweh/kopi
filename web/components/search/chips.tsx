import { Ban, Check, CircleHelp, Clock3, Coins, Layers, type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { EligibilitySummary, MarketBand } from "@/lib/api";
import { closingLabel, daysUntil, moneyShort } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "met" | "unmet" | "open" | "kopi" | "plain";

const TONES: Record<Tone, string> = {
  met: "bg-met-soft text-met",
  unmet: "bg-unmet-soft text-unmet",
  open: "bg-muted text-foreground/75",
  kopi: "bg-kopi-soft text-kopi",
  plain: "border bg-card text-foreground/70",
};

export function Chip({ tone = "plain", icon: Icon, title, children }: { tone?: Tone; icon?: LucideIcon; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={cn("inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-book whitespace-nowrap", TONES[tone])}>
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function ChipSkeleton({ width = "w-24" }: { width?: string }) {
  return <Skeleton className={cn("h-6 rounded-full", width)} />;
}

/** "GRA EPU/CMP/10 Computer Related … at S6" → "EPU/CMP/10 at S6": the code is what a bid team scans for. */
export function shortRequirement(requirement: string): string {
  const code = requirement.match(/\b[A-Z]{2,4}\/[A-Z]{2,4}\/\d{2}\b|\b(?:CW|CR|ME)\d{2}\b/)?.[0];
  const grade = requirement.match(/\bat ([A-Z0-9]{1,3})$/)?.[1];
  if (code) return grade ? `${code} at ${grade}` : code;
  return requirement.length > 34 ? `${requirement.slice(0, 33).replace(/\s+\S*$/, "")}…` : requirement;
}

/**
 * Eligibility for the active profile in one chip. The closing check is always one of the
 * checks, so a tender with nothing else to check names no registration or licence at all.
 */
export function EligibilityChip({ summary }: { summary: EligibilitySummary }) {
  const checked = summary.met + summary.unmet + summary.unknown - 1;
  if (summary.blocker && summary.blocker.kind !== "closing") {
    return (
      <Chip tone="unmet" icon={Ban} title={`${summary.blocker.requirement}. ${summary.blocker.reason}`}>
        Blocker · {shortRequirement(summary.blocker.requirement)}
      </Chip>
    );
  }
  if (summary.blocker) return <Chip tone="unmet" icon={Ban} title={summary.blocker.reason}>Closed</Chip>;
  if (summary.unknown && summary.open_question) {
    return (
      <Chip tone="open" icon={CircleHelp} title={`${summary.open_question.requirement}. ${summary.open_question.reason}`}>
        {summary.unknown === 1 ? `Confirm ${shortRequirement(summary.open_question.requirement)}` : `${summary.unknown} to confirm`}
      </Chip>
    );
  }
  if (checked <= 0) return <Chip tone="met" icon={Check} title="The notice names no registration or licence to check">No registration named</Chip>;
  return (
    <Chip tone="met" icon={Check} title="Every registration and licence the notice names is on the profile">
      Eligible · {checked} {checked === 1 ? "check" : "checks"} met
    </Chip>
  );
}

export function ClosingChip({ closing }: { closing: string }) {
  const days = daysUntil(closing);
  return (
    <Chip tone={days <= 3 ? "unmet" : days <= 7 ? "kopi" : "plain"} icon={Clock3}>
      {closingLabel(closing)}
    </Chip>
  );
}

/** What similar past awards sold for: the middle half when there are enough, else the median. */
export function ValueChip({ market }: { market: MarketBand }) {
  const { p25_amount: low, p75_amount: high, median_amount: median, similar_count: n } = market;
  const title = `From ${n} similar past GeBIZ award${n === 1 ? "" : "s"} on data.gov.sg`;
  if (low !== null && high !== null && high > low) {
    return (
      <Chip icon={Coins} title={title}>
        {moneyShort(low)}–{moneyShort(high).replace("S$", "")} past awards
      </Chip>
    );
  }
  if (median !== null) return <Chip icon={Coins} title={title}>~{moneyShort(median)} median award</Chip>;
  return null;
}

/** "Open Quotation" → "Quotation": every method on the Open tab is open. */
export function MethodChip({ method }: { method: string }) {
  return <Chip>{method.replace(/^Open\s+/i, "")}</Chip>;
}

export function EnvelopesChip() {
  return (
    <Chip icon={Layers} title="Technical and price proposals are sealed separately; the price is opened only if the technical passes">
      Two envelopes
    </Chip>
  );
}

/** How close a result is, as four bars; the exact score is in the tooltip. */
export function MatchMeter({ score }: { score: number }) {
  const level = score >= 0.6 ? 4 : score >= 0.45 ? 3 : score >= 0.3 ? 2 : 1;
  const label = ["", "Loose", "Fair", "Good", "Strong"][level];
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground tabular-nums" title={`Match ${score.toFixed(2)}: how closely this notice matches your search, from 0 to 1`}>
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((bar) => (
          <span key={bar} className={cn("w-[3px] rounded-full", bar <= level ? "bg-kopi" : "bg-foreground/12")} style={{ height: `${bar * 3}px` }} />
        ))}
      </span>
      <span className="sr-only">Match {score.toFixed(2)}, </span>
      {label}
    </span>
  );
}
