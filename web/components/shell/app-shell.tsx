"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { useKopi } from "@/components/kopi-provider";
import { AccessGate } from "@/components/shell/access-gate";
import { Nav } from "@/components/shell/nav";
import { ProfileSwitcher } from "@/components/shell/profile-switcher";
import { Wordmark } from "@/components/shell/wordmark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

function SourceNote() {
  const { api } = useKopi();
  return (
    <p className="px-3 text-xs leading-relaxed text-muted-foreground">
      {api?.mode === "mock" ? (
        <>Demo data: synthetic notices in GeBIZ&apos;s format.</>
      ) : (
        <>Open opportunities from GeBIZ, past awards from data.gov.sg.</>
      )}
    </p>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <AccessGate>
      <div className="flex min-h-dvh">
        <div className="hidden w-60 shrink-0 bg-sidebar lg:block">
          <aside className="sticky top-0 flex h-dvh flex-col gap-8 px-3 py-5">
            <div className="px-3">
              <Wordmark />
            </div>
            <Nav />
            <div className="mt-auto">
              <SourceNote />
            </div>
          </aside>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-8">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <Menu />
            </Button>
            <div className="lg:hidden">
              <Wordmark />
            </div>
            <div className="ml-auto">
              <ProfileSwitcher />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-6">{children}</main>
        </div>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-72 gap-8 border-none bg-sidebar px-3 py-5">
            <SheetTitle className="px-3">
              <Wordmark />
            </SheetTitle>
            <Nav onNavigate={() => setMenuOpen(false)} />
            <div className="mt-auto">
              <SourceNote />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </AccessGate>
  );
}
