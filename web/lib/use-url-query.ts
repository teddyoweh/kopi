"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/** How long typing pauses before the query is searched and written to the URL. */
export const DEBOUNCE_MS = 250;

export type UrlUpdate = (changes: Record<string, string | null>) => void;

/**
 * This page's query string, and a way to change it without a navigation. It writes with
 * history.replaceState, which Next's router picks up (useSearchParams re-renders), so
 * typing never waits on the router and never piles up history entries.
 */
export function useUrlParams(): [URLSearchParams, UrlUpdate] {
  const params = useSearchParams();
  const pathname = usePathname();
  const update = useCallback<UrlUpdate>(
    (changes) => {
      // Read the live URL, not `params`: two updates in one tick must not undo each other.
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const text = next.toString();
      window.history.replaceState(null, "", text ? `${pathname}?${text}` : pathname);
    },
    [pathname],
  );
  return [params, update];
}

/**
 * A text box bound to `?q=`. `text` follows every keystroke; the URL (and so the search)
 * follows `DEBOUNCE_MS` after typing stops. `commit` writes at once (an example query).
 * If the URL changes under the box (the sidebar's Search link), the box follows it.
 */
export function useQueryText(urlQuery: string, update: UrlUpdate) {
  const [text, setText] = useState(urlQuery);
  const [written, setWritten] = useState(urlQuery);
  const [seen, setSeen] = useState(urlQuery);

  if (urlQuery !== seen) {
    setSeen(urlQuery);
    if (urlQuery !== written) {
      setWritten(urlQuery);
      setText(urlQuery);
    }
  }

  useEffect(() => {
    const next = text.trim();
    if (next === written) return;
    const timer = setTimeout(() => {
      setWritten(next);
      update({ q: next || null });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, written, update]);

  const commit = useCallback(
    (value: string) => {
      const next = value.trim();
      setText(value);
      setWritten(next);
      update({ q: next || null });
    },
    [update],
  );

  return { text, setText, commit };
}
