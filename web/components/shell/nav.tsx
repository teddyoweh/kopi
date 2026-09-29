"use client";

import { Building2, ChevronDown, ClipboardCheck, FileBadge, LayoutGrid, Search, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useTracked } from "@/lib/submissions";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };

/** Grouped like Linear's sidebar: the daily three on top, then named sections that fold. */
export const NAV: { section: string | null; items: Item[] }[] = [
  {
    section: null,
    items: [
      { href: "/", label: "Overview", icon: LayoutGrid },
      { href: "/copilot", label: "Copilot", icon: Sparkles },
      { href: "/submissions", label: "Submissions", icon: ClipboardCheck },
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
  return path === href || path.startsWith(`${href}/`);
}

/** The page's section, for the top bar: the nav item whose route is showing. */
export function currentItem(pathname: string): Item {
  const items = NAV.flatMap((group) => group.items);
  return items.find((item) => isActive(pathname, item.href)) ?? items[0]!;
}

function NavLink({ item, active, count, onNavigate }: { item: Item; active: boolean; count?: number; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-hover",
        active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count ? (
        <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${count} tracked`}>
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-px">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-7 w-fit items-center gap-1 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {title}
        <ChevronDown className={cn("size-3 transition-transform", !open && "-rotate-90")} aria-hidden />
      </button>
      {open && children}
    </div>
  );
}

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { tracked } = useTracked();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV.map(({ section, items }) => {
        const links = items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            count={item.href === "/submissions" ? tracked.length : undefined}
            onNavigate={onNavigate}
          />
        ));
        return section ? (
          <Section key={section} title={section}>
            {links}
          </Section>
        ) : (
          <div key="top" className="flex flex-col gap-px">
            {links}
          </div>
        );
      })}
    </nav>
  );
}
