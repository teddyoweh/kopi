import type { Metadata } from "next";
import { Suspense } from "react";

import { BidView } from "@/components/bid/bid-view";

export const metadata: Metadata = { title: "Bid" };

export default function Page() {
  return (
    <Suspense>
      <BidView />
    </Suspense>
  );
}
