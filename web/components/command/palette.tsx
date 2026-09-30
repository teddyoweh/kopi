"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  Briefcase,
  Building2,
  ExternalLink,
  FileBadge,
  FileText,
  Inbox,
  Keyboard,
  LayoutGrid,
  Link2,
  Loader2,
  Search,
  Sparkles,
  SquarePen,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { CommandDialog } from "@/components/command/surface";
import { useApi, useKopi } from "@/components/kopi-provider";
import { useStartBid } from "@/components/search/actions";
import { copilotHref } from "@/components/tender-ai";
import { tenderHref } from "@/components/tender-row";
import { Kbd } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toast";
import { clipQuery, type Licence, type Notice, type SearchResponse } from "@/lib/api";
import { bidHref, useBids } from "@/lib/bids";
import { closingLabel } from "@/lib/format";
import { useRecents } from "@/lib/recents";
import { keyLabel, SHORTCUTS, type Shortcut } from "@/lib/shortcuts";
import { DOC_NO, useKnownTitle } from "@/lib/submissions";
import { displayTitle } from "@/lib/title-case";

type Item = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** More text the filter matches besides the label: a doc number, an agency. */
  match?: string;
  meta?: string | null;
  /** Shown before `meta` on wider screens, and cut first when the row is tight (the agency). */
  detail?: string;
  keys?: string[];
  href?: string;
  run?: () => void;
};

type Group = { id: string; label: string; items: Item[] };

const DEBOUNCE_MS = 200;
const RECENT_LIMIT = 5;
const TENDER_LIMIT = 6;
const LICENCE_LIMIT = 3;
const NARROW = "(max-width: 639px)";

const GO_TO_ICONS: Record<string, LucideIcon> = {
  "/": LayoutGrid,
  "/inbox/": Inbox,
  "/copilot/": Sparkles,
  "/bids/": Briefcase,
  "/search/": Search,
  "/licences/": FileBadge,
  "/profile/": Building2,
};

const shortcut = (label: string) => SHORTCUTS.find((s) => s.label === label && (s.href || s.command))!;

function goItem(s: Shortcut): Item {
  return { id: `go-${s.href}`, label: s.label, icon: GO_TO_ICONS[s.href!] ?? LayoutGrid, keys: s.keys, href: s.href };
}

/**
 * The tender the page is about, fetched once per opening. Start bid needs the whole notice;
 * chosen before it lands, the action waits for it rather than doing nothing.
 */
function useContextNotice(doc: string | null) {
  const api = useApi();
  const [request] = useState(() => (api && doc ? api.tender(doc).then((d) => d.notice, () => null) : null));
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    let live = true;
    request?.then((n) => live && setNotice(n));
    return () => {
      live = false;
    };
  }, [request]);
  return useCallback((use: (notice: Notice) => void) => (notice ? use(notice) : void request?.then((n) => n && use(n))), [notice, request]);
}

type Found<T> = { q: string; list: T[] };

