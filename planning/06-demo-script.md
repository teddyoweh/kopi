# 06 — Demo script

About 3:45 at 150 words a minute, first person, plain. The six points the brief asks for come
in its order. Every shot is real footage in `artifacts/media/kopi-demo/` (1920×1080, 30 fps),
recorded from:

- the published site, kopi.unv.run;
- the same app running on my Mac against the live index, for the two shots that need Claude
  (the AI overview and the copilot);
- the public repo on GitHub.

The voiceover says which is which.

| # | Demo point | Time | Footage |
|---|---|---|---|
| 1 | What it does, live | 0:00–1:35 | `01-gate`, `02-home`, `03-search`, `04-tender`, `05-copilot`, `06-submissions` |
| 2 | The AI tools | 1:35–1:55 | `08-repo` |
| 3 | How the agents planned, built and debugged | 1:55–2:50 | `09-planning`, `11-eval`, `10-review` |
| 4 | What was added or fixed | 2:50–3:15 | `12-journal` |
| 5 | What was cut | 3:15–3:30 | `13-cuts` |
| 6 | The weakest part, and what's next | 3:30–3:50 | `14-weakest` |

## Voiceover

### 1. What it does — 0:00

*[01-gate, then 02-home]*
This is Kopi, a copilot for Singapore government tenders. A supplier's bid team has to read
every new opportunity on GeBIZ, work out which ones they can actually bid for, chase the
registrations and licences, and write a submission before the deadline. Kopi does that work
alongside them.

It indexes all 733 open GeBIZ opportunities, twelve thousand past tenders and their awards,
and 324 government licences. The home page ranks what's open against my company's profile.

*[03-search]*
Search is semantic. I describe what we do in plain words, and it finds tenders that never use
those words.

*[04-tender]*
Each tender opens with eligibility, checked by code rather than by the model: supply heads and
grades, construction workheads, bizSAFE, named licences. Met, not met, or unknown when the
profile doesn't say. Then the market: who won similar work, and for how
much.

The AI overview makes a call: bid, maybe or no-bid. Every quote it cites is checked word for
word, and the page says whether it came from the notice or from our own profile. A quote it
can't find caps the call at maybe.

*[05-copilot]*
The copilot is the Claude Agent SDK with Kopi's own MCP tools. I ask for eligible AI tenders
closing within two weeks, and clarification questions for the best one. You can watch it search, check eligibility, read the notices and save a draft. It
has no shell and no web access. Here it runs on my machine against live data; hosted, it runs
in a Modal sandbox.

*[06-submissions]*
A tracked tender becomes a checklist built from its notice, with the deadline in Singapore
time.

### 2. The AI tools — 1:35

*[08-repo]*
I built it in a day with Claude Code on Opus 5.5, inside Universe, my own agent workspace. The
plan ran on a Software Factory board:
- milestones;
- tasks that declare the files they own, so agents work in parallel in separate git worktrees;
- a check command for every task;
- a handoff note for the next agent.

### 3. How the agents planned, built and debugged — 1:55

*[09-planning]*
Before any code, the agents probed every source with real requests, which found GeBIZ's
hidden paging and an undocumented JSON feed for licences. Every decision is
written down, with what was rejected.

*[11-eval]*
For embeddings I wanted a free model on par with OpenAI's. Instead of trusting a leaderboard,
the agent built an eval: thirty supplier queries over twelve thousand real tenders. Qwen3 won
at 0.695, ahead of BGE and BM25. The same eval killed my favourite idea, a tender-specific
instruction, which dropped it to 0.444.

*[10-review]*
An independent reviewer agent reran every first-milestone task from main. It found four real
bugs that the authors' own checks had passed, including an auth bypass.

### 4. What was added or fixed — 2:50

*[12-journal]*
Other failures only showed up live: chunked sandbox output, a volume that couldn't reload, and
a 37-second tender list that now loads in a third of a second. While recording this, I caught
the overview labelling a quote from our own profile as if it came from the notice. That's
fixed and deployed. It's all in the AI journal, with every session log, redacted.

### 5. What was cut — 3:15

*[13-cuts]*
I cut these on purpose:
- submitting on GeBIZ (Kopi prepares, the person submits);
- reading the tender documents behind the login;
- user accounts;
- alerts.

### 6. The weakest part, and what's next — 3:30

*[14-weakest]*
The weakest part: the check proves a quote exists, not that it supports the point. Next: a
cheap second-pass judge, uploading the tender pack so Kopi checks the real requirements, and
daily digests of new matches.

## Notes for the cut (KP-18)

- **Speed up the waits, and say so on screen.** The overview's generation and the copilot's
  thinking are real waits. Speed them up with a small "2×" or "4×" mark rather than hiding
  them.
- **Match the copilot line to the site.** If KP-20 has attached the Claude credential before
  the render, re-shoot `05-copilot` on kopi.unv.run and change the line to "on the hosted
  site, in a Modal sandbox".
- **Title cards can't use `drawtext`.** This machine's ffmpeg has no drawtext filter.
  Render cards as HTML in Chrome (`record.mjs` already drives it) and cut them in as clips.
