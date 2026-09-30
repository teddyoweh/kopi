# 02 — Decisions

Each decision names what I picked, what I rejected, and why. Agents append to this
file when they make a decision the plan did not.

## D1 — A web copilot, not a CLI report
**Picked:** a web app with four parts (overview, permits and licences, drafting, submissions).
**Rejected:** v1, a CLI that writes an HTML triage report (`plan-v1-cli.md`).
**Why:** triage is the first ten minutes of a bid; the hours go into eligibility,
licences and documents. A reviewer also understands a working app faster than a
report. The v1 discipline carries over: rules before model, verified evidence, thin
slices that work end to end.

## D2 — NeedleDB as the vector store, run as one service on Modal
**Picked:** NeedleDB (my own FAISS-based vector DB with a Pinecone-shaped API), served
by `needledb serve` in a single Modal container with a Volume, pinned to a GitHub commit.
Three indexes: `notices`, `awards`, `licences`, with metadata filters (agency,
category, closing date, method, status).
**Rejected:** Pinecone/Qdrant (another account and bill, nothing to show); NeedleDB
embedded in the API process (then ingest and API would both write one directory).
**Why:** one writer, many readers. NeedleDB's scoped keys give least privilege for free:
the ingest job holds a write key, the API holds a read key, the agent holds neither.

## D3 — Qwen3-Embedding-0.6B for embeddings
**Picked:** `Qwen/Qwen3-Embedding-0.6B` — Apache 2.0, 1024 dims, 32K context, runs on CPU.
**Rejected:** OpenAI `text-embedding-3-large` (paid, sends every notice to a third
party); Qwen3-Embedding-4B/8B (better, but need a GPU on the query path); BGE-small,
NeedleDB's local default (fast, weaker).
**Why:** on MTEB Multilingual it scores 64.33 against text-embedding-3-large's 58.93
(model card, 29 Sep 2026), it is free, and 0.6B is small enough to embed a query on
the API container's CPU with no cold GPU in the way. Bulk indexing runs on a Modal GPU.
Queries use the model's instruction prompt (`Instruct: …\nQuery: …`); documents do not.
We check the choice on our own data: a labelled query set over the awards corpus,
Qwen3-0.6B vs BGE-small vs BM25 (see `evals/`).

## D4 — Claude Agent SDK with an in-process MCP server
**Picked:** the Claude Agent SDK (Python) with Kopi's tools exposed as an SDK MCP server:
`search_tenders`, `get_tender`, `check_eligibility`, `similar_awards`,
`find_licences`, `get_company_profile`, `submission_checklist`.
**Rejected:** a hand-written tool loop on the Messages API.
**Why:** the SDK gives the agent loop, streaming, session resume and file tools; the
MCP boundary makes every capability the agent has explicit and reviewable in one file.

## D5 — The agent runs in a Modal Sandbox, authenticated by a Claude OAuth token
**Picked:** one Modal Sandbox per chat session. `CLAUDE_CODE_OAUTH_TOKEN` comes from a
Modal Secret. Allowed tools: Kopi MCP tools plus Read/Write/Edit/Glob inside
`/workspace`. No Bash, no WebFetch, no WebSearch. The sandbox holds no database key and
no Modal credential; its tools call the Kopi API with a short-lived per-session token.
`ANTHROPIC_API_KEY` works as a drop-in instead of the OAuth token.
**Why:** tender text is untrusted input. If a notice carries an injected instruction,
the worst the agent can do is read other public tenders and write a file in its own
sandbox.

## D6 — Rules before model
Eligibility (closing date, GRA supply head and financial grade against tendering
capacity, BCA workhead and grade, licences held) is deterministic code with a reason
for every result, and `unknown` when the company profile does not say. The model
explains and drafts; it does not decide who is eligible.

## D7 — Every quote is verified
The tender overview and the copilot cite notice text as evidence. Each quote is checked
as a normalised substring of the source before it is shown; unverified quotes are
labelled and the overview's recommendation is capped at "maybe".

## D8 — Static Next.js front end, FastAPI on Modal behind it
**Picked:** Next.js (App Router, TypeScript, Tailwind, shadcn/ui), statically exported
and published on unv.run; all server work in one FastAPI app on Modal.
**Why:** no secret can reach the browser bundle; the front end is files; one backend.

## D9 — Behind an access code, linked back to GeBIZ
GeBIZ notices say their content may not be republished. Kopi indexes public notices
to help suppliers prepare bids, the purpose GeBIZ names, and keeps the app behind a
shared access code rather than on the open web. Every tender links to its GeBIZ
page. The same gate rate-limits the copilot, which runs on a personal Claude token.

## D10 — No contact details, ever
The GeBIZ scraper drops the "who to contact" and "contact person" sections before a
notice is built. Named officials, emails and phone numbers never reach the index,
the model or the logs.

