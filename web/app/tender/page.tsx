import type { Metadata } from "next";
import { Suspense } from "react";

import { RowsSkeleton } from "@/components/states";
import { TenderView } from "@/components/tender-view";

export const metadata: Metadata = { title: "Tender" };

export default function Page() {
  return (
    <Suspense fallback={<RowsSkeleton rows={4} />}>
      <TenderView />
    </Suspense>
  );
}
