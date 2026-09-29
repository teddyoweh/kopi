"use client";

import { Brain, Check, Copy, Download, FileText, ListChecks, Loader2, Paperclip, Upload } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ChecklistPane, useChecklist } from "@/components/bid/checklist-pane";
import { MemoryPane } from "@/components/bid/memory-pane";
import { downloadDraft } from "@/components/draft-preview";
import { useApi } from "@/components/kopi-provider";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UPLOAD_LIMIT, UPLOAD_TYPES, type BidMemory } from "@/lib/api";
import { fileSize } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";

export type Tab = { kind: "doc"; name: string } | { kind: "upload"; name: string } | { kind: "memory" } | { kind: "checklist" };

export type ShelfRow = { name: string; kind: "draft" | "upload"; size?: number };

export const sameTab = (a: Tab | null, b: Tab | null) =>
  !!a && !!b && a.kind === b.kind && ("name" in a ? a.name : "") === ("name" in b ? b.name : "");

/** "Bid plan" from "GVT000ETT26000101-bid-plan.md": the draft's kind, read as words. */
export function draftKind(file: string, doc: string): string {
  const words = file.replace(/\.md$/, "").replace(`${doc}-`, "").replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : file;
}

/** What a tab calls each document the playbook writes; the full name is in its tooltip. */
const SHORT: Record<string, string> = {
  "bid plan": "Plan",
  "clarification questions": "Questions",
  "compliance matrix": "Matrix",
  checklist: "Checklist",
  "proposal outline": "Outline",
  "cover letter": "Cover letter",
  "pricing notes": "Pricing",
  "risk register": "Risks",
};
const tabName = (file: string, doc: string) => {
  const kind = draftKind(file, doc);
  return SHORT[kind.toLowerCase()] ?? kind;
};

/** The order a bid team reads its documents in; anything else follows. */
const ORDER = ["bid plan", "clarification questions", "compliance matrix", "checklist", "proposal outline"];
export const rank = (kind: string) => {
  const i = ORDER.indexOf(kind.toLowerCase());
  return i === -1 ? ORDER.length : i;
};

function refusal(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!(UPLOAD_TYPES as readonly string[]).includes(ext)) return `${file.name}: Kopi reads ${UPLOAD_TYPES.join(", ")} files.`;
  if (file.size > UPLOAD_LIMIT) return `${file.name} is over 8 MB.`;
  if (!file.size) return `${file.name} is empty.`;
  return null;
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  busy,
  children,
  title,
  reveal,
}: {
  active: boolean;
  onClick: () => void;
  icon?: typeof FileText;
  busy?: boolean;
  children: React.ReactNode;
  title?: string;
  /** Changes when the panel is shown again (the phone's Documents toggle), so the open tab scrolls back into view. */
  reveal?: unknown;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // The open tab stays in view as Kopi moves through the documents.
  useLayoutEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, reveal]);
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-8 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-kopi/30",
        active ? "bg-muted font-medium text-foreground" : "font-book text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {busy ? <Loader2 className="size-3.5 shrink-0 animate-spin text-kopi" aria-label="Kopi is writing this" /> : Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </button>
  );
}

/** A draft, from what Kopi is writing right now or from the saved file. */
function DocView({ sessionId, name, version, live, writing }: { sessionId: string | null; name: string; version: number; live?: string; writing: boolean }) {
  const api = useApi();
  const saved = useAsync(async () => (api && sessionId && live === undefined ? api.sessionFile(sessionId, name) : null), [api, sessionId, name, version, live === undefined]);
  const text = live ?? saved.data ?? undefined;
  return (
    <article className="mx-auto flex w-full max-w-[46rem] flex-col gap-5 px-6 pt-7 pb-16 sm:px-10">
      {writing && (
        <p className="flex w-fit items-center gap-2 rounded-full bg-kopi-soft px-3 py-1 text-[12px] font-book text-kopi">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Kopi is writing this
        </p>
      )}
      {text !== undefined ? (
        <Markdown text={text} className="text-[14.5px] leading-[1.65]" />
      ) : saved.status === "error" ? (
        <p className="text-[13px] text-muted-foreground">This document can&apos;t be opened right now.</p>
      ) : (
        <div className="flex flex-col gap-3" aria-label="Loading">
          <Skeleton className="h-6 w-2/3 rounded-full" />
          <Skeleton className="h-3.5 w-full rounded-full" />
          <Skeleton className="h-3.5 w-5/6 rounded-full" />
          <Skeleton className="h-3.5 w-4/6 rounded-full" />
        </div>
      )}
    </article>
  );
}

