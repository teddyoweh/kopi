"use client";

import { useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "ready"; data: T; error?: undefined }
  | { status: "error"; data?: undefined; error: Error };

type Settled<T> = { deps: unknown[]; state: AsyncState<T> };

const LOADING = { status: "loading" } as const;

function sameDeps(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

/**
 * Run `load` whenever `deps` change. A result is only shown while it belongs to the
 * current deps, so a slow answer for an old query never replaces a newer one.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  useEffect(() => {
    let current = true;
    load().then(
      (data) => current && setSettled({ deps, state: { status: "ready", data } }),
      (error: unknown) =>
        current && setSettled({ deps, state: { status: "error", error: error instanceof Error ? error : new Error(String(error)) } }),
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the inputs of `load` as deps
  }, deps);
  return settled && sameDeps(settled.deps, deps) ? settled.state : LOADING;
}
