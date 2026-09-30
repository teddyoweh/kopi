"use client";

import { ArrowRight, ArrowUpRight, Briefcase, Check, CheckCheck, Clock3, FileText, Inbox, Play, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { StageLine } from "@/components/bid/stage-stepper";
import { Countdown, useNow } from "@/components/bid/time";
import { PageHeader } from "@/components/page-header";
import { PreviewPane } from "@/components/search/preview-pane";
import { AgencyDisc } from "@/components/search/result-card";
import { useWide } from "@/components/search/results";
import { EmptyState, RowsSkeleton } from "@/components/states";
import { tenderHref } from "@/components/tender-row";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useBidStatus } from "@/lib/bid-status";
import { bidHref } from "@/lib/bids";
import { ago, closingLabel, dateTime } from "@/lib/format";
import { useInbox, type InboxItem, type InboxKind } from "@/lib/inbox";
import { shortTitle } from "@/lib/short-title";
import { displayTitle } from "@/lib/title-case";
import { cn } from "@/lib/utils";

const KIND: Record<InboxKind, { icon: LucideIcon; label: string }> = {
  deadline: { icon: Clock3, label: "Deadline" },
  next: { icon: ArrowRight, label: "Next step" },
  unstarted: { icon: Play, label: "Not started" },
  match: { icon: Sparkles, label: "New match" },
};

/** Where an item leads when it is opened rather than previewed. */
function itemHref(item: InboxItem): string {
  return item.kind === "match" ? tenderHref(item.doc) : bidHref(item.doc);
}

/** The line under an item's title: what it wants from the person, in their words. */
function line(item: InboxItem): string {
  switch (item.kind) {
    case "deadline":
      if (!item.text) return `Closes ${dateTime(item.closing)}`;
      return item.bid?.session_id ? `Next: ${item.text}` : item.text;
    case "next":
      return `Next: ${item.text}`;
    case "unstarted":
      return item.text;
    case "match":
      return `${item.text} · ${item.agency}`;
  }
}

