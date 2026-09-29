"use client";

import { ArrowUp, Brain, Loader2, Sparkles, User, X } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { BidMemory, MemoryNote } from "@/lib/api";
import { cn } from "@/lib/utils";

function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function Note({ note, onForget }: { note: MemoryNote; onForget: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const kopi = note.source === "kopi";
  const Icon = kopi ? Sparkles : User;
  return (
    <li className="group/note flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/70">
      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", kopi ? "bg-kopi-soft text-kopi" : "bg-muted text-foreground/70")} aria-hidden>
        <Icon className="size-3" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] leading-snug break-words">{note.text}</span>
        <span className="text-[11.5px] text-muted-foreground">
          {kopi ? "Kopi" : "You"} · {ago(note.created)}
        </span>
      </span>
      <button
        type="button"
        onClick={async () => {
          setBusy(true);
          await onForget().finally(() => setBusy(false));
        }}
        disabled={busy}
        aria-label={`Forget: ${note.text}`}
        className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/note:opacity-100 hover:bg-card hover:text-foreground focus-visible:opacity-100 disabled:opacity-100"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
      </button>
    </li>
  );
}

/**
 * The bid memory: what Kopi keeps about this bid and what the person tells it. It lives on the
 * API, outside the sandbox, and every turn reads it, so it survives the copilot restarting.
 */
export function MemoryCard({
  memory,
  loading,
  disabled,
  onAdd,
  onForget,
}: {
  memory: BidMemory | null;
  loading: boolean;
  /** No session yet: there is nowhere to keep a note until the bid starts. */
  disabled: boolean;
  onAdd: (text: string) => Promise<void>;
  onForget: (id: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notes = memory?.notes ?? [];

  async function add() {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd(value);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="bid-memory" className="flex flex-col rounded-xl border bg-card">
      <div className="flex flex-col gap-0.5 px-4 pt-3.5 pb-2">
        <h2 id="bid-memory" className="flex items-center gap-2 text-[14px] font-medium tracking-[-0.01em]">
          <Brain className="size-4 text-kopi" aria-hidden />
          Bid memory
          {notes.length > 0 && <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{notes.length}</span>}
        </h2>
        <p className="text-[12.5px] leading-snug text-muted-foreground">What Kopi keeps about this bid, and what you tell it. Every turn reads it.</p>
      </div>
      <div className="px-2 pb-2">
        {loading && !memory ? (
          <div className="flex flex-col gap-2 px-2 py-2" aria-label="Loading">
            <Skeleton className="h-3.5 w-4/5 rounded-full" />
            <Skeleton className="h-3.5 w-3/5 rounded-full" />
          </div>
        ) : notes.length ? (
          <ul className="flex flex-col">
            {notes.map((note) => (
              <Note key={note.id} note={note} onForget={() => onForget(note.id)} />
            ))}
          </ul>
        ) : (
          <p className="px-2 py-1.5 text-[12.5px] text-muted-foreground">{disabled ? "Kopi starts the memory when the bid starts." : "Nothing yet."}</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="mt-1.5 flex items-center gap-1.5 rounded-full border bg-card py-1 pr-1 pl-3.5 focus-within:border-kopi/40 focus-within:ring-3 focus-within:ring-kopi/10"
        >
          <label htmlFor="memory-note" className="sr-only">
            Add a note for Kopi
          </label>
          <input
            id="memory-note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            disabled={disabled}
            placeholder={disabled ? "Start the bid first" : "Tell Kopi something about this bid"}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim() || saving}
            aria-label="Save the note"
            className="grid size-7 shrink-0 place-items-center rounded-full bg-kopi text-white transition-colors disabled:bg-muted disabled:text-muted-foreground/70"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ArrowUp className="size-3.5" strokeWidth={2.25} aria-hidden />}
          </button>
        </form>
        {error && <p className="px-2 pt-1.5 text-[12px] text-unmet">{error}</p>}
      </div>
    </section>
  );
}
