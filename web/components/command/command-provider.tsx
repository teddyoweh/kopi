"use client";

import { useRouter } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { Palette } from "@/components/command/palette";
import { ShortcutsSheet } from "@/components/command/shortcuts-sheet";
import { useKopi } from "@/components/kopi-provider";
import { CHORD_MS, shortcutFor, startsChord } from "@/lib/shortcuts";

type Command = { openPalette: (query?: string) => void; openShortcuts: () => void };

const Context = createContext<Command | null>(null);

/** Keys typed into a field belong to the field. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** A dialog or menu that is not ours has the keyboard. */
function othersOpen(): boolean {
  return document.querySelector('[role="dialog"]:not([data-kopi-command]), [role="alertdialog"], [role="menu"]') !== null;
}

/**
 * The palette (⌘K), the shortcuts sheet (?) and the global keys from lib/shortcuts.ts. Mounted
 * once in the root layout, around the shell; anything inside can open them with useCommand().
 */
export function CommandProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session } = useKopi();
  const [palette, setPalette] = useState({ open: false, query: "" });
  const [sheet, setSheet] = useState(false);

  const openPalette = useCallback((query = "") => {
    setSheet(false);
    setPalette({ open: true, query });
  }, []);

  const openShortcuts = useCallback(() => {
    setPalette((p) => ({ ...p, open: false }));
    setSheet(true);
  }, []);

  const ready = session === "signed-in";

  useEffect(() => {
    if (!ready) return;
    let chord: { key: string; until: number } | null = null;
    function onKey(event: KeyboardEvent) {
      if (event.isComposing || event.repeat) return;
      const waiting = chord && Date.now() < chord.until ? chord.key : null;
      chord = null;
      const hit = shortcutFor(event, waiting);
      const mod = hit?.keys[0] === "mod";
      if ((!mod && typing(event.target)) || othersOpen()) return;
      // While the palette is open its input owns the keys; only ⌘K (to close it) gets through.
      if (!mod && document.querySelector('[data-kopi-command="palette"]')) return;
      if (!hit) {
        if (!event.metaKey && !event.ctrlKey && !event.altKey && startsChord(event)) chord = { key: event.key, until: Date.now() + CHORD_MS };
        return;
      }
      // Capture phase, so the search page's j/k/b listener never also sees a chord's second key.
      event.preventDefault();
      event.stopPropagation();
      if (hit.command === "palette") {
        setSheet(false);
        setPalette((p) => (mod && p.open ? { ...p, open: false } : { open: true, query: "" }));
      } else if (hit.command === "shortcuts") {
        setPalette((p) => ({ ...p, open: false }));
        setSheet((open) => !open);
      } else if (hit.href) {
        setSheet(false);
        router.push(hit.href);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ready, router]);

  const value = useMemo(() => ({ openPalette, openShortcuts }), [openPalette, openShortcuts]);

  return (
    <Context.Provider value={value}>
      {children}
      {/* The palette reads the URL's ?doc=, which a statically exported page only knows in the browser. */}
      <Suspense fallback={null}>
        <Palette
          open={palette.open}
          query={palette.query}
          onOpenChange={(open) => setPalette((p) => ({ ...p, open }))}
          onShortcuts={openShortcuts}
        />
      </Suspense>
      <ShortcutsSheet open={sheet} onOpenChange={setSheet} />
    </Context.Provider>
  );
}

export function useCommand(): Command {
  const context = useContext(Context);
  if (!context) throw new Error("useCommand must be used inside <CommandProvider>");
  return context;
}
