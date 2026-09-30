"use client";

import { ArrowRight, Briefcase, FileText, Play, Search, X } from "lucide-react";
import Link from "next/link";

import { stageLabel } from "@/components/bid/stage-stepper";
import { Countdown, useNow } from "@/components/bid/time";
import { useKopi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { AgencyDisc } from "@/components/search/result-card";
import { EmptyState } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useBidStatus } from "@/lib/bid-status";
import { bidHref, useBids, type Bid } from "@/lib/bids";
import { shortTitle } from "@/lib/short-title";
import { displayTitle } from "@/lib/title-case";
import { cn } from "@/lib/utils";

function BidRow({ bid, now, onRemove }: { bid: Bid; now: number; onRemove: () => void }) {
  const { status, loading } = useBidStatus(bid.session_id);
  const started = !!bid.session_id;
  const memory = status?.memory;
  return (
    <li className="kopi-row relative flex flex-col gap-3 rounded-lg px-3 py-3.5 transition-colors before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-border/80 first:before:hidden hover:bg-muted/70 hover:before:opacity-0 sm:flex-row sm:items-center sm:gap-5 [.kopi-row:hover+&]:before:opacity-0">
      <Link href={bidHref(bid.doc_no)} className="flex min-w-0 flex-1 items-start gap-3 after:absolute after:inset-0">
        <AgencyDisc agency={bid.agency} />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="line-clamp-2 text-[14px] leading-snug font-book tracking-[-0.005em]">{displayTitle(bid.title)}</span>
          <span className="truncate text-[12.5px] text-muted-foreground">
            {bid.agency} · <span className="tabular-nums">{bid.doc_no}</span>
          </span>
          {memory?.next_step && (
            <span className="flex items-center gap-1.5 text-[12.5px] text-foreground/80">
              <ArrowRight className="size-3 shrink-0 text-kopi" aria-hidden />
              <span className="truncate">{memory.next_step}</span>
            </span>
          )}
        </span>
      </Link>
      <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-1.5 pl-9 sm:pl-0">
        {started ? (
          loading && !status ? (
            <Skeleton className="h-6 w-28 rounded-full" />
          ) : (
            <>
              <span className="inline-flex h-6 items-center rounded-full bg-kopi-soft px-2.5 text-[12px] font-book text-kopi">{stageLabel(memory?.stage)}</span>
              {status && status.drafts > 0 && (
                <span className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2.5 text-[12px] font-book text-foreground/70">
                  <FileText className="size-3.5" aria-hidden /> {status.drafts} {status.drafts === 1 ? "document" : "documents"}
                </span>
              )}
            </>
          )
        ) : (
          <Link href={bidHref(bid.doc_no, true)} className={cn(buttonVariants({ size: "sm" }))}>
            <Play /> Start
          </Link>
        )}
        <Countdown closing={bid.closing} now={now} />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Stop bidding on ${bid.doc_no}`}
          title="Stop bidding"
          className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
}

function Group({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card">
      <h2 id={id} className="flex h-12 items-center gap-2 px-5 text-[14px] font-medium tracking-[-0.01em]">
        {label}
        <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      <ul className="flex flex-col px-2 pb-2">{children}</ul>
    </section>
  );
}

export function BidsView() {
  const { bids, dropBid, restoreBid } = useBids();
  const stop = (bid: Bid) => {
    dropBid(bid.doc_no);
    toast({ title: "Stopped bidding", description: shortTitle(bid.title), icon: Briefcase, action: { label: "Undo", onClick: () => restoreBid(bid) } });
  };
  const { profile } = useKopi();
  const now = useNow();
  const byDeadline = [...bids].sort((a, b) => new Date(a.closing).getTime() - new Date(b.closing).getTime());
  const open = byDeadline.filter((b) => new Date(b.closing).getTime() > now);
  const closed = byDeadline.filter((b) => new Date(b.closing).getTime() <= now);
  return (
    <>
      <PageHeader
        title="Bids"
        description={`The tenders ${profile.name} is bidding for. Kopi works each one: a plan, the drafts, a memory of what matters, and the submission checklist. You submit on GeBIZ.`}
        actions={
          bids.length > 0 && (
            <Link href="/search" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <Search /> Find tenders
            </Link>
          )
        }
      />
      {bids.length === 0 ? (
        <EmptyState icon={Briefcase} title="No bids yet">
          <div className="flex flex-col items-start gap-4">
            <p>
              Find a tender and choose <span className="font-medium text-foreground">Start bid</span>. Kopi qualifies it, plans it back from the
              closing date and drafts the documents, and the bid lands here.
            </p>
            <Link href="/search" className={cn(buttonVariants())}>
              <Search /> Find tenders
            </Link>
          </div>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          {open.length > 0 && (
            <Group id="open-bids" label="Open" count={open.length}>
              {open.map((b) => (
                <BidRow key={b.doc_no} bid={b} now={now} onRemove={() => stop(b)} />
              ))}
            </Group>
          )}
          {closed.length > 0 && (
            <Group id="closed-bids" label="Closed" count={closed.length}>
              {closed.map((b) => (
                <BidRow key={b.doc_no} bid={b} now={now} onRemove={() => stop(b)} />
              ))}
            </Group>
          )}
        </div>
      )}
    </>
  );
}
