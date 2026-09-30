import { cn } from "cn";

/**
 * A key cap: soft, borderless, small enough to sit beside a 13px label. The weight is written
 * font-[450] because cn reads font-book as a font family and would drop font-sans for it.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-md bg-muted px-1 font-sans text-[11px] leading-none font-[450] text-muted-foreground select-none",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
