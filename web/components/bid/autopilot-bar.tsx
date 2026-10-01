"use client";

import { Ban, CheckCircle2, Download, FileCheck2, Loader2, Pause, Play, Search, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import type { BidStage } from "@/lib/api";
import type { Autopilot } from "@/lib/bids";
import { cn } from "@/lib/utils";

/** The autopilot's four steps, by the stage the bid is at when each starts. */
const STEPS: { stages: (BidStage | null)[]; label: string; what: string }[] = [
  { stages: [null, "qualify"], label: "Qualify", what: "Reading everything and making the call" },
  { stages: ["clarify"], label: "Clarify", what: "Questions and the compliance matrix" },
  { stages: ["draft"], label: "Draft", what: "The proposal, the cover letter and the price" },
  { stages: ["review"], label: "Review and pack", what: "Checking it all as an evaluator would" },
];

export function stepOf(stage: BidStage | null | undefined): number {
  const i = STEPS.findIndex((s) => s.stages.includes(stage ?? null));
  return i === -1 ? STEPS.length : i;
}

/** A no-bid call ends autopilot without reaching submit; the playbook marks it in the next step. */
export const isNoBid = (next: string | null | undefined) => /^no bid/i.test(next ?? "");

function Bar({ tone = "muted", children }: { tone?: "muted" | "done"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3.5 py-2.5 text-[13px]",
        tone === "done" ? "bg-met-soft" : "bg-muted/70",
      )}
      role="status"
    >
      {children}
    </div>
  );
}

/**
 * What the autopilot is doing for this bid, and the one control that matters right now: run it,
 * pause it, resume it, or, once it is done, open the submission pack.
 */
export function AutopilotBar({
  state,
  stage,
  next,
  busy,
  started,
  hasPack,
  onRun,
  onPause,
  onResume,
  onOpenPack,
  onDownloadAll,
}: {
  state: Autopilot | null | undefined;
  stage: BidStage | null | undefined;
  next: string | null | undefined;
  busy: boolean;
  started: boolean;
  hasPack: boolean;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
  onOpenPack: () => void;
  onDownloadAll: () => void;
}) {
  const step = stepOf(stage);

  if (stage === "submit" && (state === "done" || hasPack)) {
    return (
      <Bar tone="done">
        <CheckCircle2 className="size-4 shrink-0 text-met" aria-hidden />
        <span className="min-w-48 flex-1">
          <span className="font-medium">Ready to submit.</span> <span className="text-foreground/75">{next ?? "Kopi ran the bid end to end."}</span>
        </span>
        <span className="flex gap-1.5">
          {hasPack && (
            <Button size="sm" onClick={onOpenPack}>
              <FileCheck2 /> Open the pack
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onDownloadAll}>
            <Download /> Download all
          </Button>
        </span>
      </Bar>
    );
  }

  if (isNoBid(next) && state !== "on") {
    return (
      <Bar>
        <Ban className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-48 flex-1">
          <span className="font-medium">Kopi&apos;s call: no bid.</span> <span className="text-muted-foreground">{next!.replace(/^no bid:\s*/i, "")}</span>
        </span>
        <Link href="/search" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
          <Search /> Find tenders
        </Link>
      </Bar>
    );
  }

  if (state === "on") {
    const current = STEPS[Math.min(step, STEPS.length - 1)]!;
    return (
      <Bar>
        <Loader2 className={cn("size-4 shrink-0 text-kopi", busy && "animate-spin")} aria-hidden />
        <span className="min-w-48 flex-1">
          <span className="font-medium">Autopilot</span>
          <span className="text-muted-foreground tabular-nums">
            {" "}
            · step {Math.min(step + 1, STEPS.length)} of {STEPS.length} · {current.label}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground" title="Autopilot runs while this bid is open, and picks up where it stopped when you come back.">
            {busy ? current.what : "Starting the next step"}
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={onPause}>
          <Pause /> Pause
        </Button>
      </Bar>
    );
  }

  if (state === "paused") {
    return (
      <Bar>
        <Pause className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-48 flex-1">
          <span className="font-medium">Autopilot paused</span>
          <span className="text-muted-foreground"> at {STEPS[Math.min(step, STEPS.length - 1)]!.label.toLowerCase()}</span>
        </span>
        <Button size="sm" onClick={onResume} disabled={busy}>
          <Play /> Resume
        </Button>
      </Bar>
    );
  }

  if (!started || busy) return null;
  return (
    <Bar>
      <Sparkles className="size-4 shrink-0 text-kopi" aria-hidden />
      <span className="min-w-48 flex-1 text-foreground/80">Let Kopi take this bid the rest of the way: proposal, price, review and the submission pack.</span>
      <Button size="sm" onClick={onRun}>
        <Play /> Run on autopilot
      </Button>
    </Bar>
  );
}
