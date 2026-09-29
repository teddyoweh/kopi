"use client";

import {
  ArrowUp,
  ArrowUpRight,
  ClipboardCheck,
  FileBadge,
  FilePen,
  FileText,
  LayoutGrid,
  Plus,
  Sparkles,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { AssistantTurn, UserMessage } from "@/components/copilot/turn";
import { DownloadButton, DraftPreview, type DraftRefLike } from "@/components/draft-preview";
import { useApi, useKopi } from "@/components/kopi-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { SessionFile } from "@/lib/api";
import { EMPTY, problemOf, reducer, restored, starters, type Conversation } from "@/lib/copilot";
import { fileSize } from "@/lib/format";
import { draftTender, recordDraft, useKnownTitle } from "@/lib/submissions";
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

const PART_ICON: Record<string, LucideIcon> = {
  Overview: LayoutGrid,
  "Permits and licences": FileBadge,
  Drafting: FilePen,
  Submissions: ClipboardCheck,
};

// ---------------------------------------------------------------- pieces

function TenderChip({ doc, onClear }: { doc: string; onClear: () => void }) {
  const api = useApi();
  const known = useKnownTitle(doc);
  const state = useAsync(async () => (api && !known ? (await api.tender(doc)).notice.title : null), [api, doc, known]);
  const title = known ?? state.data;
  return (
    <div className="flex max-w-full items-center gap-2 self-start rounded-lg bg-kopi-soft py-1.5 pr-1.5 pl-3 text-sm">
      <span className="shrink-0 text-muted-foreground">About</span>
      <Link href={`/tender/?doc=${doc}`} className="min-w-0 truncate font-medium hover:underline" title={title ?? doc}>
        {title ? (
          <>
            <span className="font-mono text-[13px]">{doc}</span>
            <span className="hidden sm:inline">, {title}</span>
          </>
        ) : (
          <span className="font-mono text-[13px]">{doc}</span>
        )}
      </Link>
      <button
        type="button"
        onClick={onClear}
        aria-label="Remove the tender from this conversation"
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function Starters({ doc, onAsk }: { doc: string | null; onAsk: (text: string) => void }) {
  const { profile } = useKopi();
  return (
    <div className="flex flex-col gap-8 py-6 sm:py-10">
      <div className="flex flex-col gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-kopi-soft">
          <Sparkles className="size-5 text-kopi" aria-hidden />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">{doc ? `What would you like to know about ${doc}?` : `What can Kopi do for ${profile.name}?`}</h2>
        <p className="max-w-xl text-[15px] text-muted-foreground">
          Kopi searches GeBIZ, checks your registrations and licences, and drafts the paperwork of a bid. It reads only public notices, and you
          review and submit everything yourself.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
        {starters(profile, doc).map((group) => {
          const Icon = PART_ICON[group.part] ?? Sparkles;
          return (
            <div key={group.part} className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Icon className="size-3.5" aria-hidden /> {group.part}
              </p>
              {group.asks.map((ask) => (
                <button
                  key={ask}
                  type="button"
                  onClick={() => onAsk(ask)}
                  className="group flex items-start justify-between gap-3 rounded-lg bg-secondary px-3.5 py-3 text-left text-sm transition-colors hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]"
                >
                  <span>{ask}</span>
                  <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-kopi" aria-hidden />
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Composer({
  busy,
  onSend,
  onStop,
  seeded,
}: {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  seeded: boolean;
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="sticky bottom-0 z-10 flex flex-col gap-2 bg-background pt-3 pb-4 sm:pb-6"
    >
      <div className="flex items-end gap-2 rounded-2xl bg-secondary p-2 transition-colors focus-within:bg-background focus-within:ring-2 focus-within:ring-kopi/40">
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
          placeholder={seeded ? "Ask about this tender" : "Ask Kopi anything about a bid"}
          className="max-h-[220px] min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
        />
        {busy ? (
          <Button type="button" variant="outline" size="icon-lg" onClick={onStop} aria-label="Stop the answer" className="shrink-0 rounded-xl">
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon-lg" disabled={!text.trim()} aria-label="Send" className="shrink-0 rounded-xl">
            <ArrowUp />
          </Button>
        )}
      </div>
      <p className="px-2 text-xs text-muted-foreground">
        Kopi prepares; you submit on GeBIZ. <span className="hidden sm:inline">Enter sends, Shift+Enter adds a line.</span>
      </p>
    </form>
  );
}

type DraftRow = { name: string; title?: string; size?: number; saving: boolean };

function DraftsPanel({ rows, sessionId, onOpen }: { rows: DraftRow[]; sessionId: string | null; onOpen: (row: DraftRow) => void }) {
  return (
    <section aria-labelledby="drafts" className="flex flex-col gap-4 rounded-xl bg-secondary p-5">
      <div className="flex flex-col gap-1">
        <h2 id="drafts" className="text-base font-semibold tracking-tight">
          Drafts
        </h2>
        <p className="text-sm text-muted-foreground">Documents Kopi writes in this conversation, as markdown.</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-background px-3.5 py-3 text-sm text-muted-foreground">
          None yet. Ask for clarification questions, a compliance matrix or a submission checklist.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.name} className="flex items-center gap-1 rounded-lg bg-background pr-1.5">
              <button
                type="button"
                onClick={() => onOpen(row)}
                disabled={row.saving || !sessionId}
                className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-3 py-2.5 text-left disabled:cursor-default"
              >
                <FileText className="mt-0.5 size-4 shrink-0 text-kopi" aria-hidden />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="line-clamp-2 text-sm font-medium">{row.title || row.name}</span>
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
    dispatch({ type: "reset", doc: null });
    setFiles({ session: null, list: [] });
    updateUrl({ doc: null, ask: null });
  }, [updateUrl]);

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

  // Follow the answer as it streams, unless the reader has scrolled up to read.
  useEffect(() => {
    const onScroll = () => {
      stick.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (stick.current && state.turns.length) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [state]);

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

  return (
    <div className="-mb-16 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-h-[calc(100dvh-4.5rem)] min-w-0 flex-col sm:min-h-[calc(100dvh-5rem)]">
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Copilot</h1>
              <p className="max-w-2xl text-[15px] text-muted-foreground">
                Ask Kopi to find tenders, check eligibility and draft the documents of a bid.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {rows.length > 0 && (
                <Button variant="outline" onClick={() => setDraftsOpen(true)} className="lg:hidden">
                  <FileText /> Drafts <span className="text-muted-foreground tabular-nums">{rows.length}</span>
                </Button>
              )}
              {state.turns.length > 0 && (
                <Button variant="outline" onClick={newConversation} aria-label="New conversation">
                  <Plus /> <span className="hidden sm:inline">New conversation</span>
                </Button>
              )}
            </div>
          </div>
          {state.doc && <TenderChip doc={state.doc} onClear={clearDoc} />}
        </div>

        <div className="flex flex-1 flex-col gap-8 pb-6" aria-live="off">
          {state.turns.length === 0 ? (
            <Starters doc={state.doc} onAsk={(ask) => void send(ask)} />
          ) : (
            state.turns.map((turn) => (
              <div key={turn.id} className="flex flex-col gap-5 pt-2">
                <UserMessage text={turn.ask} />
                <AssistantTurn turn={turn} sessionId={sessionId} titles={titles} onOpenFile={open} actions={problemActions(turn.id, turn.ask)} />
              </div>
            ))
          )}
        </div>

        <Composer busy={busy} onSend={(text) => void send(text)} onStop={stop} seeded={Boolean(state.doc)} />
      </div>

      <aside className="hidden flex-col gap-4 lg:sticky lg:top-20 lg:flex lg:self-start">
        <DraftsPanel rows={rows} sessionId={sessionId} onOpen={(row) => open(row.name)} />
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Kopi reads public GeBIZ notices, past awards and the licence catalogue. The tender documents behind the GeBIZ login stay with you.
        </p>
      </aside>

      <Sheet open={draftsOpen} onOpenChange={setDraftsOpen}>
        <SheetContent side="right" className={cn("w-full gap-0 border-none p-4 pt-12 data-[side=right]:w-full data-[side=right]:sm:max-w-sm")}>
          <SheetTitle className="sr-only">Drafts</SheetTitle>
          <DraftsPanel
            rows={rows}
            sessionId={sessionId}
            onOpen={(row) => {
              setDraftsOpen(false);
              open(row.name);
            }}
          />
        </SheetContent>
      </Sheet>

      <DraftPreview draft={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
