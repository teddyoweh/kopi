"use client";

import { Dialog } from "@base-ui/react/dialog";
import { cn } from "cn";
import { useRef } from "react";

/**
 * The floating surface the palette and the shortcuts sheet share. `data-kopi-command` names it,
 * so the global key handler can tell ours from dialogs other pages open.
 */
export function CommandDialog({
  name,
  open,
  onOpenChange,
  className,
  initialFocus,
  children,
}: {
  name: "palette" | "shortcuts";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  initialFocus?: Dialog.Popup.Props["initialFocus"];
  children: React.ReactNode;
}) {
  // Without an input to focus, the popup itself takes focus, so no button opens wearing a ring.
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/10 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          ref={popup}
          data-kopi-command={name}
          initialFocus={initialFocus ?? popup}
          className={cn(
            "fixed inset-x-0 z-50 mx-auto flex flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-float outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
