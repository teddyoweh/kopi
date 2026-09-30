"use client";

import { ArrowRight, Briefcase, Search } from "lucide-react";
import Link from "next/link";

import { StageRing, stageLabel } from "@/components/bid/stage-stepper";
import { Countdown, useNow } from "@/components/bid/time";
import { DeadlineStrip } from "@/components/home/deadline-strip";
import { GetStarted } from "@/components/home/get-started";
import { useApi } from "@/components/kopi-provider";
import { allOpen, BestMatches, Newest, Stats } from "@/components/overview";
import { PageHeader } from "@/components/page-header";
import { ROW } from "@/components/tender-row";
import { buttonVariants } from "@/components/ui/button";
import type { KopiApi } from "@/lib/api";
import { useBidStatuses } from "@/lib/bid-status";
import { bidHref, useBids, type Bid } from "@/lib/bids";
import { isToday, longToday } from "@/lib/format";
import { useInbox } from "@/lib/inbox";
import { shortTitle } from "@/lib/short-title";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";

/** Morning, afternoon or evening where the person is reading. */
function greeting(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-SG")} ${n === 1 ? one : many}`;
}

/** The first line of Home: the day, then what needs the person and what arrived, each a way in. */
function Greeting({ api, open, now }: { api: KopiApi; open: Bid[]; now: number }) {
  const { unread, loading } = useInbox();
  const market = useAsync(() => allOpen(api), [api]);
  const today = market.data?.filter((n) => isToday(n.published, now)).length;
  const parts: { text: string; href?: string; strong?: boolean; wide?: boolean }[] = [];
  if (!loading) parts.push({ href: "/inbox", text: unread ? `${plural(unread, "thing")} in your Inbox` : "Nothing in your Inbox", strong: unread > 0 });
  parts.push({ href: "/bids", text: open.length ? plural(open.length, "open bid") : "No bids yet" });
  if (today !== undefined) parts.push({ text: today ? `${plural(today, "notice")} published on GeBIZ today` : "Nothing new on GeBIZ yet today", wide: true });
  return (
    <div className="flex flex-col gap-2 pb-2">
      <p className="text-[13px] text-muted-foreground">{longToday(new Date(now))}</p>
      <h2 className="text-[26px] leading-tight font-medium tracking-[-0.025em]">{greeting(new Date(now).getHours())}</h2>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] text-muted-foreground">
        {parts.map((part, i) => (
          <span key={part.text} className={cn("items-center gap-1.5", part.wide ? "hidden sm:flex" : "flex")}>
            {i > 0 && <span aria-hidden>·</span>}
            {part.href ? (
              <Link href={part.href} className={cn("underline-offset-4 transition-colors hover:text-foreground hover:underline", part.strong && "font-book text-foreground")}>
                {part.text}
              </Link>
            ) : (
              part.text
            )}
          </span>
        ))}
      </p>
    </div>
  );
}

function BidLine({ bid, stage, next, now }: { bid: Bid; stage: Parameters<typeof stageLabel>[0]; next: string | null; now: number }) {
  const started = !!bid.session_id;
  return (
    <Link href={bidHref(bid.doc_no)} className={cn(ROW, "flex items-center gap-3 px-3 py-3")}>
      <StageRing stage={stage} started={started} className="size-4" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14px] font-book tracking-[-0.005em]">{shortTitle(bid.title)}</span>
        <span className="truncate text-[12.5px] text-muted-foreground">
          {started ? stageLabel(stage) : "Not started"}
          {next && <span className="text-foreground/75"> · {next}</span>}
        </span>
      </span>
      <span className="hidden shrink-0 sm:block">
        <Countdown closing={bid.closing} now={now} />
      </span>
    </Link>
  );
}

/** The bids in progress, soonest deadline first: the half of Home that is the company's own work. */
function YourBids({ open, now }: { open: Bid[]; now: number }) {
  const { statuses } = useBidStatuses(open.map((b) => b.session_id));
  return (
    <section aria-labelledby="your-bids" className="flex h-full flex-col rounded-xl border bg-card">
      <div className="flex h-12 items-center gap-2 px-5">
        <h2 id="your-bids" className="text-[14px] font-medium tracking-[-0.01em]">
          Your bids
        </h2>
        {open.length > 0 && <span className="text-[13px] text-muted-foreground tabular-nums">{open.length}</span>}
        <Link
          href="/bids"
          className="-mr-2 ml-auto flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-book text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          All bids <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {open.length ? (
        <div className="flex flex-col px-2 pb-2">
          {open.slice(0, 5).map((bid) => {
            const memory = bid.session_id ? statuses.get(bid.session_id)?.memory : undefined;
            return <BidLine key={bid.doc_no} bid={bid} stage={memory?.stage} next={memory?.next_step ?? null} now={now} />;
          })}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 px-5 pt-2 pb-5">
          <span className="grid size-9 place-items-center rounded-full bg-kopi-soft">
            <Briefcase className="size-4 text-kopi" aria-hidden />
          </span>
          <p className="max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
            Pick a tender from your matches and choose <span className="font-medium text-foreground">Start bid</span>. Kopi qualifies it, plans it back from
            the closing date and drafts what you submit.
          </p>
          <Link href="/search" className={cn(buttonVariants({ size: "sm" }))}>
            <Search /> Find tenders
          </Link>
        </div>
      )}
    </section>
  );
}

export function HomeView() {
  const api = useApi();
  const { bids } = useBids();
  const now = useNow(60_000);
  const open = bids.filter((b) => new Date(b.closing).getTime() > now).sort((a, b) => a.closing.localeCompare(b.closing));
  return (
    <>
      <PageHeader title="Home" />
      {api && (
        <div className="flex flex-col gap-5">
          <Greeting api={api} open={open} now={now} />
          <GetStarted />
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <YourBids open={open} now={now} />
            </div>
            <div className="lg:col-span-2">
              <DeadlineStrip api={api} bids={open} now={now} />
            </div>
          </div>
          <Stats api={api} />
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <BestMatches api={api} />
            </div>
            <div className="lg:col-span-2">
              <Newest api={api} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