## D11 — No accounts
The company profile and the submissions tracker live in the browser (localStorage).
Accounts and a user database are out of scope for two days and would add a store of
personal data for no gain in the demo.

## D12 — Registration facts are committed; registers are looked up
*(KP-4)* The repo carries only reference facts, each with its source and date: GRA supply
heads and grades, BCA workheads and tendering limits, SSIC titles, and the licence rules.
Who holds what comes from live lookups by UEN: the GeBIZ Supplier Directory, the BCA
e-Directory, the bizSAFE export and ACRA open data. **Rejected:** mirroring those registers
into the repo, which most of their terms forbid and which would go stale.

## D13 — "Unknown" is never "no"
*(KP-4)* A profile that is silent, or a register that cannot be reached, gives `unknown`.
Only a register that answered, or a profile that states the fact, can give `unmet`.
Failed HTTP calls raise instead of parsing an error page as "holds nothing".

## D14 — Qwen3's generic query instruction, measured (KP-6)
**Picked:** `SEARCH_TASK = "Given a web search query, retrieve relevant passages that answer the query"`.
**Rejected:** a domain instruction written for Kopi, which scored nDCG@10 0.444 against 0.695.
**Why:** measured on 30 supplier queries over 12,052 awarded tenders (evals/RESULTS.md).
With the generic instruction, Qwen3-0.6B beats BGE-small (0.609) and BM25 (0.594), which
confirms D3 on our own data rather than MTEB alone.

## D15 — Kopi runs in the kryptonairc-lc Modal workspace
**Picked:** the kryptonairc-lc workspace, with every resource prefixed `kopi`.
**Why:** Teddy's call on 29 Sep. The personal teddyoweh workspace is paused on billing,
and he chose this one over the Spawn Labs workspaces. Kopi touches only its own `kopi*`
app, Volume and secrets there, so its keys and data share nothing with anything else in
the workspace.

## D16 — Hybrid search, measured (KP-8)
**Picked:** dense top 50 from NeedleDB, plus BM25 over titles at weight 0.05, plus a
fast path for tender numbers.
**Why:** on evals/, nDCG@10 goes 0.695 → 0.715 with P@10 unchanged; weights of 0.1–0.3
were no better. Keyword matches break ties toward exact words without overriding meaning.

## D17 — The Volume stores data; containers never hold files open on it (KP-8)
**Picked:**
- the embedding model baked into the API image;
- registry caches in /tmp;
- all notices as one bundle file on the Volume.

**Why:** `volume.reload()` fails while any file on the Volume is open, and memory-mapped
model weights count, so the API would never have seen a new ingest. Every file open on
the Volume is also a network round trip: 732 single-file reads took 37.5 s, and one
bundle takes 0.3 s.

## D18 — The copilot is locked down by construction (KP-11)
**Picked:** the agent's only built-in tools are Read, Write, Edit and Glob, fenced by a
PreToolUse hook to the workspace (writes to drafts/ only). Every other capability is a
read-only Kopi MCP tool that calls the API with the session's token, and anything not
pre-approved is denied (`dontAsk`).
**Why:** the agent reads untrusted notice text. The worst a hostile notice can make it
do is read other public tenders and write a markdown file in its own drafts folder.

## D19 — A sandbox per conversation, a scoped token per turn (KP-12)
**Picked:** a Modal Sandbox per chat session, with egress limited to Anthropic and the
Kopi API. Each turn is a fresh runner process with a 20-minute read-only token, and
drafts are copied to a Modal Dict after every turn.
**Rejected:** running the agent inside the API container. It would share the API's
secrets and network, and one stuck agent would stall search for everyone.
**Why:** the agent's blast radius is its own sandbox. It can't reach GeBIZ, GitHub or
anything but Claude and Kopi's read routes (all three blocked hosts were checked from
inside a live sandbox), and its token can't chat, read drafts or spend Claude on
overviews.
## D20 — The overview's evidence is checked by code, not trusted (KP-10)
**Picked:** the overview is a one-shot Claude call with no tools that returns structured
output. Code then checks every quote word for word, after normalising, against the
notice as the model saw it and the profile. Any miss caps BID at MAYBE and says so.
**Why:** the brief drives a bid or no-bid decision, so its evidence must be real. Over
10 live overviews, every verified quote was in the notice. Code can check that the words
exist, but not that they prove the point, so the UI calls a quote evidence, not proof.

## D21 — Claude Opus 5.5 for the copilot and overviews
**Picked:** `claude-opus-5-5`, overridable with `KOPI_MODEL`.
**Rejected:** Sonnet, which I first wrote into the plan without being asked; Teddy never
chose it.
**Why:** it is the current default model for new Claude work. Measured cost is about
$0.055 per overview and $0.18 per copilot turn, well within a demo budget, and overviews
are cached.

