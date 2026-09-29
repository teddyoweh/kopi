"use client";

import { Check, ChevronDown, Plus, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { useKopi } from "@/components/kopi-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/lib/api";
import { SEEDED_PROFILES } from "@/lib/profiles";
import { cn } from "@/lib/utils";

type Registration = NonNullable<Profile["gra_registrations"]>[number];
type Mode = "unknown" | "none" | "some";

const modeOf = (value: unknown[] | null | undefined): Mode => (value == null ? "unknown" : value.length ? "some" : "none");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const BIZSAFE = [
  { value: null, label: "We don't know yet" },
  { value: "1", label: "Level 1" },
  { value: "2", label: "Level 2" },
  { value: "3", label: "Level 3" },
  { value: "4", label: "Level 4" },
  { value: "Star", label: "Star" },
] as const;

/** "3", "Level 3" and "level star" are the same level to the backend (kopi.eligibility.bizsafe_label). */
function bizsafeValue(level: string | null | undefined): string | null {
  if (!level) return null;
  const text = level.trim().toLowerCase().replace(/^level\s*/, "");
  return text === "star" ? "Star" : text;
}

// ---------------------------------------------------------------- controls

function Segmented<T extends string | null>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-full bg-muted p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 rounded-full px-3 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              selected ? "bg-card font-book text-foreground ring-1 ring-black/[0.06]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[13px] font-book">
            {label}
          </label>
        ) : (
          <p className="text-[13px] font-book">{label}</p>
        )}
        {hint && <p className="text-[13px] leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** The shared Input's look, for the textareas beside it. */
const areaClass =
  "w-full min-w-0 rounded-md border border-input bg-card px-3 text-base leading-5 transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-kopi/50 focus-visible:ring-3 focus-visible:ring-kopi/12 aria-invalid:border-destructive md:text-sm";

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={onClick} aria-label={label}>
      <X />
    </Button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} className="-ml-1 w-fit px-1.5 text-muted-foreground">
      <Plus /> {label}
    </Button>
  );
}

