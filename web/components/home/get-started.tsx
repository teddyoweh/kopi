"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";

import { useBids } from "@/lib/bids";
import { PROFILES_KEY } from "@/lib/profiles";
import { useRecents } from "@/lib/recents";
import { useStored } from "@/lib/stored";
import { cn } from "@/lib/utils";
import { isOwnView, useViews } from "@/lib/views";

type Step = { title: string; body: string; href: string; done: boolean };

const DISMISSED_KEY = "kopi.getStarted.dismissed";
const NO_PROFILES = null;

/**
 * The four things that show what Kopi does, each ticked from what the person has actually
 * done in this browser. It goes away when all four are done, or when they close it.
 */
export function GetStarted() {
  const [dismissed, setDismissed] = useStored<boolean>(DISMISSED_KEY, false);
  const [edited] = useStored<unknown>(PROFILES_KEY, NO_PROFILES);
  const { bids } = useBids();
  const { views } = useViews();
  const recents = useRecents();

  const steps: Step[] = [
    { title: "Tell Kopi what you do", body: "Capabilities, registrations and licences. Every tender is read against them.", href: "/profile", done: edited !== null },
    { title: "Read a tender with Kopi", body: "An overview with quotes checked against the notice, and what similar work sold for.", href: "/search", done: recents.length > 0 },
    { title: "Start a bid", body: "Kopi qualifies it and drafts the plan, questions, matrix and checklist.", href: "/search", done: bids.length > 0 },
    { title: "Save a view", body: "Pin a search to the sidebar and see what is new each time you look.", href: "/search", done: views.some(isOwnView) },
  ];
  const done = steps.filter((s) => s.done).length;
  if (dismissed || done === steps.length) return null;

  return (
    <section aria-labelledby="get-started" className="flex flex-col gap-4 rounded-xl border bg-card px-4 pt-4 pb-4 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="get-started" className="text-[14px] font-medium tracking-[-0.01em]">
            Get started with Kopi
          </h2>
          <p className="text-[12.5px] text-muted-foreground tabular-nums">
            {done} of {steps.length} done
          </p>
        </div>
        <div className="hidden w-32 grid-cols-4 gap-1 sm:grid" aria-hidden>
          {steps.map((step) => (
            <span key={step.title} className={cn("h-1 rounded-full", step.done ? "bg-kopi" : "bg-foreground/10")} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(() => true)}
          aria-label="Hide Get started"
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title}>
            <Link
              href={step.href}
              className={cn("flex h-full items-start gap-3 rounded-lg bg-muted/60 px-3.5 py-2.5 transition-colors hover:bg-muted sm:py-3", step.done && "bg-muted/35")}
            >
              <span
                className={cn(
                  "mt-px grid size-5 shrink-0 place-items-center rounded-full text-[11px] tabular-nums",
                  step.done ? "bg-kopi text-white" : "border border-foreground/15 bg-card text-muted-foreground",
                )}
                aria-hidden
              >
                {step.done ? <Check className="size-3" strokeWidth={2.5} /> : i + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={cn("text-[13.5px] font-book", step.done && "text-muted-foreground")}>
                  {step.title}
                  {step.done && <span className="sr-only"> (done)</span>}
                </span>
                <span className="hidden text-[12.5px] leading-snug text-muted-foreground sm:block">{step.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
