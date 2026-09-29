"use client";

import { FileText, FolderOpen, Loader2, Paperclip, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { DownloadButton } from "@/components/draft-preview";
import { buttonVariants } from "@/components/ui/button";
import { UPLOAD_LIMIT, UPLOAD_TYPES } from "@/lib/api";
import { fileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "Bid plan" from "GVT000ETT26000101-bid-plan.md": the draft's kind, read as words. */
export function draftKind(file: string, doc: string): string {
  const words = file.replace(/\.md$/, "").replace(`${doc}-`, "").replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : file;
}

/** The order a bid team reads its documents in. */
const ORDER = ["bid plan", "clarification questions", "compliance matrix", "checklist", "proposal outline"];
const rank = (kind: string) => {
  const i = ORDER.indexOf(kind.toLowerCase());
  return i === -1 ? ORDER.length : i;
};

export type ShelfRow = { name: string; kind: "draft" | "upload"; size?: number; saving?: boolean };

function problem(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!(UPLOAD_TYPES as readonly string[]).includes(ext)) return `${file.name}: Kopi reads ${UPLOAD_TYPES.join(", ")} files.`;
  if (file.size > UPLOAD_LIMIT) return `${file.name} is over 8 MB.`;
  if (!file.size) return `${file.name} is empty.`;
  return null;
}

/** The bid's shelf: the documents Kopi wrote, and the tender documents the person added for it to read. */
export function DocumentsCard({
  doc,
  rows,
  sessionId,
  onOpen,
  onUpload,
}: {
  doc: string;
  rows: ShelfRow[];
  sessionId: string | null;
  onOpen: (name: string) => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const drafts = rows.filter((r) => r.kind === "draft").sort((a, b) => rank(draftKind(a.name, doc)) - rank(draftKind(b.name, doc)));
  const uploads = rows.filter((r) => r.kind === "upload");

  async function add(files: FileList | null) {
    const list = [...(files ?? [])];
    const refused = list.map(problem).filter((p): p is string => p !== null);
    setErrors(refused);
    for (const file of list.filter((f) => !problem(f))) {
      setUploading(file.name);
      try {
        await onUpload(file);
      } catch (e) {
        setErrors((current) => [...current, `${file.name}: ${e instanceof Error ? e.message : "the upload failed"}`]);
      }
    }
    setUploading(null);
    if (input.current) input.current.value = "";
  }

  return (
    <section aria-labelledby="bid-documents" className="flex flex-col rounded-xl border bg-card">
      <div className="flex flex-col gap-0.5 px-4 pt-3.5 pb-2">
        <h2 id="bid-documents" className="flex items-center gap-2 text-[14px] font-medium tracking-[-0.01em]">
          <FolderOpen className="size-4 text-kopi" aria-hidden />
          Documents
          {rows.length > 0 && <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{rows.length}</span>}
        </h2>
        <p className="text-[12.5px] leading-snug text-muted-foreground">What Kopi drafted for this bid, and the tender documents you add for it to read.</p>
      </div>
      <ul className="flex flex-col px-2">
        {drafts.map((row) => (
          <li key={row.name} className="flex items-center gap-0.5 rounded-lg pr-1 transition-colors hover:bg-muted/70">
            <button type="button" onClick={() => onOpen(row.name)} disabled={row.saving} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-left disabled:cursor-default">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-kopi-soft" aria-hidden>
                <FileText className="size-3.5 text-kopi" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-book">{draftKind(row.name, doc)}</span>
                <span className="truncate text-[11.5px] text-muted-foreground">{row.saving ? "Saving when Kopi finishes" : [row.name, row.size !== undefined && fileSize(row.size)].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
            {!row.saving && sessionId && <DownloadButton sessionId={sessionId} name={row.name} size="icon-sm" variant="ghost" />}
          </li>
        ))}
        {uploads.map((row) => (
          <li key={row.name} className="flex items-center gap-2.5 rounded-lg py-2 pr-1 pl-2 transition-colors hover:bg-muted/70">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted" aria-hidden>
              <Paperclip className="size-3.5 text-foreground/70" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-book">{row.name}</span>
              <span className="truncate text-[11.5px] text-muted-foreground">Tender document{row.size !== undefined && ` · ${fileSize(row.size)}`}</span>
            </span>
            {sessionId && <DownloadButton sessionId={sessionId} name={row.name} size="icon-sm" variant="ghost" />}
          </li>
        ))}
        {!rows.length && <li className="px-2 py-1.5 text-[12.5px] text-muted-foreground">{sessionId ? "Nothing yet." : "Kopi drafts the bid's documents when the bid starts."}</li>}
      </ul>
      <div className="flex flex-col gap-1.5 px-3 pt-1.5 pb-3">
        <input ref={input} type="file" accept={UPLOAD_TYPES.join(",")} multiple className="sr-only" onChange={(e) => void add(e.target.files)} tabIndex={-1} aria-hidden />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={!sessionId || uploading !== null}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
          title={sessionId ? "PDF, Markdown, text or CSV, up to 8 MB each" : "Start the bid first"}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {uploading ? `Adding ${uploading}` : "Add tender documents"}
        </button>
        <p className="px-1 text-[11.5px] leading-snug text-muted-foreground">Downloaded from GeBIZ: specifications, forms, the price schedule. Kopi reads them on its next turn.</p>
        {errors.map((e) => (
          <p key={e} className="px-1 text-[12px] text-unmet">
            {e}
          </p>
        ))}
      </div>
    </section>
  );
}
