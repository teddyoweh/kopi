# 03 — The plan, as executed

This is the plan I approved at 08:39 UTC on 29 Sep 2026, and what actually happened to it.
The live version is the Software Factory board in Universe (`artifacts/builds/kopi.json`):
every task has its owned files, dependencies, a check command that exits non-zero on
failure, and a handoff in [`handoffs/`](handoffs/). The first plan, a CLI report, is kept
in [`plan-v1-cli.md`](plan-v1-cli.md). I replaced it after deciding on a web copilot built on
my own stack ([D1](02-decisions.md)).

## The goal

A Singapore supplier's bid team reads every new GeBIZ opportunity, works out which ones it
is eligible for, chases the registrations and licences each needs, and drafts a submission
against a deadline. Kopi does that work alongside them. It covers four parts:

- **Overview:** semantic search, plus an AI overview per tender with verified quotes and
  market context.
- **Permits and licences:** deterministic eligibility gates and a licence explorer.
- **Drafting:** a Claude Agent SDK copilot with Kopi's own MCP tools, in a Modal sandbox.
- **Submissions:** a checklist built from the notice.

## The approach, unchanged

**Index first, agent second.** Kopi is a good search index over three public sources, with
deterministic eligibility rules on top. A Claude agent uses that index through a small set
of explicit tools. The model explains, ranks and drafts; code decides eligibility and
checks every quote the model cites. The architecture diagram and the reasoning are in
[`docs/architecture.md`](../docs/architecture.md) and [`02-decisions.md`](02-decisions.md).

## How the work ran

- **Milestones of three to five tasks.** Each task declared the paths it owns and the
  tasks it needs, so tasks with no overlap ran at the same time in separate git worktrees.
- **Four kinds of agent:**
  - the **main agent** (Claude Code, Claude Opus 5.5) planned, orchestrated and built
    most tasks;
  - **crew agents** took parallel tasks in milestone 1;
  - **subagents** with a fresh context built the web pages and the overview;
  - **reviewer agents** reread the milestone-1 tasks from `main`.
- **A task closed only on evidence:** its check passed, and for UI tasks the main agent
  read the screenshots at 1440 and 390 px itself.
- Every session is in [`../logs/`](../logs/INDEX.md).

| M | Task | What | Built by | Started (UTC) | Lines ± | Independent review |
|---|---|---|---|---|---|---|
| 1 | KP-1 | Contract: backend package, models, API routes on fixtures | main agent | 08:39 | +5,269 | concerns → fixed → ok |
| 1 | KP-2 | GeBIZ scraper: every open opportunity, contacts dropped | main agent | 08:43 | +642 | concerns → fixed → ok |
| 1 | KP-3 | Awards history and market context | main agent | 09:00 | +709 | ok |
| 1 | KP-4 | Permits, licences, registrations and eligibility gates | crew agent 1 | 08:50 | +5,768 | concerns → fixed → ok |
| 1 | KP-5 | Web shell and design system against the contract | crew agent 2 | 08:50 | +925 −130 | concerns → fixed → ok |
| 2 | KP-6 | Qwen3 embeddings and retrieval eval | main agent | 09:22 | +2,211 | — |
| 2 | KP-7 | NeedleDB and ingest on Modal | main agent | 09:15 | +2,294 | — |
| 2 | KP-19 | Deploy to Modal and run the first cloud ingest *(added)* | main agent | 10:34 | +72 −7 | — |
| 2 | KP-8 | Live API: search, tenders, eligibility, licences, auth | main agent | 10:42 | +835 −25 | — |
| 2 | KP-9 | Overview, search, tender and licences pages | subagent | 11:04 | +1,516 −102 | — |
| 3 | KP-11 | Agent: Claude Agent SDK runner and Kopi MCP tools | main agent | 11:32 | +770 −4 | — |
| 3 | KP-12 | Modal Sandbox sessions and streaming chat | main agent | 11:38 | +706 −20 | — |
| 3 | KP-10 | Tender overview with verified quotes | subagent | 11:39 | +978 −73 | — |
| 3 | KP-13 | Copilot, submissions and profile UI | subagent | 11:46 | +1,116 −50 | — |
| 4 | KP-14 | End-to-end on live data, QA and publish the app | main agent | 12:26 | +201 | — |
| 4 | KP-15 | README, architecture and CI | main agent | 12:35 | +335 | — |
| 4 | KP-16 | Redacted session logs, journal, cut list, public repo | main agent | 12:38 | | — |
| 4 | KP-20 | Live copilot proof once `kopi-claude` exists *(added)* | main agent | | | — |
| 5 | KP-17 | Demo script and screen footage | | | | |
| 5 | KP-18 | Natural voiceover, cut and render | | | | |

