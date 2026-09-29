import { Search } from "lucide-react";
import type { Metadata } from "next";

import { ComingNext } from "@/components/coming-next";

export const metadata: Metadata = { title: "Search" };

export default function Page() {
  return (
    <ComingNext
      title="Search"
      description="Every open GeBIZ opportunity, searchable by meaning."
      icon={Search}
      what="Search by what you do, not the words a notice happens to use, and filter by agency, category, method and closing date."
    />
  );
}
