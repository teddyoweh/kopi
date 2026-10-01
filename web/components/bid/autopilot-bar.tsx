"use client";

import { Ban, CheckCircle2, Loader2, Pause, Play, Sparkles } from "lucide-react";

import type { BidStage } from "@/lib/api";
import type { Autopilot } from "@/lib/bids";
import { cn } from "@/lib/utils";

/** The autopilot's four steps, by the stage the bid is at when each starts. */
const STEPS: { stages: (BidStage | null)[]; label: string }[] = [
  { stages: [null, "qualify"], label: "Qualifying" },
  { stages: ["clarify"], label: "Clarifying" },
  { stages: ["draft"], label: "Drafting" },
  { stages: ["review"], label: "Reviewing" },
];

export function stepOf(stage: BidStage | null | undefined): number {
  const i = STEPS.findIndex((s) => s.stages.includes(stage ?? null));
  return i === -1 ? STEPS.length : i;
}

/** A no-bid call ends autopilot without reaching submit; the playbook marks it in the next step. */
export const isNoBid = (next: string | null | undefined) => /^no bid/i.test(next ?? "");

const PILL = "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-book transition-colors";

/**
 * The autopilot in one pill, at the end of the bid's title row: run it, see which step it is on
 * and pause it, resume it, or open the submission pack once the bid is ready.
 */
export function AutopilotControl({
  state,
  stage,
  next,
  busy,
  started,
  onRun,
  onPause,
  onOpenPack,
}: {
  state: Autopilot | null | undefined;
  stage: BidStage | null | undefined;
  next: string | null | undefined;
  busy: boolean;
  started: boolean;
  onRun: () => void;
  onPause: () => void;
  onOpenPack: () => void;
}) {
  if (stage === "submit") {
    return (
      <button type="button" onClick={onOpenPack} className={cn(PILL, "bg-met-soft text-met hover:bg-met-soft/70")} title="Open the submission pack">
        <CheckCircle2 className="size-3.5" aria-hidden /> Ready to submit
      </button>
    );
  }
  if (isNoBid(next) && state !== "on") {
    return (
      <span className={cn(PILL, "bg-muted text-muted-foreground")} title={next ?? undefined}>
        <Ban className="size-3.5" aria-hidden /> No bid
      </span>
    );
  }
  if (state === "on") {
    const step = Math.min(stepOf(stage), STEPS.length - 1);
    return (
      <span className="flex shrink-0 items-center gap-0.5">
        <span className={cn(PILL, "bg-kopi-soft text-kopi")} title="Autopilot runs while this bid is open, and picks up where it stopped when you come back">
          <Loader2 className={cn("size-3.5", busy && "animate-spin")} aria-hidden />
          {STEPS[step]!.label} <span className="tabular-nums opacity-70">{step + 1}/4</span>
        </span>
        <button type="button" onClick={onPause} aria-label="Pause autopilot" title="Pause after this step" className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Pause className="size-3.5" aria-hidden />
        </button>
      </span>
    );
  }
  if (!started) return null;
  return (
    <button type="button" onClick={onRun} disabled={busy} className={cn(PILL, "bg-kopi text-white hover:bg-kopi/90 disabled:opacity-50")} title="Kopi takes the bid the rest of the way: proposal, price, review and the submission pack">
      {state === "paused" ? <Play className="size-3.5" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
      {state === "paused" ? "Resume autopilot" : "Autopilot"}
    </button>
  );
}
