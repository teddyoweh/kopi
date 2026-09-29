"use client";

import { ExternalLink, FileBadge, SearchX } from "lucide-react";
import { useMemo, useState } from "react";

import { FilterChip, type ChipOption } from "@/components/filter-chip";
import { useApi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { QueryInput } from "@/components/query-input";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { KopiApi, Licence } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { useQueryText, useUrlParams } from "@/lib/use-url-query";
import { cn } from "@/lib/utils";

/** The API's largest page of licences: the whole GoBusiness catalogue (~320) in one request. */
const CATALOGUE_LIMIT = 400;
const SEARCH_LIMIT = 10;
const PAGE = 20;

const EXAMPLES = ["Selling food at an event", "Security guards", "Cleaning offices", "Renovation works", "Importing medical devices"];

const catalogueCache = new WeakMap<KopiApi, Promise<Licence[]>>();

/** The catalogue sorted by name, fetched once per session: browsing back and forth is free. */
function catalogue(api: KopiApi): Promise<Licence[]> {
  let promise = catalogueCache.get(api);
  if (!promise) {
    promise = api.licences(CATALOGUE_LIMIT, 0).then((list) => [...list].sort((a, b) => a.name.localeCompare(b.name)));
    catalogueCache.set(api, promise);
    promise.catch(() => catalogueCache.delete(api));
  }
  return promise;
}

/** GoBusiness often starts the fee with its own label ("Fees: $16", "Fee\nA fee of $40…"). */
function cleanFee(fee: string): string {
  return fee.replace(/^\s*(?:(?:licence|permit|application|registration|certificate)\s+)?fees?\s*(?::|\n)\s*/i, "").trim();
}

function LicenceFact({ label, value, open }: { label: string; value: string; open: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm break-words whitespace-pre-line", !value && "text-muted-foreground", !open && "line-clamp-3")}>
        {value || "Not stated"}
      </dd>
    </div>
  );
}

function LicenceCard({ licence }: { licence: Licence }) {
  const [open, setOpen] = useState(false);
  const fee = cleanFee(licence.fee);
  const facts = [fee, licence.processing_time, licence.validity];
  const who = licence.who_needs_it && licence.who_needs_it !== licence.description ? licence.who_needs_it : "";
  const more = Boolean(who) || licence.description.length > 180 || facts.some((text) => text.length > 110 || text.split("\n").length > 3);
  const actions = (
    <>
      {more && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? "Show less" : "Show details"}
        </button>
      )}
      <a
        href={licence.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-sm font-medium text-kopi hover:underline"
      >
        {/gobusiness/i.test(licence.url) ? "View on GoBusiness" : "Official page"} <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </>
  );
  return (
    <li className="flex flex-col gap-3.5 rounded-xl bg-secondary p-4 sm:gap-4 sm:p-5">
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="leading-snug font-medium break-words">{licence.name}</h3>
          <p className="text-sm text-muted-foreground">{licence.agency}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-5 sm:flex">{actions}</div>
      </div>
      {licence.description && (
        <p className={cn("max-w-3xl text-sm break-words whitespace-pre-line text-muted-foreground", !open && "line-clamp-2")}>{licence.description}</p>
      )}
      <dl className="grid grid-cols-1 gap-3 rounded-lg bg-background p-3.5 sm:grid-cols-3 sm:gap-6 sm:p-4">
        <LicenceFact label="Fee" value={fee} open={open} />
        <LicenceFact label="Processing time" value={licence.processing_time} open={open} />
        <LicenceFact label="Validity" value={licence.validity} open={open} />
      </dl>
      {open && who && (
        <div className="flex max-w-3xl flex-col gap-1">
          <p className="text-xs text-muted-foreground">Who needs it</p>
          <p className="text-sm break-words whitespace-pre-line">{who}</p>
        </div>
      )}
      {licence.prerequisites.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Needs first</span>
          {licence.prerequisites.map((p) => (
            <span key={p} className="rounded-full bg-background px-2.5 py-0.5 text-xs font-medium">
              {p}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-row-reverse items-center justify-between gap-4 sm:hidden">{actions}</div>
    </li>
  );
}

function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-xl bg-secondary p-5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-1/2 bg-background" />
            <Skeleton className="h-3 w-1/3 bg-background" />
          </div>
          <Skeleton className="h-20 w-full bg-background" />
        </div>
      ))}
    </div>
  );
}