function TextList({ values, onChange, placeholder, addLabel, noun }: { values: string[]; onChange: (values: string[]) => void; placeholder: string; addLabel: string; noun: string }) {
  return (
    <div className="flex flex-col gap-2">
      {values.map((value, i) => (
        <div key={i} className="flex items-start gap-1">
          <textarea
            value={value}
            rows={1}
            aria-label={`${noun} ${i + 1}`}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value.replace(/\n/g, " ") : v)))}
            className={cn(areaClass, "min-h-9 resize-none py-[7px] [field-sizing:content]")}
          />
          <RemoveButton label={`Remove ${noun.toLowerCase()} ${i + 1}`} onClick={() => onChange(values.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton label={addLabel} onClick={() => onChange([...values, ""])} />
    </div>
  );
}

function RegistrationList({
  rows,
  onChange,
  codePlaceholder,
  gradePlaceholder,
  noun,
}: {
  rows: Registration[];
  onChange: (rows: Registration[]) => void;
  codePlaceholder: string;
  gradePlaceholder: string;
  noun: string;
}) {
  const set = (i: number, patch: Partial<Registration>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.length > 0 && (
        <div className="hidden grid-cols-[minmax(0,1fr)_7rem_2rem] gap-1 px-0.5 text-xs text-muted-foreground sm:grid">
          <span>Code</span>
          <span>Grade</span>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_2rem] items-center gap-1 sm:grid-cols-[minmax(0,1fr)_7rem_2rem]">
          <Input
            value={row.code}
            aria-label={`${noun} ${i + 1} code`}
            placeholder={codePlaceholder}
            onChange={(e) => set(i, { code: e.target.value.toUpperCase() })}
            className="tabular-nums"
          />
          <Input
            value={row.grade ?? ""}
            aria-label={`${noun} ${i + 1} grade`}
            placeholder={gradePlaceholder}
            onChange={(e) => set(i, { grade: e.target.value.toUpperCase() || null })}
            className="tabular-nums"
          />
          <RemoveButton label={`Remove ${noun} ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton label={`Add a ${noun}`} onClick={() => onChange([...rows, { code: "", grade: null }])} />
    </div>
  );
}

const MODE_TEXT: Record<Mode, (thing: string) => string> = {
  unknown: (thing) => `Kopi marks checks that need ${thing} as Unknown, and never guesses.`,
  none: (thing) => `You hold none. Kopi marks checks that need ${thing} as Not met.`,
  some: () => "Kopi checks each tender against these.",
};

/** Unknown (null), none ([]) or a list: three different answers, each chosen explicitly. */
function Known({
  label,
  thing,
  mode,
  onMode,
  children,
  invalid,
}: {
  label: string;
  thing: string;
  mode: Mode;
  onMode: (mode: Mode) => void;
  children: React.ReactNode;
  invalid?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Segmented<Mode>
        label={label}
        value={mode}
        onChange={onMode}
        options={[
          { value: "unknown", label: "We don't know yet" },
          { value: "none", label: "None" },
          { value: "some", label: "We hold these" },
        ]}
      />
      <p className="text-[13px] text-muted-foreground">{MODE_TEXT[mode](thing)}</p>
      {mode === "some" && children}
      {mode === "some" && invalid && <p className="text-[13px] text-unmet">{invalid}</p>}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-5 rounded-xl border bg-card p-5 sm:p-7 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-medium tracking-[-0.01em]">{title}</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- the form

type Lists = { gra: Registration[]; bca: Registration[]; licences: string[] };
type Modes = { gra: Mode; bca: Mode; licences: Mode };

const cleanText = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);
const cleanRegs = (rows: Registration[]) =>
  rows.filter((r) => r.code.trim()).map((r) => ({ ...r, code: r.code.trim(), grade: r.grade?.trim() || null }));

const modesOf = (p: Profile): Modes => ({ gra: modeOf(p.gra_registrations), bca: modeOf(p.bca_registrations), licences: modeOf(p.licences_held) });

/** The rows behind each list, kept while the answer is "unknown" or "none" so switching back restores them. */
const listsOf = (p: Profile): Lists => ({
  gra: p.gra_registrations?.length ? p.gra_registrations : [{ code: "", grade: null }],
  bca: p.bca_registrations?.length ? p.bca_registrations : [{ code: "", grade: null }],
  licences: p.licences_held?.length ? p.licences_held : [""],
});

function ProfileForm({
  saved,
  seed,
  onSave,
  onReset,
}: {
  saved: Profile;
  seed: Profile | undefined;
  onSave: (profile: Profile) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<Profile>(saved);
  const [modes, setModes] = useState<Modes>(() => modesOf(saved));
  const [lists, setLists] = useState<Lists>(() => listsOf(saved));
  const [justSaved, setJustSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const listed = (kind: keyof Modes, clean: unknown[]) => (modes[kind] === "unknown" ? null : modes[kind] === "none" ? [] : clean);
  const built: Profile = {
    ...draft,
    name: draft.name.trim(),
    summary: draft.summary.trim(),
    uen: draft.uen?.trim() || null,
    capabilities: cleanText(draft.capabilities ?? []),
    past_work: cleanText(draft.past_work ?? []),
    gra_registrations: listed("gra", cleanRegs(lists.gra)) as Profile["gra_registrations"],
    bca_registrations: listed("bca", cleanRegs(lists.bca)) as Profile["bca_registrations"],
    licences_held: listed("licences", cleanText(lists.licences)) as Profile["licences_held"],
  };

  const emptyList = (kind: keyof Modes, label: string) =>
    modes[kind] === "some" && !(built[kind === "gra" ? "gra_registrations" : kind === "bca" ? "bca_registrations" : "licences_held"] ?? []).length
      ? `Add at least one ${label}, or choose None.`
      : null;
  const problems = {
    name: built.name ? null : "The company needs a name.",
    summary: built.summary ? null : "A sentence on what the company does; Kopi matches tenders against it.",
    gra: emptyList("gra", "supply head"),
    bca: emptyList("bca", "workhead"),
    licences: emptyList("licences", "licence"),
  };
  const valid = Object.values(problems).every((p) => !p);
  const dirty = !same(built, saved);
  const fromSeed = seed ? !same(saved, seed) : false;

  const setField = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setJustSaved(false);
  };
  const setMode = (kind: keyof Modes, mode: Mode) => {
    setModes((m) => ({ ...m, [kind]: mode }));
    setJustSaved(false);
  };
  const setList = <K extends keyof Lists>(kind: K, value: Lists[K]) => {
    setLists((l) => ({ ...l, [kind]: value }));
    setJustSaved(false);
  };

  function save() {
    if (!valid) return;
    onSave(built);
    setJustSaved(true);
  }

  const band = draft.value_band_sgd ?? {};
  const bandInput = (key: "min_sgd" | "max_sgd", label: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`band-${key}`} className="text-xs text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">S$</span>
        <Input
          id={`band-${key}`}
          inputMode="numeric"
          value={band[key] != null ? band[key]!.toLocaleString("en-SG") : ""}
          placeholder="Any"
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "");
            setField("value_band_sgd", { ...band, [key]: digits ? Number(digits) : null });
          }}
          className="pl-9 tabular-nums"
        />
      </div>
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      <Section title="Company" description="Who is bidding. Kopi reads every tender against this.">
        <Field label="Name" htmlFor="name">
          <Input id="name" value={draft.name} onChange={(e) => setField("name", e.target.value)} aria-invalid={Boolean(problems.name)} />
          {problems.name && <p className="text-[13px] text-unmet">{problems.name}</p>}
        </Field>
        <Field
          label="UEN"
          htmlFor="uen"
          hint="Optional. With a UEN, the live service checks GRA, BCA, bizSAFE and ACRA's public registers itself."
        >
          <Input
            id="uen"
            value={draft.uen ?? ""}
            placeholder="e.g. 201912345K"
            onChange={(e) => setField("uen", e.target.value.toUpperCase() || null)}
            className="max-w-xs tabular-nums"
          />
        </Field>
        <Field label="What the company does" htmlFor="summary" hint="Two or three sentences. Search and fit start from this.">
          <textarea
            id="summary"
            value={draft.summary}
            rows={4}
            onChange={(e) => setField("summary", e.target.value)}
            aria-invalid={Boolean(problems.summary)}
            className={cn(areaClass, "resize-y py-2 leading-relaxed")}
          />
          {problems.summary && <p className="text-[13px] text-unmet">{problems.summary}</p>}
        </Field>
      </Section>

      <Section title="Work" description="What you can deliver, and what you have delivered.">
        <Field label="Capabilities" hint="One per line, in your own words.">
          <TextList
            values={draft.capabilities ?? []}
            onChange={(v) => setField("capabilities", v)}
            placeholder="e.g. School and campus cleaning"
            addLabel="Add a capability"
            noun="Capability"
          />
        </Field>
        <Field label="Past work">
          <TextList
            values={draft.past_work ?? []}
            onChange={(v) => setField("past_work", v)}
            placeholder="e.g. Cleaning for 11 primary schools"
            addLabel="Add past work"
            noun="Past work"
          />
        </Field>
        <Field label="Contract values you bid for" hint="Optional. Kopi uses it to judge fit, not to hide tenders.">
          <div className="grid max-w-sm grid-cols-2 gap-3">
            {bandInput("min_sgd", "From")}
            {bandInput("max_sgd", "Up to")}
          </div>
        </Field>
      </Section>

      <Section title="Registrations" description="GeBIZ tenders name GRA supply heads and BCA workheads, each at a grade.">
        <Field label="GRA supply heads" hint="Government Registration of suppliers, e.g. EPU/SER/46 at S4.">
          <Known label="GRA supply heads" thing="a GRA registration" mode={modes.gra} onMode={(m) => setMode("gra", m)} invalid={problems.gra}>
            <RegistrationList rows={lists.gra} onChange={(v) => setList("gra", v)} codePlaceholder="EPU/SER/46" gradePlaceholder="S4" noun="supply head" />
          </Known>
        </Field>
        <Field label="BCA workheads" hint="Building and Construction Authority, e.g. CW01 at B2.">
          <Known label="BCA workheads" thing="a BCA registration" mode={modes.bca} onMode={(m) => setMode("bca", m)} invalid={problems.bca}>
            <RegistrationList rows={lists.bca} onChange={(v) => setList("bca", v)} codePlaceholder="CW01" gradePlaceholder="B2" noun="workhead" />
          </Known>
        </Field>
      </Section>

      <Section title="Licences and safety" description="Licences a tender may require, and your bizSAFE level.">
        <Field label="Licences held" hint="As the issuing agency names them, e.g. Cleaning Business Licence.">
          <Known label="Licences held" thing="a licence" mode={modes.licences} onMode={(m) => setMode("licences", m)} invalid={problems.licences}>
            <TextList
              values={lists.licences}
              onChange={(v) => setList("licences", v)}
              placeholder="e.g. Cleaning Business Licence"
              addLabel="Add a licence"
              noun="Licence"
            />
          </Known>
        </Field>
        <Field
          label="bizSAFE level"
          hint={
            bizsafeValue(draft.bizsafe_level)
              ? "Kopi compares this with the level a tender asks for."
              : "Kopi marks bizSAFE requirements as Unknown until you set a level."
          }
        >
          <Segmented<string | null>
            label="bizSAFE level"
            value={bizsafeValue(draft.bizsafe_level)}
            options={BIZSAFE}
            onChange={(v) => setField("bizsafe_level", v)}
          />
        </Field>
      </Section>

      <div
        className={cn(
          "flex flex-col gap-3 rounded-2xl border bg-card px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:rounded-full sm:py-2 sm:pr-2 sm:pl-5",
          // It floats at the foot of the panel only while there is something to save.
          (dirty || confirmReset) && "sticky bottom-4 z-10 shadow-float",
        )}
      >
        <div className="flex min-h-8 items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
          {dirty ? (
            <span className="font-book text-foreground">Unsaved changes</span>
          ) : justSaved ? (
            <span className="flex items-center gap-1.5 font-book text-met">
              <Check className="size-4" aria-hidden /> Saved in this browser
            </span>
          ) : fromSeed ? (
            "Edited from the seeded profile, saved in this browser."
          ) : (
            "The seeded profile, as Kopi ships it."
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {confirmReset ? (
            <>
              <span className="text-[13px] text-muted-foreground">Replace your edits with the seed?</span>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setConfirmReset(false);
                  onReset();
                }}
              >
                Reset
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {seed && (fromSeed || dirty) && (
                <Button type="button" variant="ghost" onClick={() => setConfirmReset(true)} className="text-muted-foreground">
                  <RotateCcw /> Reset to seed
                </Button>
              )}
              {dirty && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDraft(saved);
                    setModes(modesOf(saved));
                    setLists(listsOf(saved));
                  }}
                >
                  Discard
                </Button>
              )}
              <Button type="submit" disabled={!dirty || !valid} className="px-3">
                Save profile
              </Button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}

/** The active profile, as a Linear-style picker in the top bar. */
function BiddingAs() {
  const { profiles, profile, setProfile } = useKopi();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Bidding as ${profile.name}. Change the active profile`}
        className="inline-flex h-8 max-w-[13rem] items-center gap-1.5 rounded-full border bg-card pr-2.5 pl-3.5 text-[13px] transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 sm:max-w-xs"
      >
        <span className="hidden shrink-0 text-muted-foreground sm:inline">Bidding as</span>
        <span className="truncate font-book">{profile.name}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Bidding as</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={profile.id} onValueChange={(id: string) => setProfile(id)}>
            {profiles.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id} className="py-1.5">
                {p.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProfileView() {
  const { profile, saveProfile } = useKopi();
  const seed = SEEDED_PROFILES.find((p) => p.id === profile.id);
  // A reset replaces the saved profile from outside the form; the key starts the form afresh from it.
  const [resets, setResets] = useState(0);
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Company profile"
        actions={<BiddingAs />}
        description="Kopi checks every tender against the active profile. Unknown and none are different answers: unknown leaves a check as Unknown, none marks it Not met."
      />
      <ProfileForm
        key={`${profile.id}:${resets}`}
        saved={profile}
        seed={seed}
        onSave={saveProfile}
        onReset={() => {
          if (!seed) return;
          saveProfile(seed);
          setResets((n) => n + 1);
        }}
      />
    </div>
  );
}
