import type { Metadata } from "next";
import { Suspense } from "react";

import { LicencesView } from "@/components/licences-view";
import { RowsSkeleton } from "@/components/states";

export const metadata: Metadata = { title: "Licences" };

export default function Page() {
  return (
    <Suspense fallback={<RowsSkeleton rows={6} />}>
      <LicencesView />
    </Suspense>
  );
}
