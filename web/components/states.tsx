import { AlertCircle, type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5 px-3 py-3.5">
          <Skeleton className="h-3.5 w-3/4 rounded-full" />
          <Skeleton className="h-3 w-1/2 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl bg-unmet-soft px-4 py-3.5 text-[13px]">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-unmet" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-book">Something went wrong loading this.</p>
        <p className="break-words text-muted-foreground">{error.message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 rounded-full px-2.5 py-0.5 font-book text-foreground hover:bg-background">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3.5 rounded-xl border bg-card px-6 py-7">
      <span className="grid size-9 place-items-center rounded-full bg-kopi-soft">
        <Icon className="size-4 text-kopi" aria-hidden />
      </span>
      <div className="flex max-w-lg flex-col gap-1">
        <p className="text-[15px] font-medium tracking-[-0.01em]">{title}</p>
        {children && <div className="text-[13.5px] leading-relaxed text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
