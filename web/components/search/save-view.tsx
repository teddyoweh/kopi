"use client";

import { Popover } from "@base-ui/react/popover";
import { Layers, Trash2 } from "lucide-react";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { suggestName, useViews, type SearchQuery, type View } from "@/lib/views";
import { cn } from "@/lib/utils";

const POPUP =
  "z-50 flex w-72 origin-(--transform-origin) flex-col gap-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-float outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95";

/**
 * Pin the search on screen to the sidebar as a view, or take a saved one out. A view keeps
 * the words and filters, and the sidebar counts what is published after each visit.
 */
export function SaveView({ query, onSaved, onRemoved }: { query: SearchQuery; onSaved?: (view: View) => void; onRemoved?: (view: View, index: number) => void }) {
  const { views, find, save, drop } = useViews();
  const saved = find(query);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (saved) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "max-w-56")}>
          <Layers className="text-kopi" />
          <span className="truncate">{saved.name}</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
            <Popover.Popup className={POPUP}>
              <p className="text-[13px] leading-snug text-muted-foreground">
                This search is saved as <span className="font-medium text-foreground">{saved.name}</span>. It stays in the sidebar with a count of what is new.
              </p>
              <button
                type="button"
                onClick={() => {
                  const index = views.findIndex((v) => v.id === saved.id);
                  drop(saved.id);
                  setOpen(false);
                  onRemoved?.(saved, index);
                }}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
              >
                <Trash2 /> Remove view
              </button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setName(suggestName(query));
        setOpen(next);
      }}
    >
      <Popover.Trigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <Layers /> Save view
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
          <Popover.Popup className={POPUP}>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const view = save(name, query);
                setOpen(false);
                onSaved?.(view);
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] text-muted-foreground">Name this view</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  className="h-9 rounded-md border bg-card px-3 text-[13.5px] outline-none focus-visible:border-kopi/40 focus-visible:ring-3 focus-visible:ring-kopi/15"
                />
              </label>
              <p className="text-[12px] leading-snug text-muted-foreground">It goes in the sidebar, with a count of the notices published since you last opened it.</p>
              <button type="submit" className={cn(buttonVariants({ size: "sm" }), "self-end")}>
                Save view
              </button>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
