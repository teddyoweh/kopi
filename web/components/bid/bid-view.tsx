"use client";

import { Ban, Briefcase, ExternalLink, FileCheck2, FileText, MessageSquare, Pause, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { ArtifactPanel, draftKind, rank, sameTab, type ShelfRow, type Tab } from "@/components/bid/artifact-panel";
import { AutopilotControl, isNoBid } from "@/components/bid/autopilot-bar";
import { STAGES, stageLabel } from "@/components/bid/stage-stepper";
import { useNow } from "@/components/bid/time";
import { Composer } from "@/components/copilot/copilot-view";
import { AssistantTurn, UserMessage } from "@/components/copilot/turn";
import { useApi, useKopi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { BidMemory, BidStage, ChatEvent, Notice, SessionFile } from "@/lib/api";
import { primeBidStatus } from "@/lib/bid-status";
import { useBids } from "@/lib/bids";
import { EMPTY, problemOf, reducer, restored, type Conversation } from "@/lib/copilot";
import { shortTitle } from "@/lib/short-title";
import { recordDraft, rememberTitle } from "@/lib/submissions";
import { displayTitle } from "@/lib/title-case";
import { useAsync } from "@/lib/use-async";
import { useUrlParams } from "@/lib/use-url-query";
import { dateTime, timeLeft } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The request that starts a bid. The bid playbook on the server (and the mock's script) take it from there. */
export const kickoff = (doc: string) => `Start the bid for ${doc}: qualify it, plan it and draft what we need.`;
const isKickoff = (ask: string, doc: string) => ask === kickoff(doc);

/** The requests that run the bid on autopilot: the first one, then one per step until it is ready to submit. */
export const autopilotStart = (doc: string) => `Run the bid for ${doc} on autopilot: qualify it, make the call, and take it all the way to a submission-ready pack.`;
export const AUTOPILOT_NEXT = "Continue on autopilot: take the next step.";
const isAutopilotAsk = (ask: string, doc: string) => ask === autopilotStart(doc) || ask === AUTOPILOT_NEXT;
/** Four steps, with room for one that has to be redone; past that, autopilot stops rather than loop. */
const MAX_AUTO_TURNS = 6;

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

/**
 * The bid in two lines: its title with the autopilot beside it, then who, how long is left and
 * the stage. The next step is the stage's tooltip; the documents and memory hold the rest.
 */
function ChatHeader({ notice, now, memory, control }: { notice: Notice | null; now: number; memory: BidMemory | null; control: React.ReactNode }) {
  if (!notice) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-5 w-full rounded-full" />
        <Skeleton className="h-3.5 w-56 rounded-full" />
      </div>
    );
  }
  const left = timeLeft(notice.closing, now);
  const urgent = !left.closed && left.hours < 48;
  const current = STAGES.findIndex((s) => s.id === memory?.stage);
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        <h1 className="line-clamp-2 min-w-0 flex-1 text-[15.5px] leading-snug font-medium tracking-[-0.015em] text-pretty">{displayTitle(notice.title)}</h1>
        {control}
      </div>
      <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <span className="truncate">{notice.agency}</span>
        <span aria-hidden>·</span>
        <span className={cn("shrink-0 tabular-nums", urgent && "text-unmet")} title={`Closes ${dateTime(notice.closing)}`}>
          {left.closed ? "Closed" : `${left.lead} left`}
        </span>
        <span aria-hidden>·</span>
        <span className="flex shrink-0 items-center gap-1.5" title={memory?.next_step ? `Next: ${memory.next_step}` : undefined}>
          <span className="flex gap-0.5" aria-hidden>
            {STAGES.map((stage, i) => (
              <span key={stage.id} className={cn("h-1 w-2.5 rounded-full", current >= i ? "bg-kopi" : "bg-foreground/12")} />
            ))}
          </span>
          {current >= 0 ? stageLabel(memory?.stage) : "Not started"}
        </span>
      </p>
    </header>
  );
}

