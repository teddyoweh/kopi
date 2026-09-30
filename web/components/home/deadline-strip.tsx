"use client";

import Link from "next/link";

import { allOpen } from "@/components/overview";
import { Skeleton } from "@/components/ui/skeleton";
import type { KopiApi } from "@/lib/api";
import type { Bid } from "@/lib/bids";
import { daysUntil, sgDayParts } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";

const DAYS = 14;

/**
 * The next two weeks as fourteen columns: how many open GeBIZ notices close each day, with
 * the company's own bid deadlines marked on theirs. A day opens Search for its window.
 */
export function DeadlineStrip({ api, bids, now }: { api: KopiApi; bids: Bid[]; now: number }) {
  const state = useAsync(() => allOpen(api), [api]);
  const closing = new Array<number>(DAYS).fill(0);
  for (const notice of state.data ?? []) {
    const day = daysUntil(notice.closing, now);
    if (day >= 0 && day < DAYS && new Date(notice.closing).getTime() > now) closing[day]! += 1;
  }
  const ours = new Array<Bid[]>(DAYS).fill([]).map(() => [] as Bid[]);
  for (const bid of bids) {
    const day = daysUntil(bid.closing, now);
    if (day >= 0 && day < DAYS && new Date(bid.closing).getTime() > now) ours[day]!.push(bid);
  }
  const peak = Math.max(...closing, 1);
  // Today and the seven days after it, as Search's "Closes within 7 days" and Home's stat count them.
  const week = closing.slice(0, 8).reduce((a, b) => a + b, 0);

  return (
    <section aria-labelledby="next-two-weeks" className="flex flex-col gap-4 rounded-xl border bg-card px-5 pt-4 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="next-two-weeks" className="text-[14px] font-medium tracking-[-0.01em]">
          Next two weeks
        </h2>
        {state.data ? (
          <p className="text-[12.5px] text-muted-foreground tabular-nums">{week.toLocaleString("en-SG")} close within 7 days</p>
        ) : (
          <Skeleton className="h-3.5 w-24 rounded-full" />
        )}
      </div>
      <ol className="grid h-36 grid-cols-14 items-end gap-1 sm:gap-1.5" aria-busy={state.status === "loading"}>
        {closing.map((count, day) => {
          const parts = sgDayParts(day, now);
          const mine = ours[day]!;
          const label = `${parts.long}: ${count} closing${mine.length ? `, ${mine.length === 1 ? "your bid" : `${mine.length} of your bids`}` : ""}`;
          return (
            <li key={day} className="flex h-full min-w-0 flex-col items-center gap-1.5">
              <Link
                href={`/search/?closing=${day < 7 ? 7 : 30}`}
                title={label}
                aria-label={label}
                className="group flex w-full flex-1 flex-col items-center justify-end gap-1 rounded-md"
              >
                {mine.length > 0 && <span className="size-1.5 shrink-0 rounded-full bg-kopi" aria-hidden />}
                {state.data ? (
                  <span
                    className={cn(
                      "w-full max-w-5 rounded-[5px] transition-colors",
                      mine.length ? "bg-kopi group-hover:bg-kopi/85" : "bg-foreground/[0.09] group-hover:bg-foreground/20",
                    )}
                    style={{ height: `${Math.max(count ? (count / peak) * 100 : 0, count ? 6 : 2)}%` }}
                  />
                ) : (
                  <Skeleton className="w-full max-w-5 rounded-[5px]" style={{ height: `${30 + ((day * 37) % 50)}%` }} />
                )}
              </Link>
              <span className={cn("flex flex-col items-center text-[10.5px] leading-tight tabular-nums", day === 0 ? "font-medium text-foreground" : parts.weekend ? "text-muted-foreground/60" : "text-muted-foreground")}>
                <span className="hidden sm:block">{parts.weekday.slice(0, 2)}</span>
                <span>{parts.day}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[3px] bg-foreground/[0.12]" aria-hidden /> Closing on GeBIZ
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[3px] bg-kopi" aria-hidden /> Your bids
        </span>
      </div>
    </section>
  );
}
