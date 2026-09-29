"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Submissions became Bids: old links land on the new page. */
export function MovedToBids() {
  const router = useRouter();
  useEffect(() => router.replace("/bids/"), [router]);
  return null;
}
