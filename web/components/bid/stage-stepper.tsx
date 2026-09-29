import { ArrowRight, Check } from "lucide-react";

import type { BidMemory, BidStage } from "@/lib/api";
import { cn } from "@/lib/utils";

export const STAGES: { id: BidStage; label: string; hint: string }[] = [
  { id: "qualify", label: "Qualify", hint: "Can we bid, and should we" },
  { id: "clarify", label: "Clarify", hint: "Questions to the agency" },
  { id: "draft", label: "Draft", hint: "Proposal, matrix, checklist" },
  { id: "review", label: "Review", hint: "Internal check and price" },
  { id: "submit", label: "Submit", hint: "On GeBIZ, a day early" },
];

export function stageLabel(stage: BidStage | null | undefined): string {
  return STAGES.find((s) => s.id === stage)?.label ?? "Not started";
}

/** Where the bid stands: five stages, the current one marked, and the next step under them. */
export function StageStepper({ memory, working }: { memory: BidMemory | null; working: boolean }) {
  const current = STAGES.findIndex((s) => s.id === memory?.stage);
  const next = memory?.next_step ?? (working ? "Kopi is working on the bid" : current < 0 ? "Start the bid and Kopi qualifies it, then drafts what you need" : null);
  return (
    <section aria-label="Stage" className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-4 sm:px-5">
      <ol className="grid grid-cols-5 gap-1.5">
        {STAGES.map((stage, i) => {
          const done = current > i;
          const now = current === i;
          return (
            <li key={stage.id} className="flex min-w-0 flex-col gap-2" aria-current={now ? "step" : undefined}>
              <span className={cn("h-1 rounded-full transition-colors", done ? "bg-kopi" : now ? "bg-kopi/60" : "bg-foreground/10")} aria-hidden />
              <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full text-white",
                    done ? "bg-kopi" : now ? "border-[4.5px] border-kopi bg-card" : "border border-foreground/20 bg-card",
                  )}
                  aria-hidden
                >
                  {done && <Check className="size-2.5" strokeWidth={3} />}
                </span>
                <span className={cn("truncate text-[13px]", now ? "font-medium text-foreground" : done ? "font-book text-foreground/80" : "text-muted-foreground")}>
                  {stage.label}
                </span>
              </span>
              <span className="hidden truncate text-[11.5px] text-muted-foreground md:block">{stage.hint}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-[13px] sm:hidden">
        {current >= 0 ? (
          <>
            <span className="font-medium">{STAGES[current]!.label}</span>
            <span className="text-muted-foreground"> · stage {current + 1} of {STAGES.length}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Not started</span>
        )}
      </p>
      {next && (
        <p className="flex items-start gap-1.5 text-[13px] text-foreground/85">
          <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-kopi" aria-hidden />
          <span>
            <span className="text-muted-foreground">Next: </span>
            {next}
          </span>
        </p>
      )}
    </section>
  );
}
