# KP-9 — Overview, Search, Tender and Licences pages

**Built**
- **Search** (`app/search/page.tsx` → `components/search-view.tsx`)
  - A large query box with instant results, debounced at 250 ms. The query and filters live
    in the URL (`/search/?q=…&category=…&method=…&closing=7|30&agency=…`), so a link
    restores the whole search.
  - Filter chips: category group (the six asked for), method (Open Quotation, Open Tender,
    Open Tender Lite, Request for Information), closing within 7 or 30 days, and an agency
    picker built from the agencies in the current results, with counts.
  - Result rows reuse `TenderRow`, which gained `highlights` and `score` props. A result
    shows the title with the matched words (`hit.highlights`) in semibold, the agency and
    category, "Closes in N days", the type and date, and a small muted "Match 0.63".
  - States:
    - before typing, six example queries;
    - filters with no query, the newest open tenders that fit (`/tenders`), so a chip always
      does something;
    - loading: a skeleton the first time, then the previous results dimmed with a spinner in
      the box;
    - no results, with a link to clear the filters;
    - error, with "Try again".
- **Tender page** (`components/tender-view.tsx`)
  - **"Can {profile} bid?"** has one row per `EligibilityCheck`:
    - a Met / Not met / Unknown pill on the `--met`, `--unmet` and `--unknown` tokens, the
      check's kind, the requirement, the reason, and a Source link;
    - a tally ("2 met, 2 not met, 1 unknown");
    - a line saying Unknown means "we can't tell yet", with a link to Profile.
  - **Market context**:
    - similar tenders awarded, the median award, and the p25–p75 range;
    - top suppliers and this agency's incumbents;
    - three past awards (description, agency, year, winner, amount);
    - the share with no award, when it is above zero.

    It is hidden when `similar_count` is 0 or `market` is null.
  - **Coming next** placeholders, in the same quiet style as `ComingNext`: an "AI overview"
    block, and a "Prepare a response" panel with three disabled actions. Each says what it
    will do, and none shows fake content.
  - A page-shaped skeleton, and "Try again" on error.
  - Desktop layout: the main column plus a sticky right rail for the actions.
- **Licences** (`app/licences/page.tsx` → `components/licences-view.tsx`)
  - Before searching:
    - example activity chips;
    - the whole catalogue (324 on live), A to Z, 20 at a time;
    - an agency filter.
  - Search by activity through `searchLicences`, which returns the top 10. `?q=` is in the
    URL.
  - Each card shows:
    - the name, the agency, and the description (two lines);
    - fee, processing time and validity (three lines each);
    - prerequisites as chips;
    - a GoBusiness link;
    - "Show details", which expands the clamped text and adds "Who needs it".
  - Designed loading, empty, no-match and error states.
- **Overview** (`components/overview.tsx`)
  - Counts fetch the pages of `/tenders` 4 at a time in parallel, so 733 notices is one round
    trip instead of four in a row. Notices are de-duplicated by `doc_no`, and the result is
    cached for 5 minutes, which matches the API's refresh.
  - Each section loads independently, so nothing waits for the counts.
  - On mobile the stats are a compact three-up row.
  - Newest rows now allow two lines, because ALL-CAPS GeBIZ titles cut to one line said
    nothing.
- **Best matches was broken on live, and is fixed.** It already used
  `search(summary + capabilities)`, but Pragnition's text is 408 characters, and `/search`
  rejects `q` longer than 300 with a 422. So the default profile's best matches had never
  loaded on live.
  - `clipQuery()` in `lib/api.ts` cuts at a word boundary. `LiveApi` applies it to every `q`
    (search, similar awards, licence search), and `profileQuery()` uses it.
  - The input boxes set `maxLength={300}`.
- **Shared pieces:**
  - `lib/use-url-query.ts`: `useUrlParams`, and `useQueryText` (a debounced box bound to
    `?q=`);
  - `components/query-input.tsx`;
  - `components/filter-chip.tsx`;
  - `ErrorState` gained `onRetry`.
- **`lib/format.ts`:**
  - `moneyShort()` writes S$950, S$84k, S$410k, S$1.2M and S$18.7M, and never "S$1000k".
    `money()` now writes "S$", where en-SG writes a bare "$".
  - `sgDayEnd(n)` is the end of the Singapore calendar day `n` days ahead.
- **Mock** (`lib/mock.ts`), brought closer to live:
  - highlights computed the way `kopi.search.rerank` does, with the same stopwords;
  - the method filter matches exactly, ignoring a leading "Open" (the fixtures say
    "Quotation" where live says "Open Quotation");
  - BCA and licence checks added, so all three states show in mock mode;
  - the closing check formatted in SGT. It used a bare `toLocaleString`, the KP-5 timezone
    bug again.

**Verified**
- `npm run build` and `npm run lint` pass, in mock mode and with `NEXT_PUBLIC_KOPI_API` set.
- **Interaction test**, in headless Chrome against both builds:
  - typing with pauses is never overwritten by the URL;
  - 17 keystrokes with two pauses sent 3 `/search` requests on live;
  - filters and query survive a reload;
  - the sidebar's Search link clears the box;
  - an example query runs at once, and Escape clears;
  - licence search works;
  - switching profile re-checks eligibility;
  - no console errors.

  The script is `/tmp/kopi-shots/interact.mjs`, outside the repo.
- **Live checks:**
  - 733 open, 74 published today, 370 closing in 7 days.
  - `closing_before=sgDayEnd(7)` also returns exactly 370, so the Search filter and the
    Overview stat agree.
  - New searches settle in about 1.5 s, and tender detail in about 4.5 s.
