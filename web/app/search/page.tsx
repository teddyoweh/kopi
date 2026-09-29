import type { Metadata } from "next";
import { Suspense } from "react";

import { RowsSkeleton } from "@/components/states";
import { SearchView } from "@/components/search-view";

export const metadata: Metadata = { title: "Search" };

export default function Page() {
  return (
    <Suspense fallback={<RowsSkeleton rows={6} />}>
      <SearchView />
    </Suspense>
  );
}
