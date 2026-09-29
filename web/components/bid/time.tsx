"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

import { dateTime, timeLeft } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The time now, ticking every half minute, so countdowns stay true while the page is open. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** "5 days 19 hours left" as a pill: red under 48 hours, the deadline itself in SGT on hover. */
export function Countdown({ closing, now }: { closing: string; now: number }) {
  const left = timeLeft(closing, now);
  const urgent = !left.closed && left.hours < 48;
  return (
    <span
      title={`${left.closed ? "Closed" : "Closes"} ${dateTime(closing)}`}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-book tabular-nums",
        left.closed ? "bg-muted text-muted-foreground" : urgent ? "bg-unmet-soft text-unmet" : "bg-kopi-soft text-kopi",
      )}
    >
      <Clock3 className="size-3.5" aria-hidden />
      {left.closed ? "Closed" : `${[left.lead, left.rest].filter(Boolean).join(" ")} left`}
    </span>
  );
}

/** "Due 17 Oct, in 18 days", or "Was due …" once passed. */
export function dueLabel(iso: string, now: number): string {
  if (new Date(iso).getTime() < now) return `Was due ${dateTime(iso)}`;
  const { lead, closed } = timeLeft(iso, now);
  return closed ? `Due ${dateTime(iso)}` : `Due ${dateTime(iso)}, in ${lead}`;
}
