# 04 — Where the AI helped, where it failed, and how it was caught

Kopi was built in two days, starting 29 Sep 2026, by coding agents working inside Universe, my
agent workspace, on its Software Factory board (`artifacts/builds/kopi.json` in the
session). I set the goal and the stack, approved the plan, made the calls that needed a
person (the Modal workspace, the Claude credential), and read the results. The agents
wrote the code, the tests, the evals and these notes.

Every task's own account is in `planning/handoffs/<KEY>.md` under **Where the agent went
wrong**. This page pulls those together and sorts them by the thing that matters most:
*what caught the mistake*.

## How the work was organised

- **A plan first** (`00-brief.md`, `01-discovery.md`, `02-decisions.md`). The first plan,
  a CLI report (`plan-v1-cli.md`), was replaced after I asked for a web copilot on my own
  stack. Both plans are kept.
- **Milestones of three to five tasks.** Each task declared the files it owns, so agents
  could run in parallel in their own git worktrees without touching each other's work.
  Every task ends with a check command that exits non-zero on failure, and a handoff note.
- **One main agent, plus task agents staffed by the board.** A task that needed a fresh
  context (the web pages, the overview) went to a subagent with a precise brief, and the
  main agent closed it only after running the check and looking at the screenshots itself.
- **An independent reviewer agent read each milestone-1 task.** It reran the check from
  `main`, not the author's worktree, and filed `ok` or `concerns`. Concerns held the
  milestone until they were fixed. From milestone 2 on the board assigned no reviewer,
  so those tasks rest on their own tests, the retrieval eval and live runs against the
  deployed API. That is why the "caught only by running it for real" list below is the
  longest.
- **Research before code.** The data sources and the Claude Agent SDK were probed with
  real requests before anything was built (`planning/research/`).

## What the AI did well

- **Found and proved the data sources in minutes.**
  - GeBIZ's full Open tab and its JSF partial-ajax paging (723 of 724 open opportunities
    in 74 s).
  - data.gov.sg's 18,464 awards.
  - GoBusiness's 324 licences, reachable through an undocumented `RSC: 1` JSON response.
  - The GRA supply-head table from a PDF.
  - BCA's tendering limits, correcting third-party sites that had them wrong
    (S$105m / S$50m, not 90 / 40).
- **Ran real experiments instead of guessing.**
  - The retrieval eval (30 queries, 12,052 tenders, 1,546 pooled judgements).
  - The BM25 weight sweep.
  - The Qwen3 padding and ALL-CAPS hypotheses.
  - The int8 attempt.
  - The egress probe from inside a live sandbox.
- **Built security in, not on.**
  - The copilot has no Bash or web tools at all, and its file tools are fenced by a hook.
  - It runs in a sandbox whose egress reaches only Anthropic and the Kopi API (checked
    live: github.com and gebiz.gov.sg are blocked).
  - It holds a per-turn token that can read data but can't chat, read drafts or spend
    Claude.
  - Officials' contact details are dropped at scrape time.
- **Quality from reading its own output.** A large share of the UI fixes came from agents
  looking at their own screenshots at 1440 and 390, not from the build passing.

## Where it failed, grouped by what caught it

### Caught by the independent reviewer agent
The author's own check passed every time. The reviewer's rerun from `main` did not.
- **Auth bypass (KP-1).** With access codes set and no signing key, tokens were checked
  against an empty HMAC key, so anyone could forge one. The reviewer reproduced it. The
  app now refuses to start in that state.
- **Test fixtures never committed (KP-2).** An unanchored `data/` in `.gitignore`
  swallowed `backend/tests/data/`. "9 passed" was true only in a worktree that no longer
  existed. The same trap was about to swallow two other tasks' files.
- **A register's "no" overridden by the company's claim (KP-4).** When the bizSAFE
  register said "not listed" or "expired", eligibility fell back to the profile's own
  claim, so a company that *said* Level 3 would pass.
- **A clean-install build failure (KP-5).** This one traced to a package export map and a
  stale Turbopack cache. The version is now pinned.

### Caught by tests the agent wrote first
- **A 503 read as "not registered" (KP-4).** An unreachable BCA register would have
  parsed as "holds nothing", a confident wrong answer. The failure-path test caught it.
- **Stale status in search (KP-8).** Search could return a tender that had closed since
  the last ingest. A test with one notice dropped from the listing caught it.
