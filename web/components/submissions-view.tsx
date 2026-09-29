"use client";

import { ArrowRight, Check, ChevronRight, ClipboardCheck, ExternalLink, FileText, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DownloadButton, DraftPreview, type DraftRefLike } from "@/components/draft-preview";
import { useApi, useKopi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { copilotHref } from "@/components/tender-ai";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChecklistItem } from "@/lib/api";
import { tenderAsks } from "@/lib/copilot";
import { dateTime, daysUntil, shortDate, timeLeft } from "@/lib/format";
import { useTenderDrafts, useTicks, useTracked, type Tracked } from "@/lib/submissions";
import { useAsync } from "@/lib/use-async";
import { displayTitle } from "@/lib/title-case";
import { cn } from "@/lib/utils";

const SOURCE: Record<ChecklistItem["source"], string> = {
  eligibility: "Eligibility",
  notice: "From the notice",
  drafting: "Drafting",
  submission: "Submission",
};

/** The time now, ticking every half minute, so countdowns stay true while the page is open. */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** "Due 17 Oct 2026, 4:00 pm SGT, in 18 days". The closing item leaves out "in N days"; the countdown beside it says it. */
function dueLabel(iso: string, now: number, closing: boolean): string {
  if (new Date(iso).getTime() < now) return `Was due ${dateTime(iso)}`;
  if (closing) return `Due ${dateTime(iso)}`;
  const days = daysUntil(iso, now);
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return `Due ${dateTime(iso)}, ${when}`;
}

/** "clarification-questions" from "GVT000ETT26000101-clarification-questions.md", read as words. */
function draftName(file: string, doc: string): string {
  const words = file.replace(/\.md$/, "").replace(`${doc}-`, "").replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : file;
}

/** Time left, right-aligned: "5 days 19 hours left" (red under 48 hours), and the deadline itself in SGT. */
function Countdown({ closing, now, className }: { closing: string; now: number; className?: string }) {
  const left = timeLeft(closing, now);
  const urgent = !left.closed && left.hours < 48;
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <p className={cn("text-[13px] font-book tabular-nums", left.closed ? "text-muted-foreground" : urgent && "text-unmet")}>
        {left.closed ? "Closed" : `${[left.lead, left.rest].filter(Boolean).join(" ")} left`}
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {left.closed ? "Closed" : "Closes"} {dateTime(closing)}
      </p>
    </div>
  );
}

/** Linear's progress pie: a ring with a wedge that fills in the accent as items are ticked. */
function ProgressPie({ done, total }: { done: number; total: number }) {
  const share = total ? done / total : 0;
  const r = 2.75;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="none" strokeWidth="1.5" className={share > 0 ? "stroke-kopi" : "stroke-muted-foreground/40"} />
      {share > 0 && <circle cx="8" cy="8" r={r} fill="none" strokeWidth={2 * r} strokeDasharray={`${c * share} ${c}`} className="stroke-kopi" />}
    </svg>
  );
}