/** "6d left", "today": a deadline in the width of a timestamp. */
function daysLeft(closing: string, now: number): string {
  const label = closingLabel(closing, now);
  return label === "Closes today" ? "Today" : label === "Closes tomorrow" ? "1d left" : label.replace(/^Closes in (\d+) days$/, "$1d left");
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

function ItemRow({
  item,
  read,
  selected,
  now,
  onSelect,
  onDone,
  rowRef,
}: {
  item: InboxItem;
  read: boolean;
  selected: boolean;
  now: number;
  onSelect: () => void;
  onDone: () => void;
  rowRef: (el: HTMLLIElement | null) => void;
}) {
  const { icon: Icon, label } = KIND[item.kind];
  return (
    <li
      ref={rowRef}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted/70",
        selected && "bg-muted hover:bg-muted",
      )}
    >
      <span className={cn("absolute left-1 size-1.5 rounded-full bg-kopi transition-opacity", read && "opacity-0")} aria-hidden />
      <span
        className={cn("grid size-8 shrink-0 place-items-center rounded-full", item.urgent ? "bg-unmet-soft text-unmet" : item.kind === "match" ? "bg-kopi-soft text-kopi" : "bg-muted text-foreground/70")}
        title={label}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left after:absolute after:inset-0">
        <span className={cn("truncate text-[14px] tracking-[-0.005em]", read ? "font-book text-foreground/75" : "font-medium")}>
          <span className="sr-only">{read ? "" : "Unread. "}{label}: </span>
          {shortTitle(item.title)}
        </span>
        <span className={cn("truncate text-[12.5px]", item.urgent ? "text-unmet" : "text-muted-foreground")}>{line(item)}</span>
      </button>
      <span className={cn("shrink-0 text-[12px] tabular-nums group-hover:hidden", item.urgent ? "text-unmet" : "text-muted-foreground")}>{item.kind === "deadline" ? daysLeft(item.closing, now) : ago(item.at, now)}</span>
      <button
        type="button"
        onClick={onDone}
        aria-label={`Done: ${shortTitle(item.title)}`}
        title="Done (e)"
        className="relative z-10 hidden size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors group-hover:grid hover:bg-card hover:text-foreground"
      >
        <Check className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

/** A bid item beside the list: where the bid stands and the way into it. */
function BidPreview({ item, now }: { item: InboxItem; now: number }) {
  const bid = item.bid!;
  const { status } = useBidStatus(bid.session_id);
  return (
    <aside aria-label="Preview" className="flex flex-col gap-4 rounded-xl border bg-card px-5 pt-4 pb-5">
      <div className="flex items-center gap-2">
        <AgencyDisc agency={bid.agency} />
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{bid.agency}</p>
      </div>
      <h3 className="text-[17px] leading-snug font-medium tracking-[-0.015em] text-pretty">{displayTitle(bid.title)}</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        <Countdown closing={bid.closing} now={now} />
        {status && status.drafts > 0 && (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2.5 text-[12px] font-book text-foreground/70">
            <FileText className="size-3.5" aria-hidden /> {status.drafts} {status.drafts === 1 ? "document" : "documents"}
          </span>
        )}
      </div>
      <StageLine memory={status?.memory ?? null} working={false} brief />
      <div className="flex flex-wrap gap-1.5">
        <Link href={bidHref(bid.doc_no, !bid.session_id)} className={cn(buttonVariants())}>
          {bid.session_id ? <Briefcase /> : <Play />} {bid.session_id ? "Open bid" : "Start the bid"}
        </Link>
        <Link href={tenderHref(bid.doc_no)} className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground")}>
          Tender <ArrowUpRight />
        </Link>
      </div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-1">
      <h2 className="px-3 pt-1 pb-1 text-[12.5px] font-book text-muted-foreground">{label}</h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

/**
 * Everything that needs the person, newest and most urgent first, with the selected item
 * beside the list on wide screens. j/k move, Enter opens, e marks done.
 */
export function InboxView() {
  const inbox = useInbox();
  const { items, isRead, markRead, markAllRead, markDone, undoDone, loading } = inbox;
  const router = useRouter();
  const wide = useWide();
  const now = useNow(60_000);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement | null>());

  const needs = items.filter((i) => i.kind !== "match");
  const matches = items.filter((i) => i.kind === "match");
  const ordered = [...needs, ...matches];
  const selected = ordered.find((i) => i.id === selectedId) ?? (wide ? ordered[0] : undefined);

  function select(item: InboxItem) {
    markRead(item.id);
    if (wide) setSelectedId(item.id);
    else router.push(itemHref(item));
  }

  function done(item: InboxItem) {
    const index = ordered.findIndex((i) => i.id === item.id);
    markDone(item.id);
    const next = ordered[index + 1] ?? ordered[index - 1];
    setSelectedId(next?.id ?? null);
    toast({ title: "Marked done", description: shortTitle(item.title), icon: Check, action: { label: "Undo", onClick: () => undoDone(item.id) } });
  }

  // Previewing an item on a wide screen reads it.
  const shown = wide ? selected?.id : undefined;
  useEffect(() => {
    if (shown) markRead(shown);
  }, [shown, markRead]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || !ordered.length) return;
      const at = selected ? ordered.indexOf(selected) : -1;
      const move = (to: number) => {
        event.preventDefault();
        const next = ordered[Math.max(0, Math.min(ordered.length - 1, to))]!;
        setSelectedId(next.id);
        markRead(next.id);
        rows.current.get(next.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      if (event.key === "j" || event.key === "ArrowDown") move(at + 1);
      else if (event.key === "k" || event.key === "ArrowUp") move(at - 1);
      else if (event.key === "Enter" && selected && !(event.target as HTMLElement | null)?.closest("a, button")) router.push(itemHref(selected));
      else if (event.key === "e" && selected) done(selected);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const row = (item: InboxItem) => (
    <ItemRow
      key={item.id}
      item={item}
      read={isRead(item.id)}
      selected={wide && selected?.id === item.id}
      now={now}
      onSelect={() => select(item)}
      onDone={() => done(item)}
      rowRef={(el) => {
        rows.current.set(item.id, el);
      }}
    />
  );

  return (
    <>
      <PageHeader
        title="Inbox"
        description="What needs you: bid deadlines, the next step Kopi set on each bid, and new tenders that match your company or your views."
        actions={
          inbox.unread > 0 && (
            <button type="button" onClick={markAllRead} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <CheckCheck /> Mark all read
            </button>
          )
        }
      />
      {!items.length && loading ? (
        <div className="rounded-xl border bg-card p-2">
          <RowsSkeleton rows={5} />
        </div>
      ) : !items.length ? (
        <EmptyState icon={Inbox} title="You're all caught up">
          Kopi puts bid deadlines, the next step on each bid and new tenders that match your company here.{" "}
          <Link href="/search" className="font-medium text-kopi underline-offset-4 hover:underline">
            Find tenders
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card px-2 pt-2 pb-2">
            {needs.length > 0 && <Group label="Needs you">{needs.map(row)}</Group>}
            {matches.length > 0 && <Group label="New for you">{matches.map(row)}</Group>}
            <p className="hidden items-center gap-1 px-3 pt-1 pb-1 text-[12px] text-muted-foreground xl:flex">
              j / k to move · ↵ to open · e when done
            </p>
          </div>
          <div className="sticky top-18 hidden xl:block">
            {selected?.kind === "match" && selected.notice ? (
              <PreviewPane notice={selected.notice} />
            ) : selected?.bid ? (
              <BidPreview item={selected} now={now} />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
