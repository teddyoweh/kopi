"use client";

import { Check, ListChecks } from "lucide-react";

import { useApi, useKopi } from "@/components/kopi-provider";
import { dueLabel } from "@/components/bid/time";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChecklistItem } from "@/lib/api";
import { useTicks } from "@/lib/submissions";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";

/** The rule-built submission checklist for the bid, ticked in this browser. */
export function useChecklist(doc: string) {
  const api = useApi();
  const { profile } = useKopi();
  const state = useAsync(async () => (api ? api.checklist(doc, profile) : null), [api, doc, profile]);
  const [ticked, toggle] = useTicks(doc);
  const items = state.data ?? [];
  return { state, items, ticked, toggle, done: items.filter((i) => ticked.has(i.id)).length };
}

function Row({ item, ticked, onToggle, now }: { item: ChecklistItem; ticked: boolean; onToggle: () => void; now: number }) {
  const overdue = item.due ? new Date(item.due).getTime() < now : false;
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/70">
        <input type="checkbox" checked={ticked} onChange={onToggle} className="peer sr-only" />
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-kopi/40",
            ticked ? "border-kopi bg-kopi text-white" : "border-foreground/25 bg-card",
          )}
        >
          {ticked && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("text-[13px] leading-snug font-book break-words", ticked && "text-muted-foreground line-through decoration-foreground/20")}>{item.label}</span>
          {item.due && <span className={cn("text-[11.5px] text-muted-foreground", overdue && !ticked && "text-unmet")}>{dueLabel(item.due, now)}</span>}
        </span>
      </label>
    </li>
  );
}

export function ChecklistCard({ doc, now }: { doc: string; now: number }) {
  const { state, items, ticked, toggle, done } = useChecklist(doc);
  return (
    <section aria-labelledby="bid-checklist" className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <h2 id="bid-checklist" className="flex items-center gap-2 text-[14px] font-medium tracking-[-0.01em]">
          <ListChecks className="size-4 text-kopi" aria-hidden />
          Submission checklist
        </h2>
        {items.length > 0 && (
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {done} of {items.length}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="mx-4 mb-2 h-1 overflow-hidden rounded-full bg-foreground/[0.07]" role="meter" aria-valuenow={done} aria-valuemin={0} aria-valuemax={items.length} aria-label="Checklist progress">
          <div className="h-full rounded-full bg-kopi transition-[width]" style={{ width: `${(100 * done) / items.length}%` }} />
        </div>
      )}
      <div className="px-2 pb-2">
        {state.status === "loading" && (
          <div className="flex flex-col gap-2 px-2 py-1.5" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-3.5 w-4/5 rounded-full" />
            ))}
          </div>
        )}
        {state.status === "error" && <ErrorState error={state.error} />}
        <ul className="flex flex-col">
          {items.map((item) => (
            <Row key={item.id} item={item} ticked={ticked.has(item.id)} onToggle={() => toggle(item.id)} now={now} />
          ))}
        </ul>
      </div>
    </section>
  );
}