- **An HTTP library mismatch (KP-11).** The test client uses `httpx2`, so errors escaped
  as exceptions instead of becoming tool errors. Production worked only by coincidence.

### Caught by the eval
- **The instruction that made the best model the worst (KP-6).** A domain-specific query
  instruction I would have signed off on made Qwen3 score nDCG@10 0.444, below BM25. The
  model's own generic instruction scores 0.695. Two other explanations were tested and
  ruled out before the instruction was blamed. Both variants stay in the eval.

### Caught only by running it for real (the fakes hid it)
- **Chunked stdout (KP-12).** Modal's sandbox stdout arrives in chunks, not lines; one
  chunk carried two events, so every second copilot event would have been dropped. The
  fake sandbox yielded tidy lines.
- **Volume reload silently failing (KP-8).** Model weights on the network volume held
  files open, so the API would never have seen a new ingest. The graceful fallback turned
  this into a warning. Proven fixed when the API went from 727 to 733 open without a
  redeploy.
- **37.5 s to list tenders (KP-8).** 732 separate file reads over a network filesystem.
  One bundle file now takes 0.31 s.
- **Best matches never loaded on live (KP-9).** Pragnition's profile text is longer than
  the API's 300-character query limit. The mock has no limit, so only the live build
  showed it.
- **Wrong container (KP-8, KP-12).** Twice, the previous deploy's container was still
  answering. Reading which code produced the response saved debugging code that was fine.

### Caught by reading screenshots
- **Timezone (KP-5).** A tender closing at 4:00 pm SGT showed as "4:00 am", because this
  laptop is on US time. Every date now pins Singapore.
- **Mock logic (KP-13).** The mock showed "BID 82" next to an unverified quote, and
  "Unknown" as a top supplier. Both contradict the real rules, which cap that case at
  MAYBE and exclude placeholder suppliers. The mock now obeys the same rules.
- **Layout and text faults:** a double period after a company name, a document number
  breaking mid-token at 390 px, a sentence built as "no a BCA registration", sticky bars
  painted mid-page.

### Caught by the person
- **Taste (KP-29).** The Linear pass (KP-25 to KP-27) matched the reference's tokens and
  passed every screenshot check, and Teddy still called it sloppy. The checks looked for
  faults (overflow, wrong dates, broken text), not for how the whole thing felt. The things
  he meant were:
  - 8px corners;
  - 500–600 weights;
  - grey header strips;
  - bordered boxes inside bordered cards;
  - a fifth of the titles in GeBIZ's capitals.

  The fix was rounder, lighter and flatter (D26), plus title-casing the capitals. The
  title-case rule was checked against all 727 real titles before any screen used it.

- **Scope (KP-31 to KP-36).** After the rounder UI, Teddy's next message redirected the work:
  "no. demos push ... cards on search results 100x better ... a copilot in the bid, start
  working, doing everything for you ... document memory". The agent stopped polishing the
  film and built the product: rich search cards and bids that the copilot works on its own.

### Caught by the product itself
- **Closing days (KP-11).** On its first live run, the copilot noticed that our
  eligibility rules said "closes today" for a tender closing tomorrow at 13:00, and said
  so in its answer. The rules counted 24-hour periods; they now count Singapore calendar
  days.

### Caught while preparing these logs (KP-16)
- **The raw transcripts were not publishable.** They carried the agent's private memory
  (as prompt snapshots), a Gmail search, secret *names* from another Modal workspace,
  a client's internal skill file and GeBIZ officers' names and phone numbers. The
  exporter keeps an allowlist of record types, masks by pattern and by literal value, and
  refuses to write if anything on the deny list survives.
- **The gate refused the first export**, on false alarms: JSON-escaped `\n@pytest.fixture`
  read as an email, and a name cut in half by truncation. Both fixed in the exporter.
- **Reading the output found what the patterns missed.** A debugging command had printed
  another workspace's secret names, and the command that wrote the local deny list still
  spelled out a personal detail inside its regex. The privacy review's own shell calls
  are now omitted as a block, with a note, because their output *is* the private
  material.
- **Over-redaction is a bug too.** The first "high-entropy secret" rule masked tender
  numbers and GeBIZ form ids, which would have made the logs unreadable. It now needs
  mixed case, digits, no dictionary words and real entropy, with tests for both sides.