Line counts include fixtures, lockfiles and generated types. The review column is the
independent reviewer's verdict. Reviewers ran on milestone 1 only, and every one of their
four concerns was a real bug that the author's own check had passed
([04-ai-journal.md](04-ai-journal.md)).

## Milestones, and whether each goal held

1. **Contract and sources — done.** The contract was fixed, and every source works locally:
   - 723 of 724 open GeBIZ opportunities scraped in 74 s, with contact details dropped;
   - 18,464 award rows grouped into 12,052 tenders;
   - 324 GoBusiness licences, and the GRA and BCA tables;
   - eligibility gates on fixtures;
   - every API route served from fixtures;
   - the web shell running against the contract.
2. **Search on Modal — done.** Kopi runs on Modal:
   - NeedleDB serves 733 notices, 12,052 awards and 324 licences as Qwen3-0.6B vectors;
   - the 3-hourly refresh took the API from 727 to 733 open tenders with no redeploy;
   - a new search takes about 1 s and a repeated one 0.38 s;
   - the web pages run on live data.
3. **Copilot — done, with one part proven locally only.** Proven live:
   - the verified overview (with its extractive fallback);
   - the agent's MCP tools;
   - a sandbox per conversation, with egress limited to Anthropic and the Kopi API;
   - the scoped tokens and the SSE stream.

   The milestone question ("find IT tenders closing this month we're eligible for, then
   draft clarification questions") ran end to end against the live API from this Mac:
   $0.18 and a 14-question draft. The hosted run waits on one credential, tracked as KP-20.
4. **Ship — in progress:**
   - kopi.unv.run is published and QA'd at 1440 and 390;
   - the README, architecture and CI are done;
   - this task produces the logs, the journal, the cut list and the public repo.
5. **Demo film — next.**

## Where the plan changed, and why

| Planned | What happened | Why |
|---|---|---|
| Modal workspace `teddyoweh` | `kryptonairc-lc`, every resource prefixed `kopi` ([D15](02-decisions.md)) | My personal workspace was paused on billing. The agent stopped and asked; I chose the workspace. Deploying became its own task, KP-19, so nothing else waited on it. |
| Qwen3 with a query instruction written for tenders | Qwen3's generic search instruction ([D14](02-decisions.md)) | The eval: the domain instruction scored nDCG@10 0.444, the generic one 0.695. |
| BM25 over titles as a tie-breaker | Dense top 50 plus BM25 at weight 0.05 ([D16](02-decisions.md)) | A weight sweep: 0.695 → 0.715. Higher weights hurt. |
| Vectors and caches on the Volume | Model baked into the image; the Volume holds one data bundle; caches on local disk ([D17](02-decisions.md)) | Open model files blocked `volume.reload()`, and per-file reads made the tender list take 37.5 s. It now takes 0.31 s. |
| Overview always from Claude | Claude, with an extractive fallback when no credential is attached ([D20](02-decisions.md)) | The hosted credential isn't there yet, and the page should still be useful. |
| Model unspecified | Claude Opus 5.5 by default, overridable with `KOPI_MODEL` ([D21](02-decisions.md)) | The best model for evidence-checked drafting. An overview costs about $0.055. |
| Publish the web folder | Publish the built static export only ([D22](02-decisions.md)) | The publisher's own build couldn't find npm, and shipping only `out/` is safer anyway. |
| A reviewer on every task | Reviewers on milestone 1 only | The board stopped assigning them after milestone 1. From then on the evidence is each task's tests, the eval and live runs. |
| — | KP-20 added: the hosted copilot proof | It needs a Claude OAuth token only I can create (`claude setup-token`), so it's split out and shouldn't hold anything else. |

## What was verified, and how

- **Backend:** `cd backend && uv run pytest -q` runs with no network, Modal or Claude,
  using fixtures, fakes and NeedleDB's embedded engine. 271 tests, run in CI.
- **Web:** `cd web && npm run build && npm run lint` checks the static export. Browser
  interaction tests were run against both mock and live data.
- **Retrieval:** [`evals/RESULTS.md`](../evals/RESULTS.md) scores Qwen3-0.6B, BGE-small and
  BM25 on 30 labelled queries (1,546 pooled judgements).
- **Live checks** against the deployed API and the published site. The screenshots are in
  the session; the numbers are in the README.

## What's left

- **KP-20:** create `kopi-claude`, redeploy once, then run the milestone question on
  kopi.unv.run.
- **KP-17 and KP-18:** the demo film.
