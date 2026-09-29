"use client";

import { Building2, ClipboardCheck, FileBadge, LayoutGrid, Search, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/search", label: "Search", icon: Search },
  { href: "/licences", label: "Licences", icon: FileBadge },
  { href: "/copilot", label: "Copilot", icon: Sparkles },
  { href: "/submissions", label: "Submissions", icon: ClipboardCheck },
  { href: "/profile", label: "Profile", icon: Building2 },
];

/** With trailingSlash exports every path ends in "/"; compare without it. */
function isActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  if (href === "/") return path === "/" || path === "/tender";
  return path === href || path.startsWith(`${href}/`);
}

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              active && "bg-sidebar-accent font-medium text-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-kopi")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
