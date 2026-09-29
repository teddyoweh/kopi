"use client";

import { ArrowUp, ClipboardCheck, FileBadge, FilePen, FileText, Layers, LayoutGrid, Plus, Square, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { AssistantTurn, UserMessage } from "@/components/copilot/turn";
import { DownloadButton, DraftPreview, type DraftRefLike } from "@/components/draft-preview";
import { useApi, useKopi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { usePanel } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { SessionFile } from "@/lib/api";
import { EMPTY, examples, problemOf, reducer, restored, type Conversation, type Example } from "@/lib/copilot";
import { fileSize } from "@/lib/format";
import { draftTender, recordDraft, useKnownTitle } from "@/lib/submissions";
import { displayTitle } from "@/lib/title-case";
import { useAsync } from "@/lib/use-async";
import { useUrlParams } from "@/lib/use-url-query";
import { cn } from "@/lib/utils";

/** The open conversation, kept for this tab so leaving the page (to read a tender it named) loses nothing. */
const CONVERSATION_KEY = "kopi.copilot";

function loadConversation(): Conversation {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CONVERSATION_KEY) ?? "null") as Conversation | null;
    return saved?.turns ? restored(saved) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function saveConversation(conversation: Conversation) {
  try {
    sessionStorage.setItem(CONVERSATION_KEY, JSON.stringify(conversation));
  } catch {
    // Storage full: the conversation still lives in the page.
  }
}

/** The starting conversation for this URL: `?ask=` always starts afresh; `?doc=` continues only its own tender's conversation. */
function initialConversation({ doc, ask }: { doc: string | null; ask: string | null }): Conversation {
  const saved = loadConversation();
  if (ask) return { ...EMPTY, doc };
  if (doc && saved.doc !== doc) return { ...EMPTY, doc };
  return saved;
}

const PART_ICON: Record<Example["part"], LucideIcon> = {
  Overview: LayoutGrid,
  "Permits and licences": FileBadge,
  Drafting: FilePen,
  Submissions: ClipboardCheck,
};

/**
 * The panel below its 52px top bar, less the page's top padding: the height the copilot fills so
 * the composer rests on the panel's floor. The panel is full-bleed below lg, and inset (8px each
 * side, a 1px border) from lg.
 */
const FILL = "min-h-[calc(100dvh-76px)] sm:min-h-[calc(100dvh-84px)] lg:min-h-[calc(100dvh-102px)]";

/** The width of the conversation and its composer, as in Linear Agent. */
const COLUMN = "mx-auto w-full max-w-[44rem]";

// ---------------------------------------------------------------- pieces

/** What the conversation is about, in the composer: the tender it was opened for, or every open tender. */
function ContextChip({ doc, onClear }: { doc: string | null; onClear: () => void }) {
  const api = useApi();
  const known = useKnownTitle(doc ?? "");
  const state = useAsync(async () => (api && doc && !known ? (await api.tender(doc)).notice.title : null), [api, doc, known]);
  const chip = "flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-card text-[13px]";
  if (!doc) {
    return (
      <span className={cn(chip, "px-3 text-muted-foreground")} title="Kopi searches every open GeBIZ tender">
        <Layers className="size-3.5 shrink-0" aria-hidden />
        All open tenders
      </span>
    );
  }
  const title = known ?? state.data;
  return (
    <span className={cn(chip, "pr-1 pl-3")}>
      <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <Link href={`/tender/?doc=${doc}`} className="flex min-w-0 items-center gap-1.5 hover:underline" title={title ?? doc}>
        <span className="sr-only">About </span>
        <span className="shrink-0 font-book tabular-nums">{doc}</span>
        {title && <span className="hidden max-w-[16rem] min-w-0 truncate text-muted-foreground sm:inline">{displayTitle(title)}</span>}
      </Link>
      <button
        type="button"
        onClick={onClear}
        aria-label="Remove the tender from this conversation"
        className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

function Examples({ doc, onAsk }: { doc: string | null; onAsk: (text: string) => void }) {
  const { profile } = useKopi();
  return (
    <section aria-labelledby="copilot-examples" className="flex flex-col gap-3 pt-7">
      <h2 id="copilot-examples" className="px-1 text-[13px] text-muted-foreground">
        Get started with some examples
      </h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        {examples(profile, doc).map((example) => {
          const Icon = PART_ICON[example.part];
          return (
            <li key={example.ask} className="flex">
              <button
                type="button"
                onClick={() => onAsk(example.ask)}
                title={example.ask}
                className="group flex w-full items-start gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none sm:flex-col sm:gap-8 sm:p-4"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted transition-colors group-hover:bg-kopi-soft">
                  <Icon className="size-3.5 text-muted-foreground transition-colors group-hover:text-kopi" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[14px] font-book">{example.title}</span>
                  <span className="text-[13px] leading-snug text-muted-foreground">{example.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Composer({
  busy,
  doc,
  roomy,
  onSend,
  onStop,
  onClearDoc,
}: {
  busy: boolean;
  doc: string | null;
  /** Two lines to start with on the empty page; one under a conversation. */
  roomy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onClearDoc: () => void;
}) {
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  function submit() {
    if (busy || !text.trim()) return;
    onSend(text);
    setText("");
    requestAnimationFrame(fit);
  }

  const round = "grid size-8 shrink-0 place-items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onClick={(e) => {
        // The whole card is the field, as in Linear: a click on its padding puts the cursor in the box.
        if (e.target === e.currentTarget) box.current?.focus();
      }}
      className="flex flex-col rounded-3xl border bg-card shadow-float transition-colors focus-within:border-foreground/15"
    >
      <label htmlFor="copilot-message" className="sr-only">
        Message Kopi
      </label>
      <textarea
        id="copilot-message"
        ref={box}
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          fit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={doc ? "Ask about this tender" : "Ask Kopi anything about a bid"}
        className={cn(
          "max-h-[220px] w-full resize-none bg-transparent px-5 pt-4 pb-1 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/80",
          roomy ? "min-h-[3.5rem]" : "min-h-10",
        )}
      />
      <div className="flex items-center gap-3 px-3 pt-1 pb-3">
        <div className="flex min-w-0 flex-1">
          <ContextChip doc={doc} onClear={onClearDoc} />
        </div>
        {busy ? (
          <button type="button" onClick={onStop} aria-label="Stop the answer" className={cn(round, "border bg-card text-foreground hover:bg-muted")}>
            <Square className="size-3 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className={cn(round, "bg-kopi text-white hover:bg-[color-mix(in_oklch,var(--kopi),black_8%)] disabled:bg-muted disabled:text-muted-foreground/70")}
          >
            <ArrowUp className="size-4" strokeWidth={2.25} aria-hidden />
          </button>
        )}
      </div>
    </form>
  );
}

function Footnote({ className }: { className?: string }) {
  return (
    <p className={cn("px-1 text-xs text-muted-foreground", className)}>
      Kopi prepares; you submit on GeBIZ. <span className="hidden sm:inline">Enter sends, Shift+Enter adds a line.</span>
    </p>
  );
}

type DraftRow = { name: string; title?: string; size?: number; saving: boolean };

function DraftsPanel({ rows, sessionId, onOpen }: { rows: DraftRow[]; sessionId: string | null; onOpen: (row: DraftRow) => void }) {
  return (
    <section aria-labelledby="drafts" className="flex flex-col rounded-xl border bg-card">
      <div className="flex flex-col gap-0.5 border-b border-border/70 px-4 py-3.5">
        <h2 id="drafts" className="flex items-center gap-2 text-[13px] font-medium">
          Drafts
          {rows.length > 0 && <span className="text-muted-foreground tabular-nums">{rows.length}</span>}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">Documents Kopi writes in this conversation, as markdown.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          None yet. Ask for clarification questions, a compliance matrix or a submission checklist.
        </p>
      ) : (
        <ul className="flex flex-col p-1.5">
          {rows.map((row) => (
            <li key={row.name} className="flex items-center gap-0.5 rounded-lg pr-1 transition-colors hover:bg-muted/70">
              <button
                type="button"
                onClick={() => onOpen(row)}
                disabled={row.saving || !sessionId}
                className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2.5 py-2 text-left disabled:cursor-default"
              >
                <FileText className="mt-0.5 size-3.5 shrink-0 text-kopi" aria-hidden />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="line-clamp-2 text-[13px] font-book">{row.title || row.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {row.saving ? "Saving when Kopi finishes" : [row.name, row.size !== undefined && fileSize(row.size)].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
              {!row.saving && sessionId && <DownloadButton sessionId={sessionId} name={row.name} size="icon-sm" variant="ghost" />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- page

export function CopilotView() {
  const api = useApi();
  const { profile, signOut } = useKopi();
  const { scroller } = usePanel();
  const [params, updateUrl] = useUrlParams();
  const urlDoc = params.get("doc");
  const urlAsk = params.get("ask");

  const [state, dispatch] = useReducer(reducer, { doc: urlDoc, ask: urlAsk }, initialConversation);
  const latest = useRef(state);
  const controller = useRef<AbortController | null>(null);
  const stick = useRef(true);
  const [files, setFiles] = useState<{ session: string | null; list: SessionFile[] }>({ session: null, list: [] });
  const [preview, setPreview] = useState<DraftRefLike | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);

  const busy = state.turns.some((t) => t.status === "streaming");

  useEffect(() => {
    latest.current = state;
  });

  const refreshFiles = useCallback(
    (session: string) => {
      api
        ?.sessionFiles(session)
        .then((list) => setFiles({ session, list }))
        .catch(() => undefined);
    },
    [api],
  );

  /** One turn. `base` is the conversation it continues, when that differs from the one on screen (a fresh `?ask=`). */
  const send = useCallback(
    async (text: string, base?: Conversation) => {
      const message = text.trim();
      if (!message || !api || controller.current) return;
      const conversation = base ?? latest.current;
      const turnId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const abort = new AbortController();
      controller.current = abort;
      stick.current = true;
      dispatch({ type: "start", turn: { id: turnId, ask: message, blocks: [], status: "streaming" } });
      let session = conversation.session_id;
      try {
        await api.chat(
          { message, session_id: conversation.session_id, profile, doc_no: conversation.doc },
          (event) => {
            session ??= event.session_id ?? null;
            dispatch({ type: "event", turnId, event });
            if (event.type === "file" && event.file && session) {
              const doc = draftTender(event.file, conversation.doc);
              if (doc) recordDraft(doc, session, event.file);
            }
          },
          abort.signal,
        );
        dispatch({ type: "end", turnId });
      } catch (error) {
        if (abort.signal.aborted) dispatch({ type: "stopped", turnId });
        else dispatch({ type: "problem", turnId, problem: problemOf(error) });
      } finally {
        if (controller.current === abort) controller.current = null;
        if (session) refreshFiles(session);
      }
    },
    [api, profile, refreshFiles],
  );

  const stop = useCallback(() => controller.current?.abort(), []);

  const newConversation = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    dispatch({ type: "reset", doc: null }); // the drafts list follows the session, so it empties too
    updateUrl({ doc: null, ask: null, new: null });
  }, [updateUrl]);

  // The sidebar's "new chat" links to `/copilot?new=1`: start fresh wherever the tab was.
  const fresh = params.get("new");
  useEffect(() => {
    if (fresh) newConversation();
  }, [fresh, newConversation]);

  const clearDoc = useCallback(() => {
    dispatch({ type: "doc", doc: null });
    updateUrl({ doc: null });
  }, [updateUrl]);

  const retry = useCallback(
    (turnId: string, ask: string) => {
      dispatch({ type: "remove", turnId });
      void send(ask);
    },
    [send],
  );

  // `/copilot?doc=X&ask=…` sends its question once, then drops `ask` so a reload doesn't send it again.
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!urlAsk || !api) return;
    const key = `${urlDoc}\n${urlAsk}`;
    if (asked.current === key) return;
    asked.current = key;
    updateUrl({ ask: null });
    controller.current?.abort();
    controller.current = null;
    dispatch({ type: "reset", doc: urlDoc });
    void send(urlAsk, { ...EMPTY, doc: urlDoc });
  }, [urlAsk, urlDoc, api, send, updateUrl]);

  // Drafts of a conversation restored from this tab.
  const restoredSession = useRef(state.session_id);
  useEffect(() => {
    if (restoredSession.current) refreshFiles(restoredSession.current);
  }, [refreshFiles]);

  useEffect(() => {
    if (!busy) saveConversation(state);
  }, [state, busy]);

  useEffect(
    () => () => {
      controller.current?.abort();
      saveConversation(restored(latest.current));
    },
    [],
  );

  // Follow the answer as it streams, unless the reader has scrolled up to read. The panel scrolls, not the window.
  useEffect(() => {
    if (!scroller) return;
    const onScroll = () => {
      stick.current = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 160;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [scroller]);
  useEffect(() => {
    if (scroller && stick.current && state.turns.length) scroller.scrollTo({ top: scroller.scrollHeight });
  }, [state, scroller]);

  const sessionId = state.session_id;
  const listed = files.session === sessionId ? files.list : [];
  const titles = new Map(listed.map((f) => [f.name, f.title]));
  const written = state.turns.flatMap((t) => t.blocks.flatMap((b) => (b.kind === "file" ? [{ name: b.name, saving: t.status === "streaming" }] : [])));
  const rows: DraftRow[] = [
    ...listed.map((f) => ({ name: f.name, title: f.title, size: f.size, saving: false })),
    ...written.filter((w) => !titles.has(w.name)).map((w) => ({ name: w.name, saving: w.saving })),
  ].filter((row, i, all) => all.findIndex((r) => r.name === row.name) === i);

  const open = (name: string) => sessionId && setPreview({ session_id: sessionId, file: name, title: titles.get(name) });

  const problemActions = (turnId: string, ask: string) => ({
    onRetry: () => retry(turnId, ask),
    onNew: newConversation,
    onSignIn: signOut,
    doc: state.doc,
  });

  const talking = state.turns.length > 0;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Copilot" }]}
        title={talking ? state.turns[0]!.ask : "New chat"}
        actions={
          <>
            {rows.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setDraftsOpen(true)} className="lg:hidden">
                <FileText /> Drafts <span className="text-muted-foreground tabular-nums">{rows.length}</span>
              </Button>
            )}
            {talking && (
              <Button variant="outline" size="sm" onClick={newConversation} aria-label="New conversation">
                <Plus /> <span className="hidden sm:inline">New conversation</span>
              </Button>
            )}
          </>
        }
      />

      <div className={cn("-mb-16 grid grid-cols-1 gap-8", talking && "lg:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_18rem]")}>
        <div className={cn("flex min-w-0 flex-col", FILL)}>
          {talking ? (
            <div className={cn(COLUMN, "flex flex-1 flex-col gap-8 pb-8")} aria-live="off">
              {state.turns.map((turn) => (
                <div key={turn.id} className="flex flex-col gap-5">
                  <UserMessage text={turn.ask} />
                  <AssistantTurn turn={turn} sessionId={sessionId} titles={titles} onOpenFile={open} actions={problemActions(turn.id, turn.ask)} />
                </div>
              ))}
            </div>
          ) : (
            // Linear Agent sits the composer just above the middle of the panel.
            <div className="flex min-h-6 flex-[4] flex-col justify-end pb-5">
              <p className={cn(COLUMN, "px-1 text-[13px] text-muted-foreground")}>
                {state.doc
                  ? "Kopi reads the notice and your profile, checks eligibility, and drafts the documents of this bid."
                  : "Kopi finds tenders, checks eligibility and drafts the documents of a bid, from public GeBIZ notices."}
              </p>
            </div>
          )}

          {/* The same element in both layouts, so the text and focus survive the first send. */}
          <div className={cn(COLUMN, talking && "sticky bottom-0 z-10 bg-background pt-2 pb-3 sm:pb-5")}>
            <Composer busy={busy} doc={state.doc} roomy={!talking} onSend={(text) => void send(text)} onStop={stop} onClearDoc={clearDoc} />
            {talking ? <Footnote className="pt-2" /> : <Examples doc={state.doc} onAsk={(ask) => void send(ask)} />}
          </div>

          {!talking && (
            <div className="flex min-h-10 flex-[5] flex-col justify-end pb-5">
              <Footnote className={cn(COLUMN, "text-center")} />
            </div>
          )}
        </div>

        {talking && (
          <aside className="hidden flex-col gap-3 lg:sticky lg:top-[5.25rem] lg:flex lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
            <DraftsPanel rows={rows} sessionId={sessionId} onOpen={(row) => open(row.name)} />
            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
              Kopi reads public GeBIZ notices, past awards and the licence catalogue. The tender documents behind the GeBIZ login stay with you.
            </p>
          </aside>
        )}
      </div>

      <Sheet open={draftsOpen} onOpenChange={setDraftsOpen}>
        <SheetContent side="right" className="gap-3 p-4 pt-12 data-[side=right]:w-[calc(100%-1rem)] data-[side=right]:sm:max-w-sm">
          <SheetTitle className="sr-only">Drafts</SheetTitle>
          <DraftsPanel
            rows={rows}
            sessionId={sessionId}
            onOpen={(row) => {
              setDraftsOpen(false);
              open(row.name);
            }}
          />
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Kopi reads public GeBIZ notices, past awards and the licence catalogue. The tender documents behind the GeBIZ login stay with you.
          </p>
        </SheetContent>
      </Sheet>

      <DraftPreview draft={preview} onClose={() => setPreview(null)} />
    </>
  );
}