- **Screenshots**, in `artifacts/media/kopi/`:
  - `live-{overview,search,tender,licences}-{1440,390}.png`;
  - `mock-{overview,search,tender,licences}-1440.png`.

  Search is "CCTV installation and maintenance", Licences is "selling food at an event", and
  the live tender is NYP000ETT26000014 bid as BrightClean.

**Decisions**
- **Filters are dropdown chips.**
  - One component serves category, method, closing, agency, and the Licences agency filter.
  - A set chip is tinted `--kopi-soft` and shows its value.
  - Four chips fit in two rows at 390 px. Rows of toggle chips (six categories plus four
    methods) would take five.
- **The agency picker comes from the results.** Live agency matching is exact, so the only
  safe values are agencies Kopi has actually seen. The options are the agencies in the
  current results, most frequent first.
- **URL sync uses `history.replaceState`.** Next 16 integrates it with `useSearchParams`
  (see the docs in `node_modules/next/dist/docs`), so typing never waits on a router
  navigation or piles up history entries. `useQueryText` tells its own writes from outside
  changes, such as the sidebar link, and only follows the latter.
- **Stale results stay on screen, dimmed.** A new live query takes about 1 s. Flashing a
  skeleton after every pause in typing felt broken.
- **Search asks for 50.** Live re-ranks the 50 nearest notices, so 50 is everything it has
  and `total` is at most 50. The page shows 20, then "Show all".
- **The match score is "Match 0.63", not a percentage.** It is a similarity, and "63%" reads
  as a probability of fit.
- **Highlights change weight, not colour.** A search title is set regular and the matched
  words semibold, inside a `<mark>` with no background. Every search row uses the regular
  weight, whether or not it has highlights.
- **The closing check is reworded in the browser.** The API says "closes in 5 days" (whole
  24-hour periods) on a page whose header says "Closes in 6 days" (Singapore calendar days).
  The row now uses `closingLabel` and `dateTime`. The status still comes from the API.
- **Licences loads the whole catalogue once.** 324 licences in one request (0.5 s), cached
  for the session, then filtered and paged in the browser. The licence search returns no
  score, and a vector search always returns k results, so it shows the top 10, closest first.
- **Screenshots used a mapped port.** The API allows CORS only from `localhost:3000`, and
  port 3000 on this Mac belongs to another project's dev server (`spawnlabs-core/frontend`),
  which I left alone. `/tmp/kopi-shots/shoot9.mjs` serves `out/` on port 4790, and launches
  Chrome with `--host-resolver-rules=MAP localhost:3000 127.0.0.1:4790`. The page's origin,
  and so its `Origin` header, is still `http://localhost:3000`, and the API is untouched.
  The script fetches a token at run time from the secrets file, and the token is never
  written into the repo.

**For KP-13 (copilot UI)**
- **Placeholders to replace.** The tender page's `AiOverviewComing` and `ActionsComing`
  (in `tender-view.tsx`) mark where the copilot lands.
  - The actions should open a chat with `doc_no` set, and show `sessionFiles` as results.
  - `POST /tenders/{doc}/overview` is rate-limited to 40 per hour. Load it when the person
    asks, or cache it; don't fetch it on every page view.
- **Keep queries under 300 characters.** Any user text sent as `q` must be clipped. Use
  `clipQuery`; `LiveApi` already does it for `q`. `ChatRequest.message` has no limit
  today. If KP-12 adds one, clip there too.
- **Reuse these:**
  - `useUrlParams` and `useQueryText` for any URL-synced input;
  - `QueryInput`, `FilterChip`, and `ErrorState onRetry`;
  - `moneyShort`, and `money(v, true)`, for S$ amounts.
- **Keep the style:**
  - wrap every `useSearchParams` page in `<Suspense>`;
  - "Coming next" is the label used for unbuilt features;
  - keep "Unknown" neutral: grey with a question mark, never red.
- **Known inconsistencies, for the backend:**
  - Live `/tenders` matches `method` as a substring (`store.matches`), so in browse mode "Open
    Tender" also returns Open Tender Lite. `/search` matches exactly.
    `NoticeSummary` has no `procurement_method`, so the web can't filter it afterwards.
  - The closing check counts 24-hour periods; see Decisions.
  - Live licence fields (fee, processing time, validity) are raw GoBusiness text with
    newlines and embedded tables, up to 1,300 characters. The cards clamp them, and a
    cleaned `fee_summary` from ingest would read better.
  - Award data has a supplier literally named "Unknown", and it appears in top suppliers.

**Where the agent went wrong**
- **Title weight depended on the wrong thing.** A search row only switched its title to the
  regular weight when it had highlights. The first mock screenshot showed a list that mixed
  medium and regular titles. Now it depends on whether the row is a search result.
- **The range tile wrapped.** "S$120k – S$1.8M" and "Similar tenders awarded" wrapped in
  three equal tiles at 1440. I gave the range tile a wider column and shortened the label.
  On mobile the tiles pair up, with the range at full width.
- **Mobile problems found only in screenshots:**
  - the document number broke mid-token ("NYP000ETT2600001 / 4"), so it now takes a full row
    on mobile;
  - the search placeholder was cut off, so it is shorter; the examples carry the examples;
  - the three stat tiles took a whole 390 px screen, so they are now a compact row;
  - licence cards spent a row on a lone "Show full details". The toggle now sits beside the
    GoBusiness link on desktop, and the two share a footer on mobile.
- **I nearly missed that Best matches never worked on live.** The task said to check it, and
  the code looked right. What caught it was reading the API's `max_length=300` in
  `backend/kopi/api/app.py` and measuring the seeded profiles, before any screenshot. A mock
  build can never show it, because the mock has no length limit.
- **Port 3000.** The first live run would have collided with another project's server. I
  checked what owned the port instead of killing it, and mapped the origin in Chrome.