## D22 — Publish the static export, not the source
**Picked:** build `web/` locally with `.env.production` holding the live API origin, and
publish `web/out` as a plain static folder to kopi.unv.run.
**Why:** the hosting tool's build step can't find Node on this machine. A static export
needs no build on the host, is identical to what was QA'd, and can't carry a secret,
because the only variable baked in is the public API origin.

## D23 — The demo's voice is ElevenLabs, measured against an open model (KP-18)
**Picked:** ElevenLabs `eleven_multilingual_v2` with the premade voice "Will", generated
per line with the neighbouring lines as context, played at 1.07×.
**Rejected:** Kokoro-82M (open source, runs locally), which was the runner-up. macOS
`say` has no premium voices installed on this machine.
**Why:** the agent can't listen, so the comparison was measured on the opening line.
- Both takes transcribed cleanly through whisper large-v3-turbo.
- ElevenLabs had more pitch movement (8.9 against 8.3 semitones, p10–p90), which usually
  means a less flat read.
- ElevenLabs spoke at a more natural pace (157 against 145 words a minute).

Every line of the final voice was then transcribed back and checked against the script. That
check caught "git worktrees" being heard as "guide work trees", and the line was reworded.

## D24 — Session logs are published through a redacting exporter with a leak gate (KP-16, KP-23)
**Picked:** `scripts/export_logs.py` turns each raw agent transcript into JSONL plus a
readable Markdown copy.
- It keeps an allowlist of record types, and cuts long tool results (3,000 characters in
  the JSONL, 700 in the Markdown).
- It redacts key and token patterns, emails, phone numbers, private IPs, home paths,
  GeBIZ contact blocks, every literal value in the local secrets folder, and a personal
  strings list.
- It replaces the results of tools that carry account data with a note saying what was
  left out.
- Before writing a file it runs a leak gate over the decoded text: secret literals,
  personal strings, emails, Anthropic, GitHub and AWS key shapes, signed tokens and home
  paths. It refuses to write if anything survives.
- It is re-run before every push, and covered by 43 tests.

**Rejected:**
- Publishing the raw transcripts: they hold keys, tokens, access codes and personal data.
- Hand-editing the logs: they were exported 15 times as the build grew, and a manual pass
  would miss something one of those times.

**Why:** the brief asks for exported agent logs, and it grades security. A log that leaks
a key would undo the rest of the security story. The patterns alone were not enough.
Reading the first export found a debugging command that had printed another workspace's
secret names, so the privacy review's own shell calls are now left out as a block, with a
note saying so. The AI journal ("Caught while preparing these logs") has the details.

## D25 — Kopi looks like Linear (KP-25)
**Picked:** Linear's light theme and layout, with tokens sampled from Teddy's screenshot of
Linear Agent (`uploads/image.png`):
- a #efeff0 frame holding the sidebar, with the company as the workspace switcher and
  grouped, foldable sections;
