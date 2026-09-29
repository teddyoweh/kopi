"use client";

import { Briefcase, ExternalLink, Loader2, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { ChecklistCard } from "@/components/bid/checklist-card";
import { DocumentsCard, type ShelfRow } from "@/components/bid/documents-card";
import { MemoryCard } from "@/components/bid/memory-card";
import { StageStepper } from "@/components/bid/stage-stepper";
import { Countdown, useNow } from "@/components/bid/time";
import { Composer } from "@/components/copilot/copilot-view";
import { AssistantTurn, UserMessage } from "@/components/copilot/turn";
import { DraftPreview, type DraftRefLike } from "@/components/draft-preview";
import { useApi, useKopi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { AgencyDisc } from "@/components/search/result-card";
import { EmptyState, ErrorState } from "@/components/states";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BidMemory, Notice, SessionFile } from "@/lib/api";
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

/** Tools whose results change the bid memory, so the panel refreshes after them. */
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

function Header({ notice, now }: { notice: Notice; now: number }) {
  const { profile } = useKopi();
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <AgencyDisc agency={notice.agency} />
        <p className="min-w-0 truncate text-[13px] text-muted-foreground">{notice.agency}</p>
      </div>
      <h1 className="max-w-4xl text-[22px] leading-[1.2] font-medium tracking-[-0.025em] text-balance break-words sm:text-[26px]">{displayTitle(notice.title)}</h1>
      <div className="flex flex-wrap items-center gap-1.5">
        <Countdown closing={notice.closing} now={now} />
        <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-[12px] font-book text-foreground/70">
          {(notice.procurement_method || notice.type).replace(/^Open\s+/i, "")}
        </span>
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2.5 text-[12px] font-book text-foreground/70">
          <Briefcase className="size-3.5 text-kopi" aria-hidden /> Bidding as {profile.name}
        </span>
      </div>
    </header>
  );
}

function NotStarted({ onStart, disabled }: { onStart: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border bg-card px-5 py-6">
      <span className="grid size-9 place-items-center rounded-full bg-kopi-soft">
        <Sparkles className="size-4 text-kopi" aria-hidden />
      </span>
      <div className="flex max-w-xl flex-col gap-1">
        <p className="text-[15px] font-medium tracking-[-0.01em]">Kopi hasn&apos;t started on this bid</p>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Start it and Kopi works it end to end: it qualifies the tender, writes a bid plan with a timeline back from closing, drafts the
          clarification questions, a compliance matrix, the checklist and a proposal outline, and keeps what it learns in the bid memory.
        </p>
      </div>
      <Button onClick={onStart} disabled={disabled}>
        <Play /> Start the bid
      </Button>
    </div>
  );
}

function KickoffLine({ at }: { at: string }) {
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
      <span className="grid size-5 place-items-center rounded-full bg-muted" aria-hidden>
        <Play className="size-2.5 fill-current" />
      </span>
      You started the bid{at && `, ${new Date(Number.parseInt(at, 36)).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}. Kopi works it from here.
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
  const [preview, setPreview] = useState<DraftRefLike | null>(null);
  const busy = state.turns.some((t) => t.status === "streaming");

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

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || !api || controller.current) return;
      const turnId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const abort = new AbortController();
      controller.current = abort;
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
            const tool = event.type === "tool_result" ? (event.tool ?? lastTool) : undefined;
            if (tool && MEMORY_TOOLS.has(tool) && sid) refreshMemory(sid);
            if (event.type === "file" && event.file && sid) {
              recordDraft(doc, sid, event.file);
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

  const listed = files && files.session === session ? files.list : [];
  const titles = new Map(listed.map((f) => [f.name, f.title]));
  const written = state.turns.flatMap((t) => t.blocks.flatMap((b) => (b.kind === "file" ? [{ name: b.name, saving: t.status === "streaming" }] : [])));
  const shelf: ShelfRow[] = [
    ...listed.map((f) => ({ name: f.name, kind: f.kind ?? "draft", size: f.size })),
    ...written.filter((w) => !titles.has(w.name)).map((w) => ({ name: w.name, kind: "draft" as const, saving: w.saving })),
  ].filter((row, i, all) => all.findIndex((r) => r.name === row.name) === i);
  const bidMemory = memory && memory.session === session ? memory.value : null;
  const open = (name: string) => session && setPreview({ session_id: session, file: name, title: titles.get(name) });

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
      <div className="flex flex-col gap-5">
        {notice ? (
          <Header notice={notice} now={now} />
        ) : (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-4 w-56 rounded-full" />
            <Skeleton className="h-7 w-full max-w-2xl rounded-full" />
            <Skeleton className="h-6 w-72 rounded-full" />
          </div>
        )}
        <StageStepper memory={bidMemory} working={busy} />

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-label="Activity" className="flex min-w-0 flex-col gap-6">
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
                    onOpenFile={open}
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
            {(session || state.turns.length > 0) && (
              <div className="sticky bottom-0 z-10 -mx-1 bg-background px-1 pt-2 pb-3 sm:pb-5">
                <Composer
                  busy={busy}
                  doc={doc}
                  roomy={false}
                  onSend={(text) => void send(text)}
                  onStop={stop}
                  placeholder="Ask Kopi to change a draft, check a requirement, or take the next step"
                />
                {busy && (
                  <p className="flex items-center gap-2 px-1 pt-2 text-[12px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin text-kopi" aria-hidden /> Kopi is working the bid. The documents and memory update as it goes.
                  </p>
                )}
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-18 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            <DocumentsCard
              doc={doc}
              rows={shelf}
              sessionId={session}
              onOpen={open}
              onUpload={async (file) => {
                if (!api || !session) return;
                await api.upload(session, file);
                refreshFiles(session);
              }}
            />
            <MemoryCard
              memory={bidMemory}
              loading={!!session && !bidMemory}
              disabled={!session}
              onAdd={async (text) => {
                if (!api || !session) return;
                setMemory({ session, value: await api.remember(session, text) });
              }}
              onForget={async (id) => {
                if (!api || !session) return;
                setMemory({ session, value: await api.forget(session, id) });
              }}
            />
            <ChecklistCard doc={doc} now={now} />
          </aside>
        </div>
      </div>
      <DraftPreview draft={preview} onClose={() => setPreview(null)} />
    </>
  );
}

export function BidView() {
  const [params] = useUrlParams();
  const doc = params.get("doc");
  if (!doc) {
    return (
      <EmptyState icon={Briefcase} title="No bid chosen">
        Open a bid from{" "}
        <Link href="/bids" className="text-kopi underline-offset-4 hover:underline">
          Bids
        </Link>
        , or start one from a tender.
      </EmptyState>
    );
  }
  return <Workspace key={doc} doc={doc} />;
}
