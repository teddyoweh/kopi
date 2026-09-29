import type { Metadata } from "next";

import { BidsView } from "@/components/bid/bids-view";

export const metadata: Metadata = { title: "Bids" };

export default function Page() {
  return <BidsView />;
}
