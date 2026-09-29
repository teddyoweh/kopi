import { Building2 } from "lucide-react";
import type { Metadata } from "next";

import { ComingNext } from "@/components/coming-next";

export const metadata: Metadata = { title: "Profile" };

export default function Page() {
  return (
    <ComingNext
      title="Company profile"
      description="What your company does and which registrations and licences it holds."
      icon={Building2}
      what="Edit capabilities, past work, GRA supply heads, BCA workheads and licences held. Kopi reads every tender against this profile."
    />
  );
}
