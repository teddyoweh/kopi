"use client";

import { Check, Copy, Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";

import { useApi } from "@/components/kopi-provider";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ApiError, type KopiApi } from "@/lib/api";
import { useAsync } from "@/lib/use-async";

export type DraftRefLike = { session_id: string; file: string; title?: string };

/**
 * Save a draft as a .md file. The download routes need the bearer token, so a plain link
 * cannot fetch them; the text is fetched and handed to the browser as a blob.
 */
export async function downloadDraft(api: KopiApi, sessionId: string, name: string, text?: string) {
  const body = text ?? (await api.sessionFile(sessionId, name));
  const url = URL.createObjectURL(new Blob([body], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name.endsWith(".md") ? name : `${name}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A download button that shows its own progress and failure. */
export function DownloadButton({
  sessionId,
  name,
  text,
  label = "Download .md",
  size = "sm",
  variant = "outline",
}: {
  sessionId: string;
  name: string;
  text?: string;
  label?: string;
  size?: "sm" | "icon-sm";
  variant?: "outline" | "ghost";
}) {
  const api = useApi();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  async function run() {
    if (!api) return;
    setState("busy");
    try {
      await downloadDraft(api, sessionId, name, text);
      setState("idle");
    } catch {
      setState("failed");
    }
  }
  const icon = state === "busy" ? <Loader2 className="animate-spin" /> : <Download />;
  if (size === "icon-sm") {
    return (
      <Button variant={variant} size="icon-sm" onClick={run} disabled={!api || state === "busy"} aria-label={`Download ${name}`} title={state === "failed" ? "Download failed; try again" : `Download ${name}`}>
        {icon}
      </Button>
    );
  }
  return (
    <Button variant={variant} size="sm" onClick={run} disabled={!api || state === "busy"}>
      {icon}
      {state === "failed" ? "Try the download again" : label}
    </Button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function PreviewBody({ draft }: { draft: DraftRefLike }) {
  const api = useApi();
  const state = useAsync(async () => (api ? api.sessionFile(draft.session_id, draft.file) : null), [api, draft.session_id, draft.file]);
  const text = state.data ?? undefined;
  return (
    <>
      <div className="flex flex-col gap-3 border-b px-5 pt-4 pb-3.5 pr-12 sm:px-8">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
          <FileText className="size-3.5 shrink-0 text-kopi" aria-hidden />
          <span className="truncate">{draft.file}</span>
        </div>
        {/* The draft's own first heading is its visible title. */}
        <SheetTitle className="sr-only">{draft.title || draft.file}</SheetTitle>
        <SheetDescription className="sr-only">A draft Kopi wrote, as markdown.</SheetDescription>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadButton sessionId={draft.session_id} name={draft.file} text={text} />
          {text && <CopyButton text={text} />}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-10 sm:px-8">
        {state.status === "loading" && (
          <div className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground" aria-busy="true">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Opening the draft
          </div>
        )}
        {state.status === "error" && (
          <div className="rounded-lg border bg-card px-4 py-3.5 text-[13px]">
            <p className="font-medium">This draft can&apos;t be opened.</p>
            <p className="text-muted-foreground">
              {state.error instanceof ApiError && state.error.status === 404
                ? "Kopi no longer has it; drafts are kept with their conversation for a limited time."
                : "Kopi didn't answer. Try again in a moment."}
            </p>
          </div>
        )}
        {text !== undefined && <Markdown text={text} className="text-[15px] leading-[1.6]" />}
      </div>
    </>
  );
}

/** A draft, read in a side panel: rendered markdown, with download and copy. */
export function DraftPreview({ draft, onClose }: { draft: DraftRefLike | null; onClose: () => void }) {
  return (
    <Sheet open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 border-l p-0 shadow-float data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {draft && <PreviewBody key={`${draft.session_id}/${draft.file}`} draft={draft} />}
      </SheetContent>
    </Sheet>
  );
}
