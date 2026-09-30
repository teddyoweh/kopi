"use client";

import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Toasts from anywhere: `toast("Link copied")` needs no hook or context, so a callback that
 * finishes after its component unmounted can still say so. The store is module state, and
 * `<Toaster />` (mounted once, in the root layout) draws it.
 */
export type ToastInput = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: { label: string; href?: string; onClick?: () => void };
  duration?: number;
};

type Toast = ToastInput & { id: string; leaving: boolean };

const DURATION = 4500;
const EXIT_MS = 150;
const MAX_SHOWN = 3;
const NONE: Toast[] = [];

let toasts: Toast[] = NONE;
let nextId = 0;
const listeners = new Set<() => void>();

function set(next: Toast[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

export function toast(input: ToastInput | string): string {
  const id = `toast-${++nextId}`;
  set([...toasts, { ...(typeof input === "string" ? { title: input } : input), id, leaving: false }]);
  const shown = toasts.filter((t) => !t.leaving);
  shown.slice(0, Math.max(0, shown.length - MAX_SHOWN)).forEach((t) => dismissToast(t.id));
  return id;
}

export function dismissToast(id: string): void {
  if (!toasts.some((t) => t.id === id && !t.leaving)) return;
  set(toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
  setTimeout(() => set(toasts.filter((t) => t.id !== id)), EXIT_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function ToastItem({ toast: t, paused, onHover }: { toast: Toast; paused: boolean; onHover: (id: string | null) => void }) {
  const remaining = useRef(t.duration ?? DURATION);
  // The clock runs only while nothing holds it: time spent hovered is given back.
  useEffect(() => {
    if (paused || t.leaving) return;
    const started = Date.now();
    const timer = setTimeout(() => dismissToast(t.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, t.leaving, t.id]);

  const Icon = t.icon;
  const action = t.action;
  const actionClass = "shrink-0 rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-foreground/[0.08]";
  const onAction = () => {
    action?.onClick?.();
    dismissToast(t.id);
  };
  return (
    <div
      onMouseEnter={() => onHover(t.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-xl border bg-popover py-3 pr-3 pl-3.5 text-[13px] text-popover-foreground shadow-float",
        t.leaving ? "animate-out fade-out slide-out-to-bottom-2 fill-mode-forwards" : "animate-in fade-in slide-in-from-bottom-2 duration-200",
      )}
    >
      {Icon && <Icon className={cn("size-4 shrink-0 text-muted-foreground", t.description && "mt-px self-start")} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-book break-words">{t.title}</p>
        {t.description && <p className="text-[12.5px] break-words text-muted-foreground">{t.description}</p>}
      </div>
      {action &&
        (action.href ? (
          <Link href={action.href} onClick={onAction} className={actionClass}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={onAction} className={actionClass}>
            {action.label}
          </button>
        ))}
    </div>
  );
}

/** Bottom right on a desktop, across the bottom on a phone; newest nearest the edge. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => NONE);
  // Hovering any toast holds them all. A toast removed under the pointer never sends mouseleave,
  // so the hold lasts only while the hovered toast is still there.
  const [hovered, setHovered] = useState<string | null>(null);
  const paused = list.some((t) => t.id === hovered && !t.leaving);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[360px]"
    >
      {list.map((t) => (
        <ToastItem key={t.id} toast={t} paused={paused} onHover={setHovered} />
      ))}
    </div>
  );
}
