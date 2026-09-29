"use client";

import { ArrowUpRight, Briefcase, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useKopi } from "@/components/kopi-provider";
import { copilotHref } from "@/components/tender-ai";
import { tenderHref } from "@/components/tender-row";
import { buttonVariants } from "@/components/ui/button";
import type { NoticeSummary } from "@/lib/api";
import { bidHref, useBids } from "@/lib/bids";
import { cn } from "@/lib/utils";

/** Start the bid (or go back to it), which opens the bid workspace with Kopi working it. */
export function useStartBid() {
  const router = useRouter();
  const { profile } = useKopi();
  const { bidFor, startBid } = useBids();
  return {
    started: (doc: string) => bidFor(doc) !== null,
    start: (notice: NoticeSummary) => router.push(bidFor(notice.doc_no) ? bidHref(notice.doc_no) : startBid(notice, profile.id)),
  };
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * The three things to do with a tender. On cards they are compact, and Start bid is filled
 * only on the selected card, so a page of results is not a wall of indigo.
 */
export function TenderActions({ notice, compact = false, emphasis = true }: { notice: NoticeSummary; compact?: boolean; emphasis?: boolean }) {
  const bids = useStartBid();
  const started = bids.started(notice.doc_no);
  const size = compact ? "sm" : "default";
  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={stop}>
      <button type="button" onClick={() => bids.start(notice)} className={cn(buttonVariants({ size, variant: emphasis ? "default" : "outline" }), "shrink-0")}>
        <Briefcase className={emphasis ? undefined : "text-kopi"} /> {started ? "Open bid" : "Start bid"}
      </button>
      <Link href={copilotHref(notice.doc_no)} className={cn(buttonVariants({ variant: "outline", size }), "shrink-0")}>
        <Sparkles className="text-kopi" /> Ask Kopi
      </Link>
      <Link href={tenderHref(notice.doc_no)} className={cn(buttonVariants({ variant: "ghost", size }), "shrink-0 text-muted-foreground")}>
        Open <ArrowUpRight />
      </Link>
    </div>
  );
}