function ChecklistRow({
  item,
  ticked,
  onToggle,
  now,
  tender,
}: {
  item: ChecklistItem;
  ticked: boolean;
  onToggle: () => void;
  now: number;
  tender: Tracked;
}) {
  const { profile } = useKopi();
  const overdue = item.due ? new Date(item.due).getTime() < now : false;
  // The submit item repeats the closing time in the API's own format; the due line below says it in SGT.
  const detail = item.source === "submission" ? item.detail.replace(/^Closes [^.]*SGT\.\s*/, "") : item.detail;
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-start sm:gap-4">
      <label className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-start gap-x-3 sm:flex-nowrap">
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
        <span className="flex min-w-0 flex-1 basis-[calc(100%-1.75rem)] flex-col gap-0.5 sm:basis-auto">
          <span className={cn("text-[13px] font-book break-words", ticked && "text-muted-foreground line-through decoration-foreground/20")}>{item.label}</span>
          {detail && <span className="text-[13px] break-words text-muted-foreground">{detail}</span>}
        </span>
        {/* Where it comes from and when it is due: under the item on a phone, on its right otherwise. */}
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 pl-7 text-xs text-muted-foreground sm:shrink-0 sm:flex-col sm:items-end sm:pt-0.5 sm:pl-0 sm:text-right">
          <span>{SOURCE[item.source]}</span>
          {item.due && <span className={cn(overdue && !ticked && "font-book text-unmet")}>{dueLabel(item.due, now, item.source === "submission")}</span>}
        </span>
      </label>
      {item.source === "drafting" && !ticked && (
        <Link
          href={copilotHref(tender.doc_no, tenderAsks(tender.doc_no, tender.agency, profile).clarification)}
          className="flex shrink-0 items-center gap-1 pl-7 text-[13px] font-book text-kopi hover:underline sm:pl-0"
        >
          Draft with Kopi <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </li>
  );
}

function ChecklistSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border/70 rounded-xl border bg-card" aria-busy="true" aria-label="Loading the checklist">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-3">
          <Skeleton className="size-4 rounded-[5px]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TenderDrafts({ doc, onOpen }: { doc: string; onOpen: (draft: DraftRefLike) => void }) {
  const drafts = useTenderDrafts(doc);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium">Drafts for this tender</h3>
      {drafts.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          None yet. Drafts the copilot writes for this tender are listed here.{" "}
          <Link href={copilotHref(doc)} className="font-book text-kopi hover:underline">
            Ask Kopi
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border bg-card">
          {[...drafts].reverse().map((d) => (
            <li key={`${d.session_id}/${d.file}`} className="flex items-center gap-1 pr-1.5 transition-colors hover:bg-muted/30">
              <button
                type="button"
                onClick={() => onOpen({ session_id: d.session_id, file: d.file, title: draftName(d.file, doc) })}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left"
              >
                <FileText className="size-3.5 shrink-0 text-kopi" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-book">{draftName(d.file, doc)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {d.file} · written {shortDate(d.at)}
                  </span>
                </span>
              </button>
              <DownloadButton sessionId={d.session_id} name={d.file} size="icon-sm" variant="ghost" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TenderRow({
  item,
  now,
  defaultOpen,
  onUntrack,
  onOpenDraft,
}: {
  item: Tracked;
  now: number;
  defaultOpen: boolean;
  onUntrack: () => void;
  onOpenDraft: (draft: DraftRefLike) => void;
}) {
  const api = useApi();
  const { profile } = useKopi();
  const [open, setOpen] = useState(defaultOpen);
  const [attempt, setAttempt] = useState(0);
  const checklist = useAsync(async () => (api ? api.checklist(item.doc_no, profile) : null), [api, item.doc_no, profile, attempt]);
  const [ticked, toggle] = useTicks(item.doc_no);
  const items = checklist.data ?? [];
  const done = items.filter((i) => ticked.has(i.id)).length;
  // The checklist's submit item carries the notice's closing time as it is now; the stored one is from when it was tracked.
  const closing = items.find((i) => i.source === "submission" && i.due)?.due ?? item.closing;
  const panel = `tender-${item.doc_no}`;
  const progress =
    checklist.status === "ready" ? `${done} of ${items.length} done` : checklist.status === "error" ? "Checklist unavailable" : "Loading checklist";

  return (
    <li className="flex flex-col">
      <div className="relative flex items-start gap-2 px-2 py-3 transition-colors hover:bg-muted/40 sm:items-center sm:gap-3 sm:px-3">
        {/* The whole row opens the checklist; the title still goes to the tender. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panel}
          aria-label={open ? "Hide checklist" : "Show checklist"}
          className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors outline-none after:absolute after:inset-0 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            href={`/tender/?doc=${item.doc_no}`}
            className="relative z-10 line-clamp-2 w-fit text-[14px] leading-snug font-book tracking-[-0.005em] break-words hover:underline sm:line-clamp-1"
          >
            {displayTitle(item.title)}
          </Link>
          <p className="truncate text-[12.5px] text-muted-foreground">
            {item.agency} · <span className="tabular-nums">{item.doc_no}</span>
          </p>
          <div className="flex flex-col gap-1 pt-1.5 sm:hidden">
            <Countdown closing={closing} now={now} />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              <ProgressPie done={done} total={items.length} /> {progress}
            </p>
          </div>
        </div>
        <p className="hidden w-36 shrink-0 items-center gap-2 text-[13px] text-muted-foreground tabular-nums sm:flex">
          <ProgressPie done={done} total={items.length} /> {progress}
        </p>
        <Countdown closing={closing} now={now} className="hidden w-52 shrink-0 items-end text-right sm:flex" />
      </div>

      {open && (
        <div id={panel} className="flex flex-col gap-6 border-t border-border/70 bg-background/60 px-4 pt-4 pb-5 sm:pr-5 sm:pl-12">
          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] font-medium">Checklist for {profile.name}</h3>
            {checklist.status === "loading" && <ChecklistSkeleton />}
            {checklist.status === "error" && <ErrorState error={checklist.error} onRetry={() => setAttempt((n) => n + 1)} />}
            {checklist.status === "ready" && (
              <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border bg-card">
                {items.map((i) => (
                  <ChecklistRow key={i.id} item={i} ticked={ticked.has(i.id)} onToggle={() => toggle(i.id)} now={now} tender={item} />
                ))}
              </ul>
            )}
          </div>

          <TenderDrafts doc={item.doc_no} onOpen={onOpenDraft} />

          <div className="flex flex-wrap gap-2">
            <Link href={copilotHref(item.doc_no)} className={cn(buttonVariants({ variant: "outline" }))}>
              <Sparkles className="text-kopi" /> Ask Kopi
            </Link>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }))}>
              Submit on GeBIZ <ExternalLink />
            </a>
            <Button variant="ghost" onClick={onUntrack} className="text-muted-foreground">
              <X /> Stop tracking
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** A group of rows under a Linear list header: its name and count. */
function Group({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-xl border bg-card">
      <h2 id={id} className="flex h-12 items-center gap-2 px-5 text-[14px] font-medium tracking-[-0.01em]">
        {label}
        <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      <ul className="flex flex-col divide-y divide-border/70 border-t border-border/70">{children}</ul>
    </section>
  );
}

export function SubmissionsView() {
  const { tracked, untrack } = useTracked();
  const { profile } = useKopi();
  const now = useNow();
  const [preview, setPreview] = useState<DraftRefLike | null>(null);
  const byDeadline = [...tracked].sort((a, b) => new Date(a.closing).getTime() - new Date(b.closing).getTime());
  const open = byDeadline.filter((t) => new Date(t.closing).getTime() > now);
  const closed = byDeadline.filter((t) => new Date(t.closing).getTime() <= now);

  return (
    <>
      <PageHeader
        title="Submissions"
        description={`The tenders you're pursuing, what each still needs, and how long is left in Singapore time. Checklists are built for ${profile.name}; you submit on GeBIZ.`}
        actions={
          tracked.length > 0 && (
            <Link href="/search" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <Search /> Find tenders
            </Link>
          )
        }
      />
      {tracked.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Nothing tracked yet">
          <div className="flex flex-col items-start gap-4">
            <p>
              Find a tender, open it and choose <span className="font-medium text-foreground">Track this tender</span>. It lands here with its
              checklist, its deadline and the drafts Kopi writes for it.
            </p>
            <Link href="/search" className={cn(buttonVariants())}>
              <Search /> Find tenders
            </Link>
          </div>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {open.length > 0 && (
            <Group id="open" label="Open" count={open.length}>
              {open.map((t, i) => (
                <TenderRow key={t.doc_no} item={t} now={now} defaultOpen={i === 0 || open.length <= 3} onUntrack={() => untrack(t.doc_no)} onOpenDraft={setPreview} />
              ))}
            </Group>
          )}
          {closed.length > 0 && (
            <Group id="closed" label="Closed" count={closed.length}>
              {closed.map((t) => (
                <TenderRow key={t.doc_no} item={t} now={now} defaultOpen={false} onUntrack={() => untrack(t.doc_no)} onOpenDraft={setPreview} />
              ))}
            </Group>
          )}
        </div>
      )}
      <DraftPreview draft={preview} onClose={() => setPreview(null)} />
    </>
  );
}