/** Tenders and licences for the query, 200 ms after typing stops. Each group keeps its last answer until the next lands. */
function useRemote(q: string) {
  const api = useApi();
  const [tenders, setTenders] = useState<Found<SearchResponse["hits"][number]> | null>(null);
  const [licences, setLicences] = useState<Found<Licence> | null>(null);
  useEffect(() => {
    if (!api || !q) return;
    let live = true;
    const timer = setTimeout(() => {
      api.search(q, { status: "open" }, TENDER_LIMIT).then(
        (r) => live && setTenders({ q, list: r.hits }),
        () => live && setTenders({ q, list: [] }),
      );
      api.searchLicences(q, LICENCE_LIMIT).then(
        (list) => live && setLicences({ q, list }),
        () => live && setLicences({ q, list: [] }),
      );
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [api, q]);
  const reset = useCallback(() => {
    setTenders(null);
    setLicences(null);
  }, []);
  return { tenders, licences, busy: Boolean(q) && (tenders?.q !== q || licences?.q !== q), reset };
}

/** One row. On a phone its meta goes under the label, so a title keeps most of the width. */
function Row({ item, id, active, onHover, onChoose }: { item: Item; id: string; active: boolean; onHover: () => void; onChoose: () => void }) {
  const Icon = item.icon;
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-active={active || undefined}
      onPointerMove={() => !active && onHover()}
      // A click must not take focus from the input.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onChoose}
      className="flex min-h-10 cursor-default items-center gap-3 rounded-lg px-3 py-1.5 text-[13.5px] font-book select-none data-active:bg-muted sm:h-10 sm:py-0"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
        <span className="min-w-0 truncate sm:flex-1">{item.label}</span>
        {!item.keys && item.meta && (
          <span className="flex min-w-0 gap-1 text-[12.5px] whitespace-nowrap text-muted-foreground sm:max-w-[45%] sm:shrink-0">
            {item.detail && (
              <>
                <span className="min-w-0 truncate">{item.detail}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className={item.detail ? "shrink-0" : "truncate"}>{item.meta}</span>
          </span>
        )}
      </div>
      {item.keys && (
        <span className="flex shrink-0 items-center gap-1">
          {item.keys.map((key) => (
            <Kbd key={key}>{keyLabel(key)}</Kbd>
          ))}
        </span>
      )}
    </div>
  );
}

/** A phone's input is too narrow for the whole placeholder. */
function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

function Body({ initialQuery, input, close, onShortcuts }: { initialQuery: string; input: React.RefObject<HTMLInputElement | null>; close: () => void; onShortcuts: () => void }) {
  const router = useRouter();
  const path = usePathname().replace(/\/$/, "");
  const params = useSearchParams();
  const { profiles, profile, setProfile } = useKopi();
  const bidActions = useStartBid();
  const { bids } = useBids();
  const recents = useRecents();
  const base = useId();
  const list = useRef<HTMLDivElement>(null);

  const [text, setText] = useState(initialQuery);
  // What the person moved to, by arrow or pointer; until then the first row is active.
  const [chosen, setChosen] = useState<string | null>(null);

  const q = clipQuery(text);
  const needle = q.toLowerCase();
  const typedDoc = q.toUpperCase().match(DOC_NO)?.[0] ?? null;
  const typedTitle = useKnownTitle(typedDoc ?? "");
  const contextDoc = path === "/tender" || path === "/bid" ? params.get("doc") : null;
  const withNotice = useContextNotice(contextDoc);
  const remote = useRemote(q);
  const narrow = useNarrow();

  const keep = (item: Item) => !needle || `${item.label} ${item.match ?? ""}`.toLowerCase().includes(needle);

  const copyLink = () =>
    navigator.clipboard.writeText(window.location.href).then(
      () => toast({ title: "Link copied", icon: Link2 }),
      () => toast({ title: "Couldn't copy the link", icon: Link2 }),
    );

  const context: Item[] = [];
  if (contextDoc) {
    const started = bidActions.started(contextDoc);
    if (path !== "/bid") {
      context.push(
        started
          ? { id: "ctx-bid", label: "Open bid", icon: Briefcase, href: bidHref(contextDoc) }
          : { id: "ctx-bid", label: "Start bid", icon: Briefcase, run: () => withNotice((n) => bidActions.start(n)) },
      );
    }
    context.push({ id: "ctx-ask", label: "Ask Kopi about this tender", icon: Sparkles, href: copilotHref(contextDoc) });
    if (path === "/bid") context.push({ id: "ctx-tender", label: "Open the tender page", icon: FileText, href: tenderHref(contextDoc) });
    context.push(
      { id: "ctx-gebiz", label: "View on GeBIZ", icon: ExternalLink, run: () => withNotice((n) => window.open(n.url, "_blank", "noopener,noreferrer")) },
      { id: "ctx-copy", label: "Copy link", icon: Link2, run: copyLink },
    );
  }

  const recent: Item[] = recents
    .filter((r) => r.doc_no !== contextDoc && r.doc_no !== typedDoc)
    .map((r) => ({
      id: `recent-${r.doc_no}`,
      label: displayTitle(r.title),
      icon: FileText,
      match: `${r.doc_no} ${r.agency}`,
      meta: closingLabel(r.closing),
      href: tenderHref(r.doc_no),
    }));

  const yourBids: Item[] = [...bids].reverse().map((b) => ({
    id: `bid-${b.doc_no}`,
    label: displayTitle(b.title),
    icon: Briefcase,
    match: `${b.doc_no} ${b.agency}`,
    meta: closingLabel(b.closing),
    href: bidHref(b.doc_no),
  }));

  const goTo = SHORTCUTS.filter((s) => s.group === "Go to").map(goItem);

  const actions: Item[] = [
    { ...goItem(shortcut("New chat with Kopi")), id: "new-chat", icon: SquarePen },
    ...profiles
      .filter((p) => p.id !== profile.id)
      .map((p) => ({
        id: `profile-${p.id}`,
        label: `Bid as ${p.name}`,
        icon: Building2,
        run: () => {
          setProfile(p.id);
          toast({ title: `Now bidding as ${p.name}`, icon: Building2 });
        },
      })),
    { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, keys: shortcut("Keyboard shortcuts").keys, run: onShortcuts },
  ];

  // Local groups first, filtered as you type; remote ones append below them as they land.
  const groups: Group[] = [
    typedDoc && {
      id: "doc",
      label: "Document number",
      items: [{ id: "doc-open", label: `Open ${typedDoc}`, icon: FileText, meta: typedTitle && displayTitle(typedTitle), href: tenderHref(typedDoc) }],
    },
    { id: "context", label: "This tender", items: context.filter(keep) },
    { id: "recent", label: "Recent", items: recent.filter(keep).slice(0, RECENT_LIMIT) },
    { id: "bids", label: "Your bids", items: yourBids.filter(keep).slice(0, RECENT_LIMIT) },
    { id: "go", label: "Go to", items: goTo.filter(keep) },
    { id: "actions", label: "Actions", items: actions.filter(keep) },
    q && {
      id: "tenders",
      label: "Tenders",
      items: (remote.tenders?.list ?? []).map(({ notice }) => ({
        id: `tender-${notice.doc_no}`,
        label: displayTitle(notice.title),
        icon: FileText,
        detail: notice.agency,
        meta: closingLabel(notice.closing),
        href: tenderHref(notice.doc_no),
      })),
    },
    q && {
      id: "licences",
      label: "Licences",
      items: (remote.licences?.list ?? []).map((licence) => ({
        id: `licence-${licence.id}`,
        label: licence.name,
        icon: FileBadge,
        meta: licence.agency,
        href: `/licences/?q=${encodeURIComponent(q)}`,
      })),
    },
    q && {
      id: "more",
      label: "Ask or search",
      items: [
        { id: "search-all", label: `Search all tenders for “${q}”`, icon: Search, href: `/search/?q=${encodeURIComponent(q)}` },
        { id: "ask", label: `Ask Kopi “${q}”`, icon: Sparkles, href: `/copilot/?ask=${encodeURIComponent(q)}` },
      ],
    },
  ].filter((g): g is Group => Boolean(g) && (g as Group).items.length > 0);

  const flat = groups.flatMap((g) => g.items);
  const starts = groups.map((_, g) => groups.slice(0, g).reduce((n, group) => n + group.items.length, 0));
  const found = flat.findIndex((item) => item.id === chosen);
  const activeIndex = found === -1 ? 0 : found;
  const active = flat[activeIndex];
  const optionId = (index: number) => `${base}-option-${index}`;

  function choose(item: Item) {
    close();
    if (item.run) item.run();
    else if (item.href) router.push(item.href);
  }

  function move(step: number) {
    if (!flat.length) return;
    const next = (activeIndex + step + flat.length) % flat.length;
    setChosen(flat[next]!.id);
    // The first row brings its group's label back into view with it.
    if (next === 0) list.current?.scrollTo({ top: 0 });
    else document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      choose(active);
    }
  }

  function onChange(value: string) {
    setText(value);
    setChosen(null);
    if (!value.trim()) remote.reset();
    list.current?.scrollTo({ top: 0 });
  }

  return (
    <>
      <Dialog.Title className="sr-only">Command palette</Dialog.Title>
      {contextDoc && (
        <div className="px-4 pt-3">
          <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 text-[12px] font-book text-muted-foreground tabular-nums">
            <FileText className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{contextDoc}</span>
          </span>
        </div>
      )}
      <div className="flex h-13 shrink-0 items-center gap-3 border-b px-5">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={input}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={narrow ? "Search or type a command…" : "Search tenders, bids and licences, or type a command…"}
          role="combobox"
          aria-expanded
          aria-controls={`${base}-list`}
          aria-activedescendant={active ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label="Search or run a command"
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        {remote.busy && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Searching" />}
        <Dialog.Close aria-label="Close" className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          <Kbd>esc</Kbd>
        </Dialog.Close>
      </div>
      <div
        ref={list}
        id={`${base}-list`}
        role="listbox"
        aria-label="Results"
        className="max-h-[60vh] scroll-py-2 overflow-y-auto overscroll-contain px-2 pt-1 pb-2"
      >
        {groups.map((group, g) => (
          <div key={group.id} role="group" aria-labelledby={`${base}-${group.id}`}>
            <div id={`${base}-${group.id}`} className="px-3 pt-3 pb-1 text-[12px] text-muted-foreground">
              {group.label}
            </div>
            {group.items.map((item, j) => (
              <Row
                key={item.id}
                item={item}
                id={optionId(starts[g]! + j)}
                active={starts[g]! + j === activeIndex}
                onHover={() => setChosen(item.id)}
                onChoose={() => choose(item)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="hidden h-9 shrink-0 items-center border-t border-border/70 px-5 text-[11.5px] text-muted-foreground sm:flex">↑↓ move · ↵ open · esc close</div>
    </>
  );
}

/** ⌘K: jump anywhere, act on the tender in view, or search tenders and licences. */
export function Palette({
  open,
  query,
  onOpenChange,
  onShortcuts,
}: {
  open: boolean;
  query: string;
  onOpenChange: (open: boolean) => void;
  onShortcuts: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <CommandDialog name="palette" open={open} onOpenChange={onOpenChange} initialFocus={input} className="top-2 w-[min(640px,calc(100vw-16px))] sm:top-[14vh]">
      <Body initialQuery={query} input={input} close={() => onOpenChange(false)} onShortcuts={onShortcuts} />
    </CommandDialog>
  );
}
