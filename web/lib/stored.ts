"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * JSON values in localStorage (or sessionStorage) that components subscribe to. Every write
 * goes through `writeStored`, so each component showing a key re-renders, and other tabs
 * follow through the `storage` event. The server snapshot is the fallback, so a prerendered
 * page never reads storage.
 */
export type Area = "local" | "session";

const listeners = new Set<() => void>();
const parsed = new Map<string, { raw: string | null; value: unknown }>();

function storage(area: Area): Storage {
  return area === "local" ? localStorage : sessionStorage;
}

/** The stored value, parsed once per distinct raw string so snapshots stay referentially stable. */
export function readStored<T>(key: string, fallback: T, area: Area = "local"): T {
  if (typeof window === "undefined") return fallback;
  const raw = storage(area).getItem(key);
  const id = `${area}:${key}`;
  const cached = parsed.get(id);
  if (cached && cached.raw === raw) return cached.value as T;
  let value: T = fallback;
  try {
    if (raw !== null) value = JSON.parse(raw) as T;
  } catch {
    value = fallback;
  }
  parsed.set(id, { raw, value });
  return value;
}

export function writeStored<T>(key: string, value: T, area: Area = "local"): void {
  try {
    storage(area).setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled: the change lives until the tab closes.
  }
  listeners.forEach((listener) => listener());
}

export function updateStored<T>(key: string, fallback: T, update: (current: T) => T, area: Area = "local"): void {
  writeStored(key, update(readStored(key, fallback, area)), area);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** A stored value and an updater. `fallback` must be a stable (module-level) value. */
export function useStored<T>(key: string, fallback: T, area: Area = "local"): [T, (update: (current: T) => T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readStored(key, fallback, area),
    () => fallback,
  );
  const update = useCallback((fn: (current: T) => T) => updateStored(key, fallback, fn, area), [key, fallback, area]);
  return [value, update];
}
