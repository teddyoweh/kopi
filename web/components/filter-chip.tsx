"use client";

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ChipOption = { value: string; label: string; count?: number };

const ANY = "__any__";

/**
 * One filter as a chip: its name while unset, its value (tinted) once set. Opens a menu of
 * options with an "any" choice at the top that clears it.
 */
export function FilterChip({
  label,
  anyLabel,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  anyLabel: string;
  value: string | null;
  options: ChipOption[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const selected = value ? (options.find((o) => o.value === value)?.label ?? value) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={selected ? `${label}: ${selected}. Change` : `Filter by ${label.toLowerCase()}`}
        className={cn(
          "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border pr-2.5 pl-3.5 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50",
          selected ? "border-kopi/25 bg-kopi-soft font-book text-kopi" : "bg-card text-foreground/85 hover:bg-muted",
        )}
      >
        <span className="truncate">{selected ?? label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-auto max-w-[calc(100vw-2rem)] min-w-56 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value ?? ANY} onValueChange={(next: string) => onChange(next === ANY ? null : next)}>
            <DropdownMenuRadioItem value={ANY} className="py-1.5">
              {anyLabel}
            </DropdownMenuRadioItem>
            {options.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value} className="gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{option.count}</span>}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
