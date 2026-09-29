"use client";

import { Menu, Search, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";

import { useKopi } from "@/components/kopi-provider";
import { AccessGate } from "@/components/shell/access-gate";
import { currentItem, Nav } from "@/components/shell/nav";
import { ProfileSwitcher } from "@/components/shell/profile-switcher";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Where a page puts its title and actions (the panel's top bar), and the element that scrolls
 * (the panel, not the window). PageHeader portals into the first two; anything that follows the
 * scroll position, like the copilot's stick-to-bottom, should read `scroller`.
 */
type Panel = { title: HTMLElement | null; actions: HTMLElement | null; scroller: HTMLElement | null };
const PanelContext = createContext<Panel>({ title: null, actions: null, scroller: null });
export const usePanel = () => useContext(PanelContext);

function SourceNote() {
  const { api } = useKopi();
  return (
    <p className="px-2 text-xs leading-relaxed text-muted-foreground">
      {api?.mode === "mock" ? <>Demo data: synthetic notices in GeBIZ&apos;s format.</> : <>Open opportunities from GeBIZ, past awards from data.gov.sg.</>}
    </p>
  );
}

function IconLink({ href, label, round, children, onNavigate }: { href: string; label: string; round?: boolean; children: React.ReactNode; onNavigate?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            onClick={onNavigate}
            aria-label={label}
            className={
              round
                ? "grid size-7 place-items-center rounded-full border bg-card text-sidebar-foreground transition-colors hover:bg-sidebar-hover"
                : "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
            }
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center gap-1 pr-1">
        <div className="min-w-0 flex-1">
          <ProfileSwitcher />
        </div>
        <IconLink href="/search" label="Search" onNavigate={onNavigate}>
          <Search className="size-4" aria-hidden />
        </IconLink>
        <IconLink href="/copilot" label="New chat with Kopi" round onNavigate={onNavigate}>
          <SquarePen className="size-3.5" aria-hidden />
        </IconLink>
      </div>
      <Nav onNavigate={onNavigate} />
      <div className="mt-auto">
        <SourceNote />
      </div>
    </div>
  );
}

/** The top bar's default: the section the page belongs to, until the page names itself. */
function SectionTitle() {
  const item = currentItem(usePathname());
  const Icon = item.icon;
  return (
    <span className="flex items-center gap-2 text-[14px] font-medium group-has-[[data-page-title]]/topbar:hidden">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      {item.label}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [title, setTitle] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);

  return (
    <AccessGate>
      <div className="flex h-dvh bg-frame">
        <aside className="hidden w-60 shrink-0 px-2 pt-2.5 pb-3 lg:block">
          <Sidebar />
        </aside>

        <div className="flex min-w-0 flex-1 lg:py-2 lg:pr-2">
          <div
            ref={setScroller}
            id="kopi-panel"
            className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-background [scrollbar-gutter:stable] lg:rounded-xl lg:border"
          >
            <header className="group/topbar sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-5">
              <button
                type="button"
                className="-ml-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
                aria-label="Open menu"
                onClick={() => setMenuOpen(true)}
              >
                <Menu className="size-4.5" aria-hidden />
              </button>
              <SectionTitle />
              <div ref={setTitle} className="flex min-w-0 items-center" />
              <div ref={setActions} className="ml-auto flex shrink-0 items-center gap-2" />
            </header>
            <PanelContext.Provider value={{ title, actions, scroller }}>
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:px-8 sm:pt-8">{children}</main>
            </PanelContext.Provider>
          </div>
        </div>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" showCloseButton={false} className="w-72 border-none bg-frame px-2 pt-3 pb-4">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </AccessGate>
  );
}
