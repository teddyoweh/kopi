import { FileBadge } from "lucide-react";
import type { Metadata } from "next";

import { ComingNext } from "@/components/coming-next";

export const metadata: Metadata = { title: "Licences" };

export default function Page() {
  return (
    <ComingNext
      title="Licences"
      description="The permits, licences and registrations a tender can ask for."
      icon={FileBadge}
      what="Find the licence an activity needs: the issuing agency, fee, processing time and what it depends on, from GoBusiness, GRA and BCA."
    />
  );
}
