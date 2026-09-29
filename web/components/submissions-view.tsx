"use client";

import { ArrowRight, Check, ChevronDown, ClipboardCheck, ExternalLink, FileText, Search, Sparkles, X } from "lucide-react";
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

function Countdown({ closing, now }: { closing: string; now: number }) {
  const left = timeLeft(closing, now);
  const urgent = !left.closed && left.hours < 48;
  return (
    <div className="flex items-baseline gap-2 sm:w-36 sm:shrink-0 sm:flex-col sm:items-start sm:gap-1">
      <p className="hidden text-xs text-muted-foreground sm:block">{left.closed ? "Deadline" : "Time left"}</p>
      <p className={cn("text-xl leading-tight font-semibold tracking-tight tabular-nums sm:text-2xl", left.closed ? "text-muted-foreground" : urgent && "text-unmet")}>
        {left.lead}
      </p>
      {left.rest && <p className="text-sm text-muted-foreground tabular-nums">{left.rest}</p>}
      {!left.closed && <p className="text-sm text-muted-foreground sm:hidden">left</p>}
    </div>
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
    <li className="flex flex-col gap-2 rounded-lg bg-background px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <input type="checkbox" checked={ticked} onChange={onToggle} className="peer sr-only" />
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-kopi/50",
            ticked ? "bg-kopi text-white" : "bg-background ring-1 ring-foreground/25 ring-inset",
          )}
        >
          {ticked && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={cn("text-sm font-medium break-words", ticked && "text-muted-foreground")}>{item.label}</span>
          {detail && <span className="text-sm break-words text-muted-foreground">{detail}</span>}
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{SOURCE[item.source]}</span>
            {item.due && <span className={cn(overdue && !ticked && "font-medium text-unmet")}>{dueLabel(item.due, now, item.source === "submission")}</span>}
          </span>
        </span>
      </label>
      {item.source === "drafting" && !ticked && (
        <Link
          href={copilotHref(tender.doc_no, tenderAsks(tender.doc_no, tender.agency, profile).clarification)}
          className="flex shrink-0 items-center gap-1 pl-[30px] text-sm font-medium text-kopi hover:underline sm:pt-0.5 sm:pl-0"
        >
          Draft with Kopi <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </li>
  );
}

function ChecklistSkeleton() {
  return (
    <div className="flex flex-col gap-1.5" aria-busy="true" aria-label="Loading the checklist">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg bg-background" />
      ))}
    </div>
  );
}

function TenderDrafts({ doc, onOpen }: { doc: string; onOpen: (draft: DraftRefLike) => void }) {
  const drafts = useTenderDrafts(doc);
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-sm font-semibold">Drafts for this tender</h3>
      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None yet. Drafts the copilot writes for this tender are listed here.{" "}
          <Link href={copilotHref(doc)} className="font-medium text-kopi hover:underline">
            Ask Kopi
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {[...drafts].reverse().map((d) => (
            <li key={`${d.session_id}/${d.file}`} className="flex items-center gap-1 rounded-lg bg-background pr-1.5">
              <button
                type="button"
                onClick={() => onOpen({ session_id: d.session_id, file: d.file, title: draftName(d.file, doc) })}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-4 py-2.5 text-left"
              >
                <FileText className="size-4 shrink-0 text-kopi" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{draftName(d.file, doc)}</span>
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

function TenderCard({
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

  return (
    <article className="flex flex-col rounded-xl bg-secondary">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-8 sm:p-6">
        <Countdown closing={closing} now={now} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Link href={`/tender/?doc=${item.doc_no}`} className="text-base leading-snug font-semibold tracking-tight break-words hover:underline">
              {item.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              {item.agency} · <span className="font-mono text-[13px]">{item.doc_no}</span>
            </p>
            <p className="text-sm">Closes {dateTime(closing)}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-background" aria-hidden>
              <div className="h-full rounded-full bg-kopi transition-[width]" style={{ width: items.length ? `${(100 * done) / items.length}%` : "0%" }} />
            </div>
            <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
              {checklist.status === "ready" ? `${done} of ${items.length} done` : checklist.status === "error" ? "Checklist unavailable" : "Loading checklist"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panel}
          className="-ml-2.5 w-fit hover:bg-background sm:ml-0"
        >
          {open ? "Hide checklist" : "Show checklist"}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {open && (
        <div id={panel} className="flex flex-col gap-7 px-5 pb-5 sm:px-6 sm:pb-6 sm:pl-[12.5rem]">
          <div className="flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold">Checklist for {profile.name}</h3>
            {checklist.status === "loading" && <ChecklistSkeleton />}
            {checklist.status === "error" && <ErrorState error={checklist.error} onRetry={() => setAttempt((n) => n + 1)} />}
            {checklist.status === "ready" && (
              <ul className="flex flex-col gap-1.5">
                {items.map((i) => (
                  <ChecklistRow key={i.id} item={i} ticked={ticked.has(i.id)} onToggle={() => toggle(i.id)} now={now} tender={item} />
                ))}
              </ul>
            )}
          </div>

          <TenderDrafts doc={item.doc_no} onOpen={onOpenDraft} />

          <div className="flex flex-wrap gap-2">
            <Link href={copilotHref(item.doc_no)} className={buttonVariants({ variant: "outline", className: "bg-background" })}>
              <Sparkles className="text-kopi" /> Ask Kopi
            </Link>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", className: "bg-background" })}>
              Submit on GeBIZ <ExternalLink />
            </a>
            <Button variant="ghost" onClick={onUntrack} className="text-muted-foreground hover:bg-background">
              <X /> Stop tracking
            </Button>
          </div>
        </div>
      )}
    </article>
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
      />
      {tracked.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Nothing tracked yet">
          <div className="flex flex-col items-start gap-4">
            <p>
              Find a tender, open it and choose <span className="font-medium text-foreground">Track this tender</span>. It lands here with its
              checklist, its deadline and the drafts Kopi writes for it.
            </p>
            <Link href="/search" className={buttonVariants({ className: "h-9 px-3.5" })}>
              <Search /> Find tenders
            </Link>
          </div>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-10">
          {open.length > 0 && (
            <section aria-label="Open" className="flex flex-col gap-3">
              {open.map((t, i) => (
                <TenderCard key={t.doc_no} item={t} now={now} defaultOpen={i === 0 || open.length <= 3} onUntrack={() => untrack(t.doc_no)} onOpenDraft={setPreview} />
              ))}
            </section>
          )}
          {closed.length > 0 && (
            <section aria-labelledby="closed" className="flex flex-col gap-3">
              <h2 id="closed" className="text-base font-semibold tracking-tight">
                Closed
              </h2>
              {closed.map((t) => (
                <TenderCard key={t.doc_no} item={t} now={now} defaultOpen={false} onUntrack={() => untrack(t.doc_no)} onOpenDraft={setPreview} />
              ))}
            </section>
          )}
        </div>
      )}
      <DraftPreview draft={preview} onClose={() => setPreview(null)} />
    </>
  );
}