/** A tender document the person added: PDFs render in place, text files as text. */
function UploadView({ sessionId, name, size }: { sessionId: string | null; name: string; size?: number }) {
  const api = useApi();
  const pdf = name.toLowerCase().endsWith(".pdf");
  const [url, setUrl] = useState<string | null>(null);
  const text = useAsync(async () => (api && sessionId && !pdf ? api.sessionFile(sessionId, name) : null), [api, sessionId, name, pdf]);
  useEffect(() => {
    if (!api || !sessionId || !pdf) return;
    let made: string | null = null;
    api
      .sessionBlob(sessionId, name)
      .then((blob) => {
        made = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setUrl(made);
      })
      .catch(() => setUrl(null));
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [api, sessionId, name, pdf]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="flex items-center gap-2 border-b border-border/70 px-6 py-2.5 text-[12.5px] text-muted-foreground sm:px-10">
        <Paperclip className="size-3.5" aria-hidden />
        A tender document you added{size !== undefined && ` · ${fileSize(size)}`}. Kopi reads it on every turn.
      </p>
      {pdf ? (
        url ? (
          <iframe src={url} title={name} className="min-h-0 w-full flex-1 border-0 bg-muted/40" />
        ) : (
          <div className="p-10">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )
      ) : (
        <article className="mx-auto w-full max-w-[46rem] px-6 pt-7 pb-16 sm:px-10">
          {name.endsWith(".md") ? (
            <Markdown text={text.data ?? ""} className="text-[14.5px] leading-[1.65]" linkDocs={false} />
          ) : (
            <pre className="font-sans text-[13.5px] leading-relaxed whitespace-pre-wrap">{text.data ?? ""}</pre>
          )}
        </article>
      )}
    </div>
  );
}

function EmptyPanel({ started }: { started: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-8 pt-24 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-kopi-soft">
        <FileText className="size-4.5 text-kopi" aria-hidden />
      </span>
      <p className="text-[15px] font-medium tracking-[-0.01em]">{started ? "Kopi is getting to the documents" : "The bid's documents open here"}</p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        As Kopi works the bid it writes a bid plan, clarification questions, a compliance matrix, a checklist and a proposal outline. Each one
        opens here as it is written. Add the tender documents from GeBIZ and Kopi reads them too.
      </p>
    </div>
  );
}

/**
 * The bid's artifacts, beside the conversation: each document Kopi writes, the tender documents
 * the person added, the bid memory and the submission checklist, one tab each.
 */
export function ArtifactPanel({
  doc,
  sessionId,
  rows,
  live,
  writing,
  versions,
  active,
  onSelect,
  memory,
  onAdd,
  onForget,
  onUpload,
  now,
  started,
  reveal,
}: {
  doc: string;
  sessionId: string | null;
  rows: ShelfRow[];
  live: Record<string, string>;
  writing: Set<string>;
  versions: Record<string, number>;
  active: Tab | null;
  onSelect: (tab: Tab) => void;
  memory: BidMemory | null;
  onAdd: (text: string) => Promise<void>;
  onForget: (id: string) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  now: number;
  started: boolean;
  reveal?: unknown;
}) {
  const api = useApi();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const checklist = useChecklist(doc);
  const drafts = rows.filter((r) => r.kind === "draft").sort((a, b) => rank(draftKind(a.name, doc)) - rank(draftKind(b.name, doc)));
  const uploads = rows.filter((r) => r.kind === "upload");
  const current = active?.kind === "doc" ? active.name : null;
  const text = current ? live[current] : undefined;

  async function add(files: FileList | null) {
    const list = [...(files ?? [])];
    setErrors(list.map(refusal).filter((p): p is string => p !== null));
    for (const file of list.filter((f) => !refusal(f))) {
      setUploading(file.name);
      try {
        await onUpload(file);
        onSelect({ kind: "upload", name: file.name });
      } catch (e) {
        setErrors((now) => [...now, `${file.name}: ${e instanceof Error ? e.message : "the upload failed"}`]);
      }
    }
    setUploading(null);
    if (input.current) input.current.value = "";
  }

  async function copy() {
    if (!api || !sessionId || !current) return;
    const body = text ?? (await api.sessionFile(sessionId, current).catch(() => ""));
    await navigator.clipboard.writeText(body).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section aria-label="Documents" className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
        <div role="tablist" aria-label="Bid documents" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {drafts.map((row) => (
            <TabButton
              key={row.name}
              active={sameTab(active, { kind: "doc", name: row.name })}
              onClick={() => onSelect({ kind: "doc", name: row.name })}
              busy={writing.has(row.name)}
              reveal={reveal}
              title={`${draftKind(row.name, doc)} · ${row.name}`}
            >
              {tabName(row.name, doc)}
            </TabButton>
          ))}
          {uploads.map((row) => (
            <TabButton key={row.name} active={sameTab(active, { kind: "upload", name: row.name })} onClick={() => onSelect({ kind: "upload", name: row.name })} icon={Paperclip} title={row.name}>
              {row.name}
            </TabButton>
          ))}
          {(drafts.length > 0 || uploads.length > 0) && <span className="mx-1.5 h-4 w-px shrink-0 bg-border" aria-hidden />}
          <TabButton active={active?.kind === "memory"} onClick={() => onSelect({ kind: "memory" })} icon={Brain}>
            Memory{memory?.notes.length ? ` ${memory.notes.length}` : ""}
          </TabButton>
          <TabButton active={active?.kind === "checklist"} onClick={() => onSelect({ kind: "checklist" })} icon={ListChecks}>
            Tasks{checklist.items.length ? ` ${checklist.done}/${checklist.items.length}` : ""}
          </TabButton>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {current && sessionId && !writing.has(current) && (
            <>
              <Button variant="ghost" size="icon-sm" onClick={() => void copy()} aria-label="Copy the document" title="Copy">
                {copied ? <Check /> : <Copy />}
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => api && void downloadDraft(api, sessionId, current, text)} aria-label="Download the document" title="Download .md">
                <Download />
              </Button>
            </>
          )}
          <input ref={input} type="file" accept={UPLOAD_TYPES.join(",")} multiple className="sr-only" onChange={(e) => void add(e.target.files)} tabIndex={-1} aria-hidden />
          <Button
            variant="outline"
            size="sm"
            onClick={() => input.current?.click()}
            disabled={!sessionId || uploading !== null}
            title={sessionId ? "PDF, Markdown, text or CSV, up to 8 MB each" : "Start the bid first"}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            <span className="hidden 2xl:inline">{uploading ? "Adding…" : "Add tender documents"}</span>
          </Button>
        </div>
      </div>
      {errors.length > 0 && (
        <div className="shrink-0 border-b border-border/70 px-4 py-2">
          {errors.map((e) => (
            <p key={e} className="text-[12px] text-unmet">
              {e}
            </p>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {active?.kind === "doc" ? (
          <DocView sessionId={sessionId} name={active.name} version={versions[active.name] ?? 0} live={live[active.name]} writing={writing.has(active.name)} />
        ) : active?.kind === "upload" ? (
          <UploadView sessionId={sessionId} name={active.name} size={uploads.find((u) => u.name === active.name)?.size} />
        ) : active?.kind === "memory" ? (
          <div className="mx-auto w-full max-w-[46rem] px-6 pt-7 pb-16 sm:px-10">
            <MemoryPane memory={memory} loading={!!sessionId && !memory} disabled={!sessionId} onAdd={onAdd} onForget={onForget} />
          </div>
        ) : active?.kind === "checklist" ? (
          <div className="mx-auto w-full max-w-[46rem] px-6 pt-7 pb-16 sm:px-10">
            <ChecklistPane checklist={checklist} now={now} />
          </div>
        ) : (
          <EmptyPanel started={started} />
        )}
      </div>
    </section>
  );
}
