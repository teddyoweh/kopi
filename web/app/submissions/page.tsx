import type { Metadata } from "next";

import { SubmissionsView } from "@/components/submissions-view";

export const metadata: Metadata = { title: "Submissions" };

export default function Page() {
  return <SubmissionsView />;
}
