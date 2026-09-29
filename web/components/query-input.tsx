"use client";

import { Loader2, Search, X } from "lucide-react";

import { MAX_QUERY } from "@/lib/api";

/** The big search box: an icon, the text, a spinner while results are on their way, and a clear button. */
export function QueryInput({
  value,
  onChange,
  onClear,
  busy,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  busy?: boolean;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && onClear()}
        maxLength={MAX_QUERY}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-12 w-full rounded-xl bg-secondary pr-20 pl-11 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-kopi/40 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Searching" />}
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