- **Two decisions shared a number.** D12 and D13 were each used twice after a merge. The
  file is renumbered D1–D22 and the references updated.

### Caught by the real run (KP-36)
- **A title repeated as its own snippet.** On live data many GeBIZ descriptions are the
  title again, so the "why it matched" line repeated the card's title. The mock's rich
  descriptions hid this. The card now drops a snippet that adds nothing.
- **Steps that echoed themselves.** With a real agent, each remember step showed its note
  twice: once in the step's description and again in the tool's reply. The step now says
  "Saved to the bid memory".
- **What worked the first time, and is worth recording:** in a sandbox that had been
  deleted, the second turn restored its drafts, read the uploaded excerpt and the person's
  note, and caught a conflict between them (the ITT wants the Tenderer itself to hold S6).
  It then rewrote three documents. It also said the excerpt was labelled synthetic and
  should be checked against the real ITT.

### Caught by live data and screenshots (KP-40 to KP-42)
- **A view full of kitchen staff.** A saved view for "AI chatbot and knowledge base"
  counted 25 new matches. The Inbox then listed manpower tenders for kitchen assistants and
  receptionists. Vector search always returns its nearest 50, and past the first two hits
  the scores were 0.28 and below. The mock's 30 notices never showed it. A view's matches
  are now the hits within 0.12 of the best, never below 0.30. Measured on live data, that
  keeps 2 of 50 for the AI query, 3 for pest control and 5 for Pragnition's profile.
- **Two numbers for one thing.** Home's stat said 13 notices close within 7 days while the
  new deadline strip beside it said 8. The stat counted notices already past their deadline,
  and the strip stopped a day short. Both now count today plus seven days, the way Search's
  filter does.
- **A company name under the icons.** "BrightClean Services Pte. Ltd." ran under the
  sidebar's search and new-chat buttons. The sidebar is wider now and the name truncates.

### Caught by the person, again (Autopilot, KP-43 to KP-45)
- **The copilot did the work, then handed it back.** A real bid ended with `[placeholder]`s
  and "Person to make go/no-go call". I wanted it to "just do it all". The agents had built
  what the brief said, "Kopi prepares, the person decides", too literally. Autopilot makes the
  call and states its assumptions, and keeps for the person only what legally needs the
  company. The first live run went from start to *Ready to submit* in 4 min 39 s for US$2.25,
  with no one touching it.

### Mistakes in the agents' own reports
- **"A reviewer on every task" (KP-15).** The README and this journal first said an
  independent reviewer read every task. Reviewers ran only on milestone 1; the claim was
  corrected in KP-16 while cross-checking the board.
- **Overview and redeploy (KP-10).** The main agent reported that AI overviews would
  switch on "with no redeploy" once the Claude secret existed. That's wrong: the secret
  is attached at deploy time. Corrected on the build feed within minutes.
- **Invented registry codes (KP-1).** An agent invented plausible-looking registration
  codes (EPU/SER/03, EPU/FMS/01) for test fixtures. Another agent, building the real
  table from the GRA PDF, flagged that they don't exist.

## What the agents couldn't do

- **The Claude credential.** Creating `kopi-claude` needs a person's sign-in. It was missing
  for a day, and the live copilot answered with a designed 503. I found that out by starting a
  bid myself. The agent then ran `claude setup-token` so the only step left was mine. I pasted
  a token, and the first bid on the published site worked end to end: 240 s, US$0.39, all
  five documents.
- **Choosing whose money to spend.** My personal Modal workspace was paused on billing.
  The agents stopped and asked, and I chose the workspace.
- **A tool bug.** Universe's own build tool couldn't mark review concerns answered on
  finished tasks. The agent found the cause in the app's code, applied the same field
  the app would write, only for verified fixes, and reported the bug.

## Patterns worth keeping

1. **Run the reviewer's check from `main`.** Most "works for me" failures lived in
   the gap between a worktree and the repo.
2. **A fallback that turns a failure into a warning needs a test that the failure can't
   happen**, or it hides the failure indefinitely (the volume reload).
3. **Fakes are only as good as your knowledge of the real system.** Chunked stdout,
   stale containers, the 300-character limit: each passed its tests and failed live.
4. **Measure prompt text.** The most confident design choice in the build, the domain
   instruction, was the worst one, and only the eval showed it.