function NotStarted({ onStart, onStep, disabled }: { onStart: () => void; onStep: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border bg-card px-5 py-5">
      <span className="grid size-9 place-items-center rounded-full bg-kopi-soft">
        <Sparkles className="size-4 text-kopi" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-medium tracking-[-0.01em]">Kopi hasn&apos;t started on this bid</p>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          On autopilot Kopi does the whole bid and hands you a submission pack. You sign and submit.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button onClick={onStart} disabled={disabled}>
          <Sparkles /> Run on autopilot
        </Button>
        <Button variant="ghost" onClick={onStep} disabled={disabled} className="text-muted-foreground">
          Just qualify it
        </Button>
      </div>
    </div>
  );
}

function AutopilotLine({ at }: { at: string }) {
  const when = new Date(Number.parseInt(at, 36)).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
      <span className="grid size-5 place-items-center rounded-full bg-kopi-soft" aria-hidden>
        <Sparkles className="size-3 text-kopi" />
      </span>
      You put the bid on autopilot, {when}. Kopi runs it to a submission pack.
    </p>
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
  const { bidFor, startBid, attachSession, setAutopilot } = useBids();
  const bid = bidFor(doc);
  const bidRef = useRef(bid);
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
    bidRef.current = bid;
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
  // The sidebar, Home and Inbox show this bid's stage too; tell them as soon as it moves.
  useEffect(() => {
    if (memory) primeBidStatus(memory.session, memory.value, files?.session === memory.session ? files.list : undefined);
  }, [memory, files]);

  /** The person chose a tab; Kopi stops moving the panel for the rest of this turn. */
  const choose = useCallback((tab: Tab) => {
    picked.current = true;
    setActive(tab);
  }, []);

  const sendRef = useRef<((text: string, autopilot?: boolean) => Promise<void>) | null>(null);
  const autoTurns = useRef(0);
  const stageRef = useRef<BidStage | null>(null);
  /** The stage a turn started from, so the autopilot bar names the step being worked, not the one it just moved to. */
  const [workingStage, setWorkingStage] = useState<BidStage | null>(null);

  /** After an autopilot step: run the next one, or stop at submit, a no-bid call, a stalled step or a pause. */
  const advance = useCallback(
    (after: BidMemory | null, before: BidStage | null) => {
      if (bidRef.current?.autopilot !== "on") return;
      const title = bidRef.current ? shortTitle(bidRef.current.title) : doc;
      if (!after) {
        setAutopilot(doc, "paused");
        return;
      }
      if (after.stage === "submit") {
        setAutopilot(doc, "done");
        setActive({ kind: "doc", name: `${doc}-submission-pack.md` });
        toast({ title: "Ready to submit", description: title, icon: FileCheck2 });
        return;
      }
      if (isNoBid(after.next_step)) {
        setAutopilot(doc, "done");
        toast({ title: "Kopi's call: no bid", description: title, icon: Ban });
        return;
      }
      if (after.stage === before || autoTurns.current >= MAX_AUTO_TURNS) {
        setAutopilot(doc, "paused");
        toast({ title: "Autopilot paused", description: "The last step didn't move the bid on. Ask Kopi what is missing, or resume.", icon: Pause });
        return;
      }
      setTimeout(() => void sendRef.current?.(AUTOPILOT_NEXT, true), 400);
    },
    [doc, setAutopilot],
  );

  const send = useCallback(
    async (text: string, autopilot = false) => {
      const message = text.trim();
      if (!message || !api || controller.current) return;
      const before = stageRef.current;
      setWorkingStage(before);
      if (autopilot) autoTurns.current += 1;
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
          { message, session_id: sid, profile, doc_no: doc, bid: true, autopilot },
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
        if (autopilot && sid) {
          const after = await api.memory(sid).catch(() => null);
          if (after) setMemory({ session: sid, value: after });
          stageRef.current = after?.stage ?? before;
          advance(after, before);
        }
      } catch (error) {
        if (abort.signal.aborted) dispatch({ type: "stopped", turnId });
        else dispatch({ type: "problem", turnId, problem: problemOf(error) });
        if (autopilot && !leaving.current && bidRef.current?.autopilot === "on") setAutopilot(doc, "paused");
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
    [api, profile, doc, attachSession, refreshMemory, refreshFiles, advance, setAutopilot],
  );
  useEffect(() => {
    sendRef.current = send;
  });

  /** Leaving the page ends the stream but not the autopilot, which picks up again when the bid is reopened. */
  const leaving = useRef(false);
  const stop = useCallback(() => controller.current?.abort(), []);
  useEffect(
    () => () => {
      leaving.current = true;
      controller.current?.abort();
    },
    [],
  );

  /** Start the bid: on autopilot unless the person asked for the first step only. */
  const start = useCallback(
    (autopilot = true) => {
      if (notice && !bid) startBid(notice, profile.id);
      if (!autopilot) return void send(kickoff(doc));
      autoTurns.current = 0;
      setAutopilot(doc, "on");
      void send(autopilotStart(doc), true);
    },
    [notice, bid, startBid, profile.id, send, doc, setAutopilot],
  );

  /** Hand an existing bid to the autopilot, or pick it up again after a pause. */
  const runAutopilot = useCallback(() => {
    autoTurns.current = 0;
    setAutopilot(doc, "on");
    void send(AUTOPILOT_NEXT, true);
  }, [doc, send, setAutopilot]);

  // Arriving from Start bid (`&start=1`) starts the bid on autopilot once; a reload doesn't start it again.
  const kicked = useRef(false);
  useEffect(() => {
    if (params.get("start") !== "1" || !api || kicked.current) return;
    kicked.current = true;
    updateUrl({ start: null });
    if (!session && state.turns.length === 0) start(true);
  }, [params, api, session, state.turns.length, start, updateUrl]);

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
  useEffect(() => {
    if (bidMemory && !busy) stageRef.current = bidMemory.stage ?? null;
  }, [bidMemory, busy]);

  // A bid left on autopilot picks up where it stopped when its page opens again.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || kicked.current || !api || busy || !session || !bidMemory) return;
    resumed.current = true;
    if (bid?.autopilot !== "on" || bidMemory.stage === "submit" || isNoBid(bidMemory.next_step)) return;
    autoTurns.current = 0;
    void send(AUTOPILOT_NEXT, true);
  }, [api, busy, session, bidMemory, bid?.autopilot, send]);

  const pack = `${doc}-submission-pack.md`;
  const downloadAll = async () => {
    if (!api || !session) return;
    const names = [...drafts].sort((a, b) => rank(draftKind(a.name, doc)) - rank(draftKind(b.name, doc))).map((d) => d.name);
    const texts = await Promise.all(names.map((name) => api.sessionFile(session, name).catch(() => "")));
    const url = URL.createObjectURL(new Blob([texts.filter(Boolean).join("\n\n---\n\n")], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${doc}-bid-pack.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
            <div className="shrink-0 border-b border-border/70 px-5 py-3.5">
              <ChatHeader
                notice={notice}
                now={now}
                memory={bidMemory}
                control={
                  <AutopilotControl
                    state={bid?.autopilot}
                    stage={busy ? workingStage : (bidMemory?.stage ?? null)}
                    next={bidMemory?.next_step}
                    busy={busy}
                    started={!!session}
                    onRun={runAutopilot}
                    onPause={() => setAutopilot(doc, "paused")}
                    onOpenPack={() => openFile(pack)}
                  />
                }
              />
            </div>
            <div ref={messages} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
              {state.turns.length === 0 && !session ? (
                <NotStarted onStart={() => start(true)} onStep={() => start(false)} disabled={!api || !notice} />
              ) : (
                state.turns.map((turn) => (
                  <div key={turn.id} className="flex flex-col gap-4">
                    {isKickoff(turn.ask, doc) ? (
                      <KickoffLine at={turn.id.split("-")[0]!} />
                    ) : turn.ask === AUTOPILOT_NEXT ? (
                      <hr className="border-border/70" aria-label="Autopilot took the next step" />
                    ) : isAutopilotAsk(turn.ask, doc) ? (
                      <AutopilotLine at={turn.id.split("-")[0]!} />
                    ) : (
                      <UserMessage text={turn.ask} />
                    )}
                    <AssistantTurn
                      docName={(file) => draftKind(file, doc)}
                      turn={turn}
                      sessionId={session}
                      titles={titles}
                      onOpenFile={openFile}
                      actions={{
                        onRetry: () => {
                          dispatch({ type: "remove", turnId: turn.id });
                          if (isAutopilotAsk(turn.ask, doc)) setAutopilot(doc, "on");
                          void send(turn.ask, isAutopilotAsk(turn.ask, doc));
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
              onDownloadAll={drafts.length > 1 ? () => void downloadAll() : undefined}
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