function LicenceList({ licences }: { licences: Licence[] }) {
  const [count, setCount] = useState(PAGE);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {licences.slice(0, count).map((licence) => (
          <LicenceCard key={licence.id} licence={licence} />
        ))}
      </ul>
      {count < licences.length && (
        <button
          type="button"
          onClick={() => setCount((n) => n + PAGE)}
          className="w-fit rounded-lg bg-secondary px-4 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent"
        >
          Show {Math.min(PAGE, licences.length - count)} more of {licences.length - count}
        </button>
      )}
    </div>
  );
}

function Browse({ api, attempt, onRetry, onPick }: { api: KopiApi; attempt: number; onRetry: () => void; onPick: (q: string) => void }) {
  const state = useAsync(() => catalogue(api), [api, attempt]);
  const [agency, setAgency] = useState<string | null>(null);
  const agencies = useMemo<ChipOption[]>(() => {
    const counts = new Map<string, number>();
    for (const l of state.data ?? []) counts.set(l.agency, (counts.get(l.agency) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, label: value, count }));
  }, [state.data]);
  const list = (state.data ?? []).filter((l) => !agency || l.agency === agency);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted-foreground">Try</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="h-8 rounded-full bg-secondary px-3.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-kopi"
          >
            {example}
          </button>
        ))}
      </div>

      <section aria-labelledby="catalogue" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 id="catalogue" className="text-base font-semibold tracking-tight">
              All licences
            </h2>
            <p className="text-sm text-muted-foreground">
              {state.status === "ready"
                ? `${list.length.toLocaleString("en-SG")} ${agency ? `from ${agency}` : "in the catalogue"}, A to Z.`
                : "The catalogue, A to Z."}
            </p>
          </div>
          <FilterChip
            label="Agency"
            anyLabel="Every agency"
            value={agency}
            options={agencies}
            onChange={setAgency}
            disabled={state.status !== "ready"}
          />
        </div>
        {state.status === "loading" && <CardsSkeleton />}
        {state.status === "error" && <ErrorState error={state.error} onRetry={onRetry} />}
        {state.status === "ready" &&
          (list.length ? (
            <LicenceList key={agency ?? ""} licences={list} />
          ) : (
            <EmptyState icon={FileBadge} title="No licences loaded yet">
              The catalogue is empty. It fills when the licence ingest runs.
            </EmptyState>
          ))}
      </section>
    </div>
  );
}

type Found = { q: string; licences: Licence[] };

export function LicencesView() {
  const api = useApi();
  const [params, update] = useUrlParams();
  const q = (params.get("q") ?? "").trim();
  const box = useQueryText(q, update);
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);

  const state = useAsync<Found | null>(
    async () => (api && q ? { q, licences: await api.searchLicences(q, SEARCH_LIMIT) } : null),
    [api, q, attempt],
  );
  // Keep the last answer on screen, dimmed, while the next one is on its way.
  const [shown, setShown] = useState<Found | null>(null);
  if (state.status === "ready" && state.data !== shown) setShown(state.data);
  const loading = Boolean(q) && state.status === "loading";

  return (
    <>
      <PageHeader
        title="Licences"
        description="The permits, licences and registrations an activity needs, from the GoBusiness licence directory."
      />
      <div className="flex flex-col gap-8">
        <QueryInput
          value={box.text}
          onChange={box.setText}
          onClear={() => box.commit("")}
          busy={loading && Boolean(shown)}
          label="Search licences by activity"
          placeholder="What will your company be doing?"
        />

        {!q ? (
          api ? (
            <Browse api={api} attempt={attempt} onRetry={retry} onPick={box.commit} />
          ) : (
            <CardsSkeleton />
          )
        ) : state.status === "error" ? (
          <ErrorState error={state.error} onRetry={retry} />
        ) : !shown ? (
          <CardsSkeleton count={3} />
        ) : (
          <section aria-label="Licences found" aria-busy={loading} className={cn("flex flex-col gap-4 transition-opacity", loading && "opacity-60")}>
            {shown.licences.length ? (
              <>
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {shown.licences.length === 1
                    ? `The licence closest to “${shown.q}”.`
                    : `The ${shown.licences.length} licences closest to “${shown.q}”, closest first.`}
                </p>
                <LicenceList key={shown.q} licences={shown.licences} />
              </>
            ) : (
              <EmptyState icon={SearchX} title={`No licence matches “${shown.q}”`}>
                Describe the activity rather than the licence name: what you will do, and where.
              </EmptyState>
            )}
          </section>
        )}
      </div>
    </>
  );
}