- every page in an inset panel (12px radius, #e2e2e2 hairline) with its own top bar, which
  the page fills with its title, crumbs and actions;
- Inter, and Linear indigo #5e6ad2 as the one accent.

The panel, not the window, is the scroll container.
**Rejected:** the earlier flat, borderless look (warm neutrals, orange accent, Geist).
**Why:** Teddy asked for it on 29 Sep ("use Linear style ... for the UI"). A bid team uses
Kopi as a work tool, and Linear's density, hairlines and fixed frame read as one. The rule
against separator lines is replaced by Linear's hairlines on panels, cards and rows. There
are still no gradients, and the only shadow is a barely-there one on floating surfaces.


## D26 — Rounder, thinner, calmer (KP-29)
**Picked:** D25's Linear frame, made rounder and lighter:
- radii: controls 10px, cards 16px, the panel 18px, the composer 24px; buttons, chips,
  badges, filter chips and the search field are pills;
- type: list titles at weight 450 (Inter is variable), headings and search highlights at
  500, nothing heavier; Inter's optical-size axis sets large headings in its display cut;
  lucide icons at 1.75px instead of 2px;
- lines: hairlines lightened to #ebebed; no grey header strips; clickable lists use inset
  dividers that fade on hover, static lists use faint full-width ones;
- no boxes inside boxes: the properties rail, verdict tiles, market figures and notes are
  soft grey surfaces without borders; the overview's three stats are one card;
- GeBIZ titles written in capitals (162 of 727 open) are shown in title case by
  `web/lib/title-case.ts`, which keeps acronyms, reference numbers and names.

**Rejected:** sentence case for the capitals. It would lower every name in a title
("Valour Primary School", "Pasir Ris Park").
**Why:** Teddy, 29 Sep: "make the ui rounder, rn its very sloppy, make thin and clean modern
ui". The loudest mess on screen was a fifth of the titles shouting in capitals next to
nested bordered boxes, grey header strips and 600-weight text. The original title is still
one click away on GeBIZ.

## D27 — Bids, with a copilot that works them and a memory outside the sandbox (KP-31)
**Picked:**
- A tracked tender becomes a **bid**: a copilot session in bid mode on that tender, with a
  document shelf (its drafts plus the person's uploads) and a **bid memory**. The memory
  holds Kopi's notes and the person's, plus the bid's stage and next step. It is stored in
  the session store, outside the sandbox, and written into each turn's workspace.
- Search results get an insights call (`POST /search/insights`): eligibility summary,
  "why it matched" sentence and price band, fetched after the hits so search stays fast.

**Rejected:**
- Relying on the Claude transcript for continuity: a sandbox dies after 15 idle minutes
  and its transcript goes with it.
- A server-side bid database: user accounts and a user database are out of scope. The
  browser keeps which session belongs to which tender, as it already did for tracked
  tenders, and the API keeps the session's memory and files.
- Computing insights inside `/search`: it would make every search wait on N market
  lookups.

**Why:** Teddy, 29 Sep: "a copilot in the bid, start working, doing everything for you ...
document memory stuff all of that", and search cards "100x better". A bid team's work is
per tender and spans days. The memory is what lets the copilot pick a bid up again after
the sandbox has gone.

## D28 — Market context comes from the notice's stored vector (KP-32)
**Picked:** search cards, the tender page and the overview all look up past awards with
the notice's own vector as stored in NeedleDB, through `Store.market_for`. Bands are cached
per tender for five minutes and looked up in parallel. A batch waits at most 2 s, and a
card whose band isn't ready shows none.
**Rejected:** re-embedding a shorter title + agency + description text for every tender
view (the old `tender()`), and computing insights through `tender()` one tender at a time.
**Why:**
- 25 cards took 11.5–11.9 s on the deployed CPU embedder; they now take 0.8–1.2 s cold and
  3 ms cached.
- The stored vector is built from the fuller notice text and finds clearly closer awards
  (software-licence awards for a software-licensing tender, where the old text found
  transcription and insurance).
- One lookup everywhere means a card's price band always agrees with the tender page
  beside it. Market figures on tender pages changed after this deploy; 12 of 25 sampled
  medians moved by more than 25%.

## D29 — A bid is a chat with an artifacts panel, and drafts stream (KP-37, KP-38)
**Picked:**
- The bid page is two panes on one full-height page: the conversation on the left, and the
  bid's documents on the right as tabs (Plan, Questions, Matrix, Checklist, Outline, uploads,
  Memory, Tasks).
- Documents stream into their tab while the model writes them. The runner decodes the
  Write call's input from the SDK's partial stream events and sends `writing` events.

**Rejected:**
- The KP-35 rail and sheet: documents as a list, each opened over the page.
- Showing a document only when its Write completes: the model spends 20–40 s composing a
  document, and the panel sat empty through all of it.

**Why:** Teddy, 29 Sep: working a bid "should feel like ChatGPT / artifacts panel, same page,
clean". A probe of the real SDK showed the document's text arriving in `input_json_delta`
fragments long before the finished tool call. So the panel can type as the model writes,
which is what makes it feel like one.

## D30 — A workspace around the bids, worked out in the browser (KP-39 to KP-42)
**Picked:**
- **Home** is about the company's own work first:
  - your bids;
  - a 14-day strip of closings;
  - a get-started checklist ticked from what the person has actually done;
  - then the market.
- **An Inbox** derived from state that already exists: bid deadlines within 7 days, the
  next step in each bid's memory, bids not started, and notices published this week near the
  top of the company's search or a saved view's. Only read and done ids are stored.
- **The sidebar** carries your bids (stage ring, days left) and saved **Views** (search
  words and filters) with a count of what was published since each was last opened.
- **⌘K** opens a palette over semantic search, bids, licences and pages, with actions for
  the tender on screen.
- **One shortcut table** drives both the keys and the `?` sheet. Toasts give Undo for
  stopping a bid, removing a view and marking an item done.

**Rejected:**
- A notifications service or a stored feed. It would need accounts and a database, which are
  out of scope, and it could drift from the bids it describes.
- `cmdk` and a toast library. Neither needs a dependency at this size.
- Counting every hit a view's search returns: see the "match" rule below.

**Why:**
- Teddy, 30 Sep: "make the experience better and more platform feel".
- A platform is where the work lives and what tells you what changed. Everything shown is
  computed from the bids, their session memory and the same searches the rest of the app
  runs, so it is always true to them.
- A view's "match" is a hit within 0.12 of its best, and never below 0.30. On live data
  that turned a view counting 25 "new" matches (mostly manpower tenders) into the 2 that
  fit.
