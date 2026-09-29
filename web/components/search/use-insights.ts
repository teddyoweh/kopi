"use client";

import { useEffect, useState } from "react";

import type { KopiApi, Profile, TenderInsight } from "@/lib/api";

/** The API's batch size for insights. */
const BATCH = 25;

/** Insights depend on the whole profile and the query; an edited profile is a new read. */
function scope(profile: Profile, q: string): string {
  const text = JSON.stringify(profile) + q;
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  return `${profile.id}.${(hash >>> 0).toString(36)}`;
}

/** Shared across renders and pages, so going back to a search does not refetch its cards. */
const cache = new Map<string, TenderInsight | "failed">();

export type Insights = {
  /** The insight for a tender, `undefined` while it loads, or "failed" if its batch failed. */
  get(doc: string): TenderInsight | "failed" | undefined;
};

/**
 * Eligibility, snippet and price band for the cards on screen, fetched after the hits render,
 * 25 at a time. A failed batch marks its cards "failed" so they drop the skeleton, not the card.
 */
export function useInsights(api: KopiApi | null, docs: string[], profile: Profile, q: string): Insights {
  const key = scope(profile, q);
  const [, setVersion] = useState(0);
  const wanted = docs.join(",");

  useEffect(() => {
    if (!api || !wanted) return;
    const missing = wanted.split(",").filter((doc) => !cache.has(`${key}/${doc}`));
    let live = true;
    for (let start = 0; start < missing.length; start += BATCH) {
      const batch = missing.slice(start, start + BATCH);
      api
        .insights(batch, profile, q || undefined)
        .then((found) => {
          const byDoc = new Map(found.map((insight) => [insight.doc_no, insight]));
          for (const doc of batch) cache.set(`${key}/${doc}`, byDoc.get(doc) ?? "failed");
        })
        .catch(() => batch.forEach((doc) => cache.set(`${key}/${doc}`, "failed")))
        .finally(() => live && setVersion((v) => v + 1));
    }
    return () => {
      live = false;
    };
    // `profile` and `q` are folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, wanted, key]);

  return { get: (doc) => cache.get(`${key}/${doc}`) };
}
