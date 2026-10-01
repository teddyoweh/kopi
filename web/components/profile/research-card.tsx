"use client";

import { AlertCircle, Check, ChevronRight, ExternalLink, Globe, Loader2, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

import { useApi } from "@/components/kopi-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Profile, ProfileDraft, ProfileSource } from "@/lib/api";
import { cn } from "@/lib/utils";

type Run = { status: "idle" | "running" | "done" | "error"; steps: string[]; result?: string };

const KIND: Record<ProfileSource["kind"], string> = { website: "Website", register: "Register", gebiz: "GeBIZ" };

/** What each profile field is called on the form, for the sources list. */
export const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  uen: "UEN",
  summary: "What the company does",
  capabilities: "Capabilities",
  past_work: "Past work",
  gra_registrations: "GRA supply heads",
  bca_registrations: "BCA workheads",
  licences_held: "Licences held",
  bizsafe_level: "bizSAFE level",
  value_band_sgd: "Contract values",
};

const hostOf = (url: string) => {
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Whether a quote came from the company's own site, rather than a directory or a news page. */
const ownSite = (source: ProfileSource, website: string | null | undefined) =>
  !source.url || !website || hostOf(source.url).endsWith(hostOf(website)) || hostOf(website).endsWith(hostOf(source.url));

/** What a filled field's tag says: where the research found it, the register over the site. */
export function sourceLabel(draft: ProfileDraft, field: string): string {
  const sources = draft.sources.filter((s) => s.field === field);
  const kinds = new Set(sources.map((s) => s.kind));
  if (kinds.has("register")) return field === "name" ? "From ACRA" : "From the register";
  if (kinds.has("gebiz")) return "From GeBIZ";
  return sources.some((s) => ownSite(s, draft.profile.website)) || !sources.length ? "From the website" : "From the web";
}

function Sources({ draft }: { draft: ProfileDraft }) {
  const [open, setOpen] = useState(false);
  if (!draft.sources.length && !draft.pages.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-fit items-center gap-1 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Where each field came from
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {open && (
        <ul className="flex flex-col gap-2 rounded-xl bg-muted/60 px-3.5 py-3 text-[12.5px]">
          {draft.sources.map((source, i) => (
            <li key={i} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-muted-foreground">
                {FIELD_LABEL[source.field] ?? source.field} · {source.kind === "website" && !ownSite(source, draft.profile.website) ? "Web" : KIND[source.kind]}
                {source.kind === "website" && !source.verified && " · not checked word for word"}
              </span>
              <span className="break-words">
                {source.kind === "website" ? `“${source.text}”` : source.text}
                {source.url && (
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-kopi hover:underline">
                    {new URL(source.url).pathname === "/" ? "home page" : new URL(source.url).pathname}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </span>
            </li>
          ))}
          <li className="text-muted-foreground">
            Read {draft.pages.length} page{draft.pages.length === 1 ? "" : "s"}
            {draft.awards ? `, and ${draft.awards} GeBIZ award${draft.awards === 1 ? "" : "s"} on data.gov.sg` : ""}.
          </li>
        </ul>
      )}
    </div>
  );
}

/**
 * The company's website, and the button that has Kopi fill the profile from it: the site itself,
 * the registers its UEN opens, and the GeBIZ contracts it has won. Nothing is saved until the
 * person reviews the form and saves it.
 */
export function ResearchCard({
  website,
  onWebsite,
  profile,
  onDraft,
}: {
  website: string;
  onWebsite: (website: string) => void;
  profile: Profile;
  onDraft: (draft: ProfileDraft) => void;
}) {
  const api = useApi();
  const [run, setRun] = useState<Run>({ status: "idle", steps: [] });
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const abort = useRef<AbortController | null>(null);
  const running = run.status === "running";

  async function fill() {
    if (!api || !website.trim() || running) return;
    abort.current = new AbortController();
    setRun({ status: "running", steps: [] });
    setDraft(null);
    try {
      await api.researchProfile(
        { website: website.trim(), profile },
        (event) => {
          if (event.type === "step" && event.text) setRun((r) => ({ ...r, steps: [...r.steps, event.text!] }));
          if (event.type === "error") setRun((r) => ({ ...r, status: "error", result: event.text ?? "Kopi couldn't read that website." }));
          if (event.type === "done" && event.draft) {
            setDraft(event.draft);
            onDraft(event.draft);
            setRun((r) => ({ ...r, status: "done", result: event.text ?? "Filled. Review it, then save." }));
          }
        },
        abort.current.signal,
      );
    } catch (error) {
      setRun((r) => ({ ...r, status: "error", result: error instanceof Error ? error.message : "Kopi couldn't read that website." }));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="website"
            value={website}
            onChange={(e) => onWebsite(e.target.value)}
            onKeyDown={(e) => {
              // The profile is one form; Enter here fills it from the website instead of saving it.
              if (e.key !== "Enter") return;
              e.preventDefault();
              void fill();
            }}
            placeholder="yourcompany.com.sg"
            inputMode="url"
            autoComplete="url"
            className="pl-9"
            aria-label="Company website"
          />
        </div>
        <Button type="button" onClick={() => void fill()} disabled={!api || !website.trim() || running} className="shrink-0">
          {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {running ? "Kopi is reading…" : "Fill with Kopi"}
        </Button>
      </div>

      {run.status !== "idle" && (
        <ol className="flex flex-col gap-1.5 text-[13px]" aria-live="polite">
          {/* Once it is done the steps fold away: the result line and the sources say what they found. */}
          {run.status !== "done" &&
            run.steps.map((step, i) => {
              const current = running && i === run.steps.length - 1;
              return (
                <li key={i} className={cn("flex items-start gap-2", current ? "text-foreground" : "text-muted-foreground")}>
                  {current ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-kopi" aria-hidden /> : <Check className="mt-0.5 size-3.5 shrink-0 text-met" aria-hidden />}
                  <span className="min-w-0 break-words">{step}</span>
                </li>
              );
            })}
          {running && !run.steps.length && (
            <li className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-kopi" aria-hidden /> Starting
            </li>
          )}
          {run.status === "done" && (
            <li className="flex items-start gap-2 font-book text-foreground">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-kopi" aria-hidden />
              {run.result}
            </li>
          )}
          {run.status === "error" && (
            <li className="flex items-start gap-2 text-unmet">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {run.result}
            </li>
          )}
        </ol>
      )}
      {draft && <Sources draft={draft} />}
    </div>
  );
}
