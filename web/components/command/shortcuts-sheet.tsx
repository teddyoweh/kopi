"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Fragment } from "react";

import { CommandDialog } from "@/components/command/surface";
import { Kbd } from "@/components/ui/kbd";
import { keyLabel, SHORTCUTS, type Shortcut, type ShortcutGroup } from "@/lib/shortcuts";

/** A shortcut's caps: pressed together, or one after the other for a chord. */
export function Keys({ shortcut }: { shortcut: Shortcut }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {shortcut.keys.map((key, i) => (
        <Fragment key={key}>
          {shortcut.chord && i > 0 && <span className="text-[11px] text-muted-foreground">then</span>}
          <Kbd>{keyLabel(key)}</Kbd>
        </Fragment>
      ))}
    </span>
  );
}

function Group({ title }: { title: ShortcutGroup }) {
  return (
    <section className="flex flex-col">
      <h3 className="pb-1 text-[12px] text-muted-foreground">{title}</h3>
      <ul className="flex flex-col">
        {SHORTCUTS.filter((s) => s.group === title).map((shortcut) => (
          <li key={shortcut.label} className="flex h-8 items-center justify-between gap-4 text-[13px]">
            <span className="min-w-0 truncate font-book">{shortcut.label}</span>
            <Keys shortcut={shortcut} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Every shortcut in lib/shortcuts.ts, opened with `?`. */
export function ShortcutsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <CommandDialog
      name="shortcuts"
      open={open}
      onOpenChange={onOpenChange}
      className="top-1/2 max-h-[calc(100dvh-16px)] w-[min(520px,calc(100vw-16px))] -translate-y-1/2 gap-4 overflow-y-auto p-5"
    >
      <div className="flex items-center justify-between gap-4">
        <Dialog.Title className="text-[15px] font-medium tracking-[-0.01em]">Keyboard shortcuts</Dialog.Title>
        <Dialog.Close aria-label="Close" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          <Kbd>esc</Kbd>
        </Dialog.Close>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Group title="General" />
          <Group title="Search results" />
        </div>
        <div className="flex flex-col gap-5">
          <Group title="Go to" />
          <Group title="Inbox" />
        </div>
      </div>
    </CommandDialog>
  );
}
