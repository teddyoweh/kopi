import { Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { ComingNext } from "@/components/coming-next";

export const metadata: Metadata = { title: "Copilot" };

export default function Page() {
  return (
    <ComingNext
      title="Copilot"
      description="Ask Kopi to find tenders, check eligibility and draft the documents of a bid."
      icon={Sparkles}
      what="A Claude agent with Kopi's own tools: it searches tenders, checks your registrations and licences, and drafts clarification questions, compliance matrices and cover letters you can download."
    />
  );
}
