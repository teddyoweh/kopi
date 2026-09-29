import { ArrowRight } from "lucide-react";

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

/** Where the bid stands, in one line: five segments, the stage by name, and the next step under them. */
export function StageLine({ memory, working }: { memory: BidMemory | null; working: boolean }) {
  const current = STAGES.findIndex((s) => s.id === memory?.stage);
  const next = memory?.next_step ?? (working ? "Kopi is working on the bid" : current < 0 ? "Start the bid and Kopi qualifies it, then drafts what you need" : null);
  return (
    <div className="flex flex-col gap-1.5" aria-label="Stage">
      <div className="flex items-center gap-2.5">
        <ol className="flex items-center gap-1" aria-hidden>
          {STAGES.map((stage, i) => (
            <li key={stage.id} title={stage.label} className={cn("h-1 w-5 rounded-full", current > i ? "bg-kopi" : current === i ? "bg-kopi/55" : "bg-foreground/10")} />
          ))}
        </ol>
        <p className="text-[12.5px]">
          {current >= 0 ? (
            <>
              <span className="font-medium">{STAGES[current]!.label}</span>
              <span className="text-muted-foreground">
                {" "}
                · {STAGES[current]!.hint.toLowerCase()} · {current + 1} of {STAGES.length}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Not started</span>
          )}
        </p>
      </div>
      {next && (
        <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-foreground/80">
          <ArrowRight className="mt-0.5 size-3 shrink-0 text-kopi" aria-hidden />
          <span className="line-clamp-2">{next}</span>
        </p>
      )}
    </div>
  );
}
