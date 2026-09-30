"use client";

import { CircleHelp, Menu, Search, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";

import { useCommand } from "@/components/command/command-provider";
import { useKopi } from "@/components/kopi-provider";
import { AccessGate } from "@/components/shell/access-gate";
import { currentItem, Nav } from "@/components/shell/nav";
import { ProfileSwitcher } from "@/components/shell/profile-switcher";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isMac } from "@/lib/shortcuts";

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
                ? "grid size-7 place-items-center rounded-full border border-black/[0.07] bg-card text-sidebar-foreground transition-colors hover:bg-sidebar-hover"
                : "grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
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

/** The sidebar's search: the command palette, which searches tenders, bids, licences and pages at once. */
function SearchButton({ onOpen }: { onOpen?: () => void }) {
  const { openPalette } = useCommand();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => {
              onOpen?.();
              openPalette();
            }}
            aria-label="Search or jump to (⌘K)"
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
          />
        }
      >
        <Search className="size-4" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Search
        <span className="flex gap-0.5">
          <Kbd className="bg-background/15 text-background">{isMac() ? "⌘" : "Ctrl"}</Kbd>
          <Kbd className="bg-background/15 text-background">K</Kbd>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { openShortcuts } = useCommand();
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center gap-1 pr-1">
        <div className="min-w-0 flex-1 overflow-hidden">
          <ProfileSwitcher />
        </div>
        <SearchButton onOpen={onNavigate} />
        <IconLink href="/copilot/?new=1" label="New chat with Kopi" round onNavigate={onNavigate}>
          <SquarePen className="size-3.5" aria-hidden />
        </IconLink>
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:none]">
        <Nav onNavigate={onNavigate} />
      </div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <SourceNote />
        </div>
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openShortcuts();
          }}
          aria-label="Keyboard shortcuts (?)"
          title="Keyboard shortcuts (?)"
          className="grid size-7 shrink-0 place-items-center rounded-full border border-black/[0.07] bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <CircleHelp className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** The top bar's default: the section the page belongs to, until the page names itself. */
function SectionTitle() {
  const item = currentItem(usePathname());
  const Icon = item.icon;
  return (
    <span className="flex items-center gap-2 text-[13.5px] font-medium group-has-[[data-page-title]]/topbar:hidden">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      {item.label}
    </span>
  );
}

/** On a phone the sidebar is behind the menu, so the palette gets its own button in the top bar. */
function MobileSearch() {
  const { openPalette } = useCommand();
  return (
    <button
      type="button"
      onClick={() => openPalette()}
      aria-label="Search or jump to"
      className="-mr-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted lg:hidden"
    >
      <Search className="size-4" aria-hidden />
    </button>
  );
}

/** Pages that lay out their own panes edge to edge (the bid workspace), instead of a centred column. */
const BLEED = /^\/bid\/?$/;

export function AppShell({ children }: { children: React.ReactNode }) {
  const bleed = BLEED.test(usePathname());
  const [menuOpen, setMenuOpen] = useState(false);
  const [title, setTitle] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);

  return (
    <AccessGate>
      <div className="flex h-dvh bg-frame">
        <aside className="hidden w-[16.5rem] shrink-0 px-2 pt-2.5 pb-3 lg:block">
          <Sidebar />
        </aside>

        <div className="flex min-w-0 flex-1 lg:py-2 lg:pr-2">
          <div
            ref={setScroller}
            id="kopi-panel"
            className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-background [scrollbar-gutter:stable] lg:rounded-2xl lg:border lg:border-black/[0.06]"
          >
            <header className="group/topbar sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur-md sm:px-5">
              <button
                type="button"
                className="-ml-1 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted lg:hidden"
                aria-label="Open menu"
                onClick={() => setMenuOpen(true)}
              >
                <Menu className="size-4.5" aria-hidden />
              </button>
              <SectionTitle />
              <div ref={setTitle} className="flex min-w-0 items-center" />
              <div ref={setActions} className="ml-auto flex shrink-0 items-center gap-2" />
              <MobileSearch />
            </header>
            <PanelContext.Provider value={{ title, actions, scroller }}>
              <main className={bleed ? "flex min-h-0 w-full flex-1 flex-col" : "mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:px-8 sm:pt-8"}>{children}</main>
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
