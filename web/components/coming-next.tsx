import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";

/** A section whose screen is built in a later milestone: says what it will do, not "coming soon". */
export function ComingNext({ title, description, icon, what }: { title: string; description: string; icon: LucideIcon; what: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState icon={icon} title="This part of Kopi is being built">
        {what}
      </EmptyState>
    </>
  );
}
