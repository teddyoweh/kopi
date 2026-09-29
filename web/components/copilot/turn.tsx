"use client";

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileBadge,
  FilePen,
  FileSearch,
  FileText,
  FolderSearch,
  ListChecks,
  Loader2,
  LogIn,
  Plug,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  TrendingUp,
  WifiOff,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DownloadButton } from "@/components/draft-preview";
import { Markdown } from "@/components/markdown";
import { Button, buttonVariants } from "@/components/ui/button";
import { describeStep, inputLines, type Block, type Problem, type Step, type Turn } from "@/lib/copilot";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";

const TOOL_ICON: Record<string, LucideIcon> = {
  search_tenders: Search,
  get_tender: FileSearch,
  check_eligibility: ShieldCheck,
  similar_awards: TrendingUp,
  find_licences: FileBadge,
  get_company_profile: Building2,
  submission_checklist: ListChecks,
  Write: FilePen,
  Edit: FilePen,
  Read: FileText,
  Glob: FolderSearch,
};

/**
 * Tool results arrive as the tool's own text, cut to 160 characters. The notice delimiters are
 * for the model, the profile is JSON, and file paths are the sandbox's; say them plainly.
 */
function cleanSummary(tool: string, summary: string): string {
  const text = summary
    .replace(/<\/?notice[^>]*>/g, "")
    .replace(/^Error:\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  const name = tool === "get_company_profile" ? text.match(/"name":\s*"([^"]+)"/)?.[1] : undefined;
  if (name) return `The profile of ${name}`;
  if (/^File created successfully at: /.test(text)) return "Saved to the drafts";
  return text.replace(/(^|\s)\/\S*\/drafts\//g, "$1drafts/");
}

function StepRow({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  const running = step.summary === undefined;
  const Icon = step.failed ? AlertTriangle : (TOOL_ICON[step.tool] ?? Wrench);
  const summary = step.summary ? cleanSummary(step.tool, step.summary) : "";
  const lines = inputLines(step.input);
  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full min-w-0 items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        {running ? (
          <Loader2 className="mt-[3px] size-3.5 shrink-0 animate-spin text-kopi" aria-label="Running" />
        ) : (
          <Icon className={cn("mt-[3px] size-3.5 shrink-0", step.failed ? "text-unmet" : "text-muted-foreground")} aria-hidden />
        )}
        {/* One line on wider screens: what Kopi did, then its result, cut to fit. A failure keeps its own line. */}
        <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !step.failed && "sm:flex-row sm:items-baseline sm:gap-2")}>
          <span className={cn("min-w-0 text-[13px] leading-5 break-words", !step.failed && "sm:max-w-[68%] sm:shrink-0 sm:truncate", !running && "text-foreground/85")}>
            {describeStep(step.tool, step.input, running)}
          </span>
          {summary && (
            <span className={cn("min-w-0 flex-1 truncate text-xs leading-5", step.failed ? "text-unmet" : "text-muted-foreground")}>
              {step.failed ? `Failed: ${summary}` : summary}
            </span>
          )}
        </span>
        <ChevronRight
          className={cn("mt-[3px] size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:text-muted-foreground", open && "rotate-90")}
          aria-hidden
        />
        <span className="sr-only">{open ? "Hide details" : "Show details"}</span>
      </button>
      {open && (
        <dl className="flex flex-col gap-2 border-t bg-muted/40 px-3 py-2.5 pl-9 text-xs">
          {lines.length === 0 && <p className="text-muted-foreground">No input.</p>}
          {lines.map(([key, value]) => (
            <div key={key} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="leading-relaxed break-words whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
          {summary && (
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground">result</dt>
              <dd className={cn("leading-relaxed break-words", step.failed && "text-unmet")}>{summary}</dd>
            </div>
          )}
        </dl>
      )}
    </li>
  );
}

function FileCard({
  name,
  title,
  sessionId,
  saving,
  onOpen,
}: {
  name: string;
  title?: string;
  sessionId: string | null;
  saving: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-kopi-soft">
        <FileText className="size-4 text-kopi" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-[13px] font-medium">{title || "Draft written"}</p>
        <p className="truncate text-xs text-muted-foreground">{name}</p>
      </div>
      {saving || !sessionId ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={onOpen}>
            Open
          </Button>
          <DownloadButton sessionId={sessionId} name={name} size="icon-sm" variant="ghost" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- problems, as designed states

type ProblemActions = { onRetry: () => void; onNew: () => void; onSignIn: () => void; doc: string | null };

const BROWSE = [
  { href: "/search", label: "Search tenders" },
  { href: "/licences", label: "Look up licences" },
  { href: "/submissions", label: "Submissions" },
];

function Reason({ detail }: { detail: string }) {
  const [open, setOpen] = useState(false);
  if (!detail) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? "Hide the reason" : "Show the reason"}
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs leading-relaxed break-words text-muted-foreground">{detail}</p>}
    </div>
  );
}

function ProblemCard({ problem, actions }: { problem: Problem; actions: ProblemActions }) {
  const retry = (
    <Button variant="outline" size="sm" onClick={actions.onRetry}>
      <RotateCcw /> Try again
    </Button>
  );
  const fresh = (
    <Button variant="outline" size="sm" onClick={actions.onNew}>
      <Plus /> New conversation
    </Button>
  );
  const views: Record<Problem["kind"], { icon: LucideIcon; title: string; body: React.ReactNode; buttons: React.ReactNode }> = {
    unavailable: {
      icon: Plug,
      title: "The copilot is being connected",
      body: (
        <>
          Kopi&apos;s assistant isn&apos;t switched on for this deployment yet, so it can&apos;t answer this one. Your question is kept here.
          Everything else works: search tenders, check eligibility, look up licences and track submissions.
        </>
      ),
      buttons: (
        <>
          {actions.doc && (
            <Link href={`/tender/?doc=${actions.doc}`} className={cn(buttonVariants({ size: "sm" }))}>
              Back to the tender <ArrowRight />
            </Link>
          )}
          {BROWSE.map((b) => (
            <Link key={b.href} href={b.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              {b.label}
            </Link>
          ))}
          <Button variant="ghost" size="sm" onClick={actions.onRetry}>
            <RotateCcw /> Try again
          </Button>
        </>
      ),
    },
    "turn-cap": {
      icon: ListChecks,
      title: "This conversation is full",
      body: <>A conversation holds 20 turns in this preview. Start a new one to keep going; the drafts from this one stay in the Drafts panel until you do.</>,
      buttons: fresh,
    },
    "day-cap": {
      icon: Clock,
      title: "That's today's conversations",
      body: <>The preview allows 12 new conversations a day. It resets at midnight, Singapore time. Search, eligibility and licences still work.</>,
      buttons: BROWSE.slice(0, 2).map((b) => (
        <Link key={b.href} href={b.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {b.label}
        </Link>
      )),
    },
    rate: {
      icon: Clock,
      title: "Kopi needs a moment",
      body: <>Too many requests arrived at once. Wait a minute, then try again.</>,
      buttons: retry,
    },
    "signed-out": {
      icon: LogIn,
      title: "You've been signed out",
      body: <>Your access has expired. Sign in again with your access code to keep going.</>,
      buttons: (
        <Button variant="default" size="sm" onClick={actions.onSignIn}>
          <LogIn /> Sign in again
        </Button>
      ),
    },
    expired: {
      icon: Clock,
      title: "This conversation has ended",
      body: <>Kopi no longer holds this conversation. Start a new one; you can ask the same question there.</>,
      buttons: fresh,
    },
    agent: {
      icon: AlertTriangle,
      title: "Kopi couldn't finish this answer",
      body: <>Something went wrong while Kopi was working. Anything it wrote before that is above.</>,
      buttons: retry,
    },
    "cut-off": {
      icon: WifiOff,
      title: "The answer was cut off",
      body: <>The connection closed before Kopi finished. What arrived is above.</>,
      buttons: retry,
    },
    network: {
      icon: WifiOff,
      title: "Kopi couldn't be reached",
      body: <>Check your connection, then try again.</>,
      buttons: retry,
    },
  };
  const view = views[problem.kind];
  const Icon = view.icon;
  return (
    <div role="status" className="flex flex-col gap-3.5 rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-background">
          <Icon className="size-4 text-kopi" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 pt-px">
          <p className="text-[14px] font-medium">{view.title}</p>
          <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{view.body}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:pl-11">{view.buttons}</div>
      <div className="sm:pl-11">
        <Reason detail={problem.detail} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one turn

type Group = { kind: "text"; text: string } | { kind: "steps"; steps: Step[] } | { kind: "file"; name: string };

/** Adjacent tool calls read as one quiet list of steps. */
function grouped(blocks: Block[]): Group[] {
  const out: Group[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.kind === "step") {
      if (last?.kind === "steps") last.steps.push(block.step);
      else out.push({ kind: "steps", steps: [block.step] });
    } else out.push(block.kind === "text" ? { kind: "text", text: block.text } : { kind: "file", name: block.name });
  }
  return out;
}

/** A long request (the tender page's actions are deliberately precise) shows four lines until opened. */
const LONG_MESSAGE = 220;

export function UserMessage({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_MESSAGE;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[85%] rounded-lg bg-muted px-3.5 py-2 sm:max-w-[80%]">
        <p className={cn("text-[14px] leading-relaxed break-words whitespace-pre-wrap", long && !open && "line-clamp-4")}>{text}</p>
      </div>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="px-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          {open ? "Show less" : "Show the whole request"}
        </button>
      )}
    </div>
  );
}

export function AssistantTurn({
  turn,
  sessionId,
  titles,
  onOpenFile,
  actions,
}: {
  turn: Turn;
  sessionId: string | null;
  titles: Map<string, string>;
  onOpenFile: (name: string) => void;
  actions: ProblemActions;
}) {
  const groups = grouped(turn.blocks);
  const streaming = turn.status === "streaming";
  const last = turn.blocks[turn.blocks.length - 1];
  const waiting = streaming && (!last || last.kind === "file" || (last.kind === "step" && last.step.summary !== undefined));
  const steps = turn.blocks.filter((b) => b.kind === "step").length;
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group, i) =>
        group.kind === "text" ? (
          <Markdown key={i} text={group.text} className="text-[15px] leading-[1.6]" />
        ) : group.kind === "steps" ? (
          <ul key={i} className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card" aria-label="What Kopi did">
            {group.steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        ) : (
          <FileCard
            key={i}
            name={group.name}
            title={titles.get(group.name)}
            sessionId={sessionId}
            saving={streaming}
            onOpen={() => onOpenFile(group.name)}
          />
        ),
      )}
      {waiting && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin text-kopi" aria-hidden />
          {turn.blocks.length === 0 ? "Kopi is starting" : "Thinking"}
        </p>
      )}
      {turn.problem && <ProblemCard problem={turn.problem} actions={actions} />}
      {turn.status === "stopped" && <p className="text-xs text-muted-foreground">Stopped. Anything Kopi wrote before that is above.</p>}
      {turn.status === "done" && (turn.cost !== undefined || steps > 0) && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {[turn.cost !== undefined && usd(turn.cost), steps > 0 && `${steps} ${steps === 1 ? "step" : "steps"}`].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}
