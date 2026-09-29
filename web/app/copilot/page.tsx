import type { Metadata } from "next";
import { Suspense } from "react";

import { CopilotView } from "@/components/copilot/copilot-view";
import { RowsSkeleton } from "@/components/states";

export const metadata: Metadata = { title: "Copilot" };

export default function Page() {
  return (
    <Suspense fallback={<RowsSkeleton rows={3} />}>
      <CopilotView />
    </Suspense>
  );
}
