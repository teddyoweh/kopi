"use client";

import { Briefcase, Building2, ChevronDown, FileBadge, Home, Inbox, Layers, Plus, Search, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { StageRing } from "@/components/bid/stage-stepper";
import { useNow } from "@/components/bid/time";
import { useBidStatuses } from "@/lib/bid-status";
import { bidHref, useBids } from "@/lib/bids";
import { daysUntil } from "@/lib/format";
import { useInbox } from "@/lib/inbox";
import { shortTitle } from "@/lib/short-title";
import { cn } from "@/lib/utils";
import { useViewCounts, useViews, viewHref } from "@/lib/views";

type Item = { href: string; label: string; icon: LucideIcon };

/** Grouped like Linear's sidebar: the daily four on top, then named sections that fold. */
export const NAV: { section: string | null; items: Item[] }[] = [
  {
    section: null,
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/", label: "Home", icon: Home },
      { href: "/copilot", label: "Copilot", icon: Sparkles },
      { href: "/bids", label: "Bids", icon: Briefcase },
    ],
  },
  {
    section: "Explore",
    items: [
      { href: "/search", label: "Search", icon: Search },
      { href: "/licences", label: "Licences", icon: FileBadge },
    ],
  },
  { section: "Company", items: [{ href: "/profile", label: "Profile", icon: Building2 }] },
];

/** With trailingSlash exports every path ends in "/"; compare without it. */
export function isActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  if (href === "/") return path === "/" || path === "/tender";
  if (href === "/bids") return path === "/bids" || path === "/submissions";
  return path === href || path.startsWith(`${href}/`);
}

/** The page's section, for the top bar: the nav item whose route is showing. */
export function currentItem(pathname: string): Item {
  const items = NAV.flatMap((group) => group.items);
  if (/^\/bid\/?$/.test(pathname)) return items.find((item) => item.href === "/bids")!;
  return items.find((item) => isActive(pathname, item.href)) ?? items[1]!;
}

const LINK = "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-book text-sidebar-foreground transition-colors hover:bg-sidebar-hover";
const ACTIVE = "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent";

function NavLink({ item, active, count, countLabel, onNavigate }: { item: Item; active: boolean; count?: number; countLabel?: string; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(LINK, active && ACTIVE)}>
      <Icon className={cn("size-4 shrink-0", active ? "text-foreground/80" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count ? (
        <span className="text-xs text-muted-foreground tabular-nums" aria-label={countLabel}>
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-px">
      <div className="group/section flex h-7 items-center pr-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex h-7 w-fit items-center gap-1 rounded-md px-2.5 text-[12.5px] font-book text-muted-foreground transition-colors hover:text-foreground"
        >
          {title}
          <ChevronDown className={cn("size-3 transition-transform", !open && "-rotate-90")} aria-hidden />
        </button>
        {action && <span className="ml-auto opacity-0 transition-opacity group-hover/section:opacity-100 focus-within:opacity-100 max-lg:opacity-100">{action}</span>}
      </div>
      {open && children}
    </div>
  );
}

/** "23d", "Today", in red inside two days: how long a bid has left, in the width of a count. */
function DaysLeft({ closing, now }: { closing: string; now: number }) {
  const days = daysUntil(closing, now);
  const label = days <= 0 ? "Today" : `${days}d`;
  return <span className={cn("text-xs tabular-nums", days <= 2 ? "text-unmet" : "text-muted-foreground")}>{label}</span>;
}

/** The open bids, soonest deadline first, each with its stage: the sidebar's "Your teams". */
function YourBids({ pathname, doc, onNavigate }: { pathname: string; doc: string | null; onNavigate?: () => void }) {
  const { bids } = useBids();
  const now = useNow(60_000);
  const open = bids.filter((b) => new Date(b.closing).getTime() > now).sort((a, b) => a.closing.localeCompare(b.closing));
  const { statuses } = useBidStatuses(open.map((b) => b.session_id));
  if (!open.length) return null;
  return (
    <Section title="Your bids">
      {open.map((bid) => {
        const active = /^\/bid\/?$/.test(pathname) && doc === bid.doc_no;
        const stage = bid.session_id ? statuses.get(bid.session_id)?.memory.stage : null;
        return (
          <Link
            key={bid.doc_no}
            href={bidHref(bid.doc_no)}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={shortTitle(bid.title)}
            className={cn(LINK, active && ACTIVE)}
          >
            <StageRing stage={stage} started={!!bid.session_id} className="mx-px" />
            <span className="min-w-0 flex-1 truncate">{shortTitle(bid.title)}</span>
            <DaysLeft closing={bid.closing} now={now} />
          </Link>
        );
      })}
    </Section>
  );
}

/** Saved searches, each with how many notices arrived since it was last opened. */
function Views({ viewId, onNavigate }: { viewId: string | null; onNavigate?: () => void }) {
  const { views } = useViews();
  const counts = useViewCounts(views);
  return (
    <Section
      title="Views"
      action={
        <Link href="/search" onClick={onNavigate} aria-label="New view: search, then save it" title="New view" className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-sidebar-hover hover:text-foreground">
          <Plus className="size-3.5" aria-hidden />
        </Link>
      }
    >
      {views.map((view) => {
        const active = viewId === view.id;
        const fresh = counts.get(view.id) ?? 0;
        return (
          <Link key={view.id} href={viewHref(view)} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(LINK, active && ACTIVE)}>
            <Layers className={cn("size-4 shrink-0", active ? "text-foreground/80" : "text-muted-foreground")} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{view.name}</span>
            {fresh > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${fresh} new since you last looked`}>
                {fresh}
              </span>
            )}
          </Link>
        );
      })}
      {!views.length && (
        <Link href="/search" onClick={onNavigate} className={cn(LINK, "text-muted-foreground")}>
          <Plus className="size-4 shrink-0" aria-hidden />
          Save a search
        </Link>
      )}
    </Section>
  );
}

function Links({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { bids } = useBids();
  const { unread } = useInbox();
  const viewId = /^\/search\/?$/.test(pathname) ? params.get("view") : null;
  const counts: Record<string, { count: number; label: string }> = {
    "/inbox": { count: unread, label: `${unread} unread` },
    "/bids": { count: bids.length, label: `${bids.length} bids` },
  };
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV.map(({ section, items }) => {
        const links = items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href) && !(item.href === "/search" && viewId)}
            count={counts[item.href]?.count}
            countLabel={counts[item.href]?.label}
            onNavigate={onNavigate}
          />
        ));
        if (section) {
          return (
            <Section key={section} title={section}>
              {links}
            </Section>
          );
        }
        return (
          <div key="top" className="flex flex-col gap-5">
            <div className="flex flex-col gap-px">{links}</div>
            <YourBids pathname={pathname} doc={params.get("doc")} onNavigate={onNavigate} />
            <Views viewId={viewId} onNavigate={onNavigate} />
          </div>
        );
      })}
    </nav>
  );
}

/** The sidebar reads the query string (which bid, which view), so a static export renders it inside Suspense. */
export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense>
      <Links onNavigate={onNavigate} />
    </Suspense>
  );
}
