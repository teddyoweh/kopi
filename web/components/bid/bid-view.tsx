"use client";

import { Briefcase, ExternalLink, FileText, MessageSquare, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { ArtifactPanel, draftKind, rank, sameTab, type ShelfRow, type Tab } from "@/components/bid/artifact-panel";
import { StageLine } from "@/components/bid/stage-stepper";
import { Countdown, useNow } from "@/components/bid/time";
import { Composer } from "@/components/copilot/copilot-view";
import { AssistantTurn, UserMessage } from "@/components/copilot/turn";
import { useApi, useKopi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { AgencyDisc } from "@/components/search/result-card";
import { EmptyState, ErrorState } from "@/components/states";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BidMemory, ChatEvent, Notice, SessionFile } from "@/lib/api";
import { useBids } from "@/lib/bids";
import { EMPTY, problemOf, reducer, restored, type Conversation } from "@/lib/copilot";
import { recordDraft, rememberTitle } from "@/lib/submissions";
import { displayTitle } from "@/lib/title-case";
import { useAsync } from "@/lib/use-async";
import { useUrlParams } from "@/lib/use-url-query";
import { cn } from "@/lib/utils";

/** The request that starts a bid. The bid playbook on the server (and the mock's script) take it from there. */
export const kickoff = (doc: string) => `Start the bid for ${doc}: qualify it, plan it and draft what we need.`;
const isKickoff = (ask: string, doc: string) => ask === kickoff(doc);

/** Tools whose results change the bid memory, so its tab refreshes after them. */
const MEMORY_TOOLS = new Set(["remember", "set_bid_stage"]);

/** A bid's conversation is kept in this browser per tender; its memory and documents live on the API. */
const turnsKey = (doc: string) => `kopi.bidTurns.${doc}`;

function loadTurns(doc: string): Conversation {
  try {
    const saved = JSON.parse(localStorage.getItem(turnsKey(doc)) ?? "null") as Conversation | null;
    return saved?.turns ? restored(saved) : { ...EMPTY, doc };
  } catch {
    return { ...EMPTY, doc };
  }
}

function saveTurns(doc: string, conversation: Conversation) {
  try {
    localStorage.setItem(turnsKey(doc), JSON.stringify(conversation));
  } catch {
    // Storage full: the conversation still lives in the page, and the memory and documents on the API.
  }
}

/** The draft a Write or Edit call touches, if it is one of the bid's documents. */
function draftOf(event: ChatEvent): string | null {
  if (event.type !== "tool_call" || (event.tool !== "Write" && event.tool !== "Edit")) return null;
  const path = typeof event.input?.file_path === "string" ? event.input.file_path : "";
  return /\/drafts\/[^/]+\.md$/.test(path) ? path.split("/").pop()! : null;
}

function ChatHeader({ notice, now, memory, working }: { notice: Notice | null; now: number; memory: BidMemory | null; working: boolean }) {
  if (!notice) {
    return (
      <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-3.5 w-40 rounded-full" />
        <Skeleton className="h-5 w-full rounded-full" />
        <Skeleton className="h-3.5 w-56 rounded-full" />
      </div>
    );
  }
  return (
    <header className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <AgencyDisc agency={notice.agency} />
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{notice.agency}</p>
        <Countdown closing={notice.closing} now={now} />
      </div>
      <h1 className="line-clamp-2 text-[16px] leading-snug font-medium tracking-[-0.015em] text-pretty">{displayTitle(notice.title)}</h1>
      <StageLine memory={memory} working={working} />
    </header>
  );
}

function NotStarted({ onStart, disabled }: { onStart: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border bg-card px-5 py-5">
      <span className="grid size-9 place-items-center rounded-full bg-kopi-soft">
        <Sparkles className="size-4 text-kopi" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-medium tracking-[-0.01em]">Kopi hasn&apos;t started on this bid</p>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Start it and Kopi works it end to end: it qualifies the tender, plans the bid back from closing, and writes the clarification
          questions, compliance matrix, checklist and proposal outline. Each document opens beside the chat as it is written.
        </p>
      </div>
      <Button onClick={onStart} disabled={disabled}>
        <Play /> Start the bid
      </Button>
    </div>
  );
}

function KickoffLine({ at }: { at: string }) {
  const when = new Date(Number.parseInt(at, 36)).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
      <span className="grid size-5 place-items-center rounded-full bg-muted" aria-hidden>
        <Play className="size-2.5 fill-current" />
      </span>
      You started the bid, {when}. Kopi works it from here.
    </p>
  );
}

