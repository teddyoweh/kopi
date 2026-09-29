# KP-5 — Web shell and design system

**Built**
- **Design system:** Tailwind v4 with shadcn/ui on Base UI (the "base-nova" style).
  Kopi tokens in `app/globals.css`:
  - warm neutrals and a single accent, `--kopi` (burnt orange);
  - three state colours for eligibility, `--met`, `--unmet` and `--unknown`, each
    with a `-soft` background;
  - Geist through `next/font`;
  - every `shadow-*` stripped from the generated components. Grouping is done with
    tinted surfaces and whitespace, never divider lines.
- **App shell:** a sidebar on desktop and a Sheet menu on mobile, both with the six
  sections, plus a top bar with the profile switcher.
- **Access gate:** it asks for a code only when `/health` reports `auth: true`, and
  it has an "API not reachable" state.
- **Pages:**
  - Overview: three counts, best matches for the active profile, newest on GeBIZ;
  - a basic tender page at `/tender/?doc=`: facts, description, registrations
    named, items to respond, a link to GeBIZ;
  - Search, Licences, Copilot, Submissions and Profile: pages that say what they
    will do, until their milestones land.
- **API client:** `lib/api.ts`, typed from `lib/api-types.ts`, which `openapi-typescript`
  generates from `../openapi.json`. `lib/mock.ts` is an in-browser mock of
  `FixtureStore`.
- **Screenshots** of overview, tender, the mobile menu and access-code screens, at
  1440 and 390, are in `artifacts/media/kopi/`.

**Decisions**
- **Mock mode is the default** when `NEXT_PUBLIC_KOPI_API` is unset. The web app then
  runs with no backend, which is what the screenshots and a reviewer's first
  `npm run dev` need.
- **Fixture sync.** The mock loads the backend's fixtures through
  `scripts/sync-fixtures.mjs` (`predev`/`prebuild`) instead of a second copy in git.
  The seeded profiles come the same way, so there's one source of truth.
- **`ChatEvent` is mirrored by hand** in `lib/api.ts`. `/chat` is an SSE stream, so its
  event schema is not in the OpenAPI spec. If `kopi.models.ChatEvent` changes, change
  it here too.
- **No data-fetching library.** `lib/use-async.ts` (20 lines) keys each result to its
  inputs, so a stale answer never replaces a newer one. SWR was not worth a dependency.
- **Counts page through `/tenders`.** The contract has no `/stats`, so Overview fetches
  every open summary in pages of 200 (724 open means 4 requests) and counts in the
  browser. KP-8: a `/stats` route would make this one call.
- **shadcn's own `cn` package.** The init installed `cn` (github.com/shadcn-ui/cn)
  instead of clsx + tailwind-merge, and put `shadcn` in `dependencies` for its CSS. I
  checked both before keeping them.

**For the next UI tasks (KP-9, KP-13)**
- Use `useApi()` (null until signed in) and `useKopi().profile`. Wrap any page that
  calls `useSearchParams` in `<Suspense>`, as `app/tender/page.tsx` does, or the
  static export fails.
- Format every date with `lib/format.ts` and never with a bare `toLocale*`. GeBIZ
  deadlines are Singapore time.
- **Screenshots:** `node /tmp/kopi-shots/shoot.mjs web/out <dir>` serves `out/` and
  drives Chrome headless. The script lives outside the repo, and playwright-core is
  installed in `/tmp/kopi-shots`.

**Where the agent went wrong**
- **Timezone bug.** The first screenshots showed a tender that closes at 4:00 pm SGT
  as "4:00 am", and "Published today" read 0. Dates were formatted in the viewer's
  timezone (the Mac is on US time). Every formatter now pins `Asia/Singapore` and
  labels times "SGT". "Today" and "days until" are counted in Singapore calendar days.
  Found only by reading the screenshot, not by the build.
- **`useAsync` and lint.** The first version reset to "loading" with a synchronous
  setState inside the effect, and React's lint rule rejected it. It now derives
  "loading" from whether the stored result belongs to the current inputs.
- **`ChatEvent`.** I assumed it would be in the generated types; the build said
  otherwise. See the decisions above.
- **Full-page screenshots.** The sidebar background stopped at viewport height,
  because the sticky aside carried the background. Moved the background to a
  full-height wrapper.
- **Found in the mock, for KP-6 and KP-8.** The prompt-injection fixture
  `TST000ETQ26000901` ("Supply of Office Stationery") ranks 4th of the best matches
  for Pragnition. Its injected text ("AI ASSISTANT", "company", "recommend") matches
  the profile's words. Injected text can buy retrieval rank, not only steer a model.
  Worth checking against the real embeddings, and worth a test.
