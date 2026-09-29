import { AlertCircle, type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 border-b px-3 py-3.5 last:border-b-0">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-unmet/20 bg-unmet-soft px-4 py-3.5 text-sm">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-unmet" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-medium">Something went wrong loading this.</p>
        <p className="break-words text-muted-foreground">{error.message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 rounded-md px-2 py-0.5 font-medium text-foreground hover:bg-background">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border bg-card px-6 py-7">
      <span className="grid size-8 place-items-center rounded-md border bg-background">
        <Icon className="size-4 text-kopi" aria-hidden />
      </span>
      <div className="flex max-w-lg flex-col gap-1">
        <p className="text-[14px] font-medium">{title}</p>
        {children && <div className="text-sm text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