function Workspace({ doc }: { doc: string }) {
  const api = useApi();
  const { profile, signOut } = useKopi();
  const now = useNow();
  const [params, updateUrl] = useUrlParams();
  const { bidFor, startBid, attachSession } = useBids();
  const bid = bidFor(doc);
  const tender = useAsync(async () => (api ? api.tender(doc, profile) : null), [api, doc, profile]);
  const notice = tender.data?.notice ?? null;

  const [state, dispatch] = useReducer(reducer, doc, loadTurns);
  const session = bid?.session_id ?? state.session_id;
  const sessionRef = useRef(session);
  const controller = useRef<AbortController | null>(null);
  const [memory, setMemory] = useState<{ session: string; value: BidMemory } | null>(null);
  const [files, setFiles] = useState<{ session: string; list: SessionFile[] } | null>(null);
  const busy = state.turns.some((t) => t.status === "streaming");

  // The artifacts panel: what Kopi is writing right now, which documents are mid-write, and which tab is open.
  const [live, setLive] = useState<Record<string, string>>({});
  const [writing, setWriting] = useState<Set<string>>(() => new Set());
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Tab | null>(null);
  const picked = useRef(false);
  /** Drafts whose text is arriving in pieces right now; the first piece of a new write replaces the old copy. */
  const streaming = useRef(new Set<string>());
  const [view, setView] = useState<"chat" | "docs">("chat");
  const messages = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    sessionRef.current = session;
  });
  useEffect(() => {
    if (notice) rememberTitle(notice.doc_no, notice.title);
  }, [notice]);
  useEffect(() => {
    if (!busy) saveTurns(doc, state);
  }, [doc, state, busy]);

  const refreshMemory = useCallback(
    (sid: string) => {
      api
        ?.memory(sid)
        .then((value) => setMemory({ session: sid, value }))
        .catch(() => undefined);
    },
    [api],
  );
  const refreshFiles = useCallback(
    (sid: string) => {
      api
        ?.sessionFiles(sid)
        .then((list) => setFiles({ session: sid, list }))
        .catch(() => undefined);
    },
    [api],
  );
  useEffect(() => {
    if (session) {
      refreshMemory(session);
      refreshFiles(session);
    }
  }, [session, refreshMemory, refreshFiles]);

  /** The person chose a tab; Kopi stops moving the panel for the rest of this turn. */
  const choose = useCallback((tab: Tab) => {
    picked.current = true;
    setActive(tab);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || !api || controller.current) return;
      const turnId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const abort = new AbortController();
      controller.current = abort;
      picked.current = false;
      stick.current = true;
      dispatch({ type: "start", turn: { id: turnId, ask: message, blocks: [], status: "streaming" } });
      let sid = sessionRef.current;
      let lastTool: string | undefined;
      try {
        await api.chat(
          { message, session_id: sid, profile, doc_no: doc, bid: true },
          (event) => {
            if (!sid && event.session_id) {
              sid = event.session_id;
              attachSession(doc, sid);
            }
            dispatch({ type: "event", turnId, event });
            if (event.type === "tool_call") lastTool = event.tool;
            if (event.type === "writing" && event.file && event.text) {
              const name = event.file;
              const piece = event.text;
              const fresh = !streaming.current.has(name);
              streaming.current.add(name);
              setLive((docs) => ({ ...docs, [name]: (fresh ? "" : (docs[name] ?? "")) + piece }));
              setWriting((names) => (names.has(name) ? names : new Set(names).add(name)));
              if (!picked.current) setActive((tab) => (tab?.kind === "doc" && tab.name === name ? tab : { kind: "doc", name }));
            }
            const draft = draftOf(event);
            if (draft) {
              streaming.current.delete(draft);
              const content = event.tool === "Write" && typeof event.input?.content === "string" ? event.input.content : undefined;
              setLive((docs) => {
                const next = { ...docs };
                if (content === undefined) delete next[draft];
                else next[draft] = content;
                return next;
              });
              setWriting((names) => new Set(names).add(draft));
              if (!picked.current) setActive({ kind: "doc", name: draft });
            }
            const tool = event.type === "tool_result" ? (event.tool ?? lastTool) : undefined;
            if (tool && MEMORY_TOOLS.has(tool) && sid) refreshMemory(sid);
            if (event.type === "file" && event.file && sid) {
              const name = event.file;
              recordDraft(doc, sid, name);
              setWriting((names) => {
                const next = new Set(names);
                next.delete(name);
                return next;
              });
              setVersions((v) => ({ ...v, [name]: (v[name] ?? 0) + 1 }));
              refreshFiles(sid);
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
        setWriting(new Set());
        streaming.current.clear();
        if (sid) {
          refreshMemory(sid);
          refreshFiles(sid);
        }
      }
    },
    [api, profile, doc, attachSession, refreshMemory, refreshFiles],
  );

  const stop = useCallback(() => controller.current?.abort(), []);
  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(() => {
    if (notice && !bid) startBid(notice, profile.id);
    void send(kickoff(doc));
  }, [notice, bid, startBid, profile.id, send, doc]);

  // Arriving from Start bid (`&start=1`) kicks the bid off once; a reload doesn't start it again.
  const kicked = useRef(false);
  useEffect(() => {
    if (params.get("start") !== "1" || !api || kicked.current) return;
    kicked.current = true;
    updateUrl({ start: null });
    if (!session && state.turns.length === 0) void send(kickoff(doc));
  }, [params, api, session, state.turns.length, send, doc, updateUrl]);

  // Follow the answer as it streams, unless the reader has scrolled up to read.
  useEffect(() => {
    const el = messages.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const el = messages.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight });
  }, [state]);

  const listed = files && files.session === session ? files.list : [];
  const titles = new Map(listed.map((f) => [f.name, f.title]));
  const shelf: ShelfRow[] = [
    ...listed.map((f) => ({ name: f.name, kind: f.kind ?? "draft", size: f.size })),
    ...[...writing, ...Object.keys(live)].filter((name) => !titles.has(name)).map((name) => ({ name, kind: "draft" as const })),
  ].filter((row, i, all) => all.findIndex((r) => r.name === row.name) === i);
  const drafts = shelf.filter((r) => r.kind === "draft");
  const bidMemory = memory && memory.session === session ? memory.value : null;

  // With nothing open, the panel shows the first document in reading order once there is one.
  const first = [...drafts].sort((a, b) => rank(draftKind(a.name, doc)) - rank(draftKind(b.name, doc)))[0]?.name;
  const shown: Tab | null = active ?? (first ? { kind: "doc", name: first } : null);

  const openFile = (name: string) => {
    choose({ kind: "doc", name });
    setView("docs");
  };

  if (tender.status === "error") return <ErrorState error={tender.error} />;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Bids", href: "/bids" }]}
        title={doc}
        actions={
          notice && (
            <a href={notice.url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden sm:inline-flex")}>
              View on GeBIZ <ExternalLink className="text-muted-foreground" />
            </a>
          )
        }
      />
      <div className="flex h-[calc(100dvh-53px)] min-h-0 flex-col lg:h-[calc(100dvh-69px)]">
        <div role="tablist" aria-label="View" className="flex shrink-0 items-center gap-1 border-b border-border/70 px-3 py-2 lg:hidden">
          {(["chat", "docs"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors",
                view === v ? "bg-muted font-medium text-foreground" : "font-book text-muted-foreground",
              )}
            >
              {v === "chat" ? <MessageSquare className="size-3.5" aria-hidden /> : <FileText className="size-3.5" aria-hidden />}
              {v === "chat" ? "Chat" : `Documents${drafts.length ? ` ${drafts.length}` : ""}`}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              "min-h-0 w-full flex-col lg:flex lg:w-[42%] lg:max-w-[40rem] lg:min-w-[26rem] lg:shrink-0 lg:border-r lg:border-border/70",
              view === "chat" ? "flex" : "hidden",
            )}
          >
            <div className="shrink-0 border-b border-border/70 px-5 py-4">
              <ChatHeader notice={notice} now={now} memory={bidMemory} working={busy} />
            </div>
            <div ref={messages} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
              {state.turns.length === 0 && !session ? (
                <NotStarted onStart={start} disabled={!api || !notice} />
              ) : (
                state.turns.map((turn) => (
                  <div key={turn.id} className="flex flex-col gap-4">
                    {isKickoff(turn.ask, doc) ? <KickoffLine at={turn.id.split("-")[0]!} /> : <UserMessage text={turn.ask} />}
                    <AssistantTurn
                      turn={turn}
                      sessionId={session}
                      titles={titles}
                      onOpenFile={openFile}
                      actions={{
                        onRetry: () => {
                          dispatch({ type: "remove", turnId: turn.id });
                          void send(turn.ask);
                        },
                        onNew: () => dispatch({ type: "remove", turnId: turn.id }),
                        onSignIn: signOut,
                        doc,
                      }}
                    />
                  </div>
                ))
              )}
            </div>
            {(session || state.turns.length > 0) && (
              <div className="shrink-0 px-4 pt-2 pb-4">
                <Composer
                  busy={busy}
                  doc={doc}
                  roomy={false}
                  onSend={(text) => void send(text)}
                  onStop={stop}
                  placeholder="Ask Kopi to change a draft, check a requirement, or take the next step"
                />
              </div>
            )}
          </div>

          <div className={cn("min-h-0 min-w-0 flex-1 lg:block", view === "docs" ? "block" : "hidden")}>
            <ArtifactPanel
              doc={doc}
              sessionId={session}
              rows={shelf}
              live={live}
              writing={writing}
              versions={versions}
              active={shown}
              onSelect={(tab) => !sameTab(tab, shown) && choose(tab)}
              memory={bidMemory}
              onAdd={async (text) => {
                if (!api || !session) return;
                setMemory({ session, value: await api.remember(session, text) });
              }}
              onForget={async (id) => {
                if (!api || !session) return;
                setMemory({ session, value: await api.forget(session, id) });
              }}
              onUpload={async (file) => {
                if (!api || !session) return;
                await api.upload(session, file);
                refreshFiles(session);
              }}
              now={now}
              started={busy || !!session}
              reveal={view}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export function BidView() {
  const [params] = useUrlParams();
  const doc = params.get("doc");
  if (!doc) {
    return (
      <div className="px-4 pt-6 sm:px-8 sm:pt-8">
        <EmptyState icon={Briefcase} title="No bid chosen">
          Open a bid from{" "}
          <Link href="/bids" className="text-kopi underline-offset-4 hover:underline">
            Bids
          </Link>
          , or start one from a tender.
        </EmptyState>
      </div>
    );
  }
  return <Workspace key={doc} doc={doc} />;
}
