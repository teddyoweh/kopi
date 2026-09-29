import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";

import { ComingNext } from "@/components/coming-next";

export const metadata: Metadata = { title: "Submissions" };

export default function Page() {
  return (
    <ComingNext
      title="Submissions"
      description="The tenders you are pursuing, and what each still needs before it closes."
      icon={ClipboardCheck}
      what="A checklist per tender built from the notice itself (items to respond, envelopes, validity, closing time), tracked to the deadline. You submit on GeBIZ; Kopi gets you ready."
    />
  );
}
