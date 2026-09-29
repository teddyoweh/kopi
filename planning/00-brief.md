# 00 — Brief

**Received:** Tue 29 Sep 2026 · **Due:** Thu 1 Oct 2026
**Assessment:** Pragnition Labs — AI-Native Builder Technical Assessment

## What they asked for

Build or improve a small project using coding agents heavily. Keep planning notes,
handoff files and agent plans in `planning/`. Ship a README (what, how to run,
trade-offs), exported agent session logs, a public repo and a short demo.

The demo has to cover six things: what it does, which AI tools, how the agent helped
plan/implement/debug/refactor, what was added or fixed, what was cut, and the weakest
part plus what comes next.

They grade on: effective use of agents, clarity of planning and handoff artifacts,
whether it works and is understood quickly, whether the technical choices are
simple, maintainable and secure, sensible trade-offs, and whether I can say where the
AI helped, where it failed, and how I corrected it.

## What winning looks like

A reviewer at Pragnition opens the repo and, inside five minutes:

1. understands the problem from the first screen of the README,
2. runs `make demo` with **no API key and no network** and sees a real report,
3. opens `planning/` and can follow the thinking: why this problem, what I found, what
   I decided, how the work was split between agents, what went wrong,
4. finds the session logs, readable and scrubbed of secrets.

## Why this problem

Pragnition builds AI systems for Singapore government agencies and large enterprises.
The other side of that market is the supplier: every day GeBIZ publishes dozens of new
procurement opportunities (53 on the day I looked), and a small firm's bid manager has
to read all of them to find the two worth a response. That reading is exactly the kind
of work that "wastes people's time" and that an AI system can take over without taking
the decision away from the person.

So the product is a **triage tool for a supplier's bid manager**: it reads today's
GeBIZ opportunities against a company's capability profile and returns a ranked
shortlist with a bid / maybe / no-bid call, the evidence for it, the requirements to
check, and what similar tenders were awarded for in the past — so the person reads
five memos instead of fifty notices.

## Constraints I set myself

- Small and finished beats big and 90% there. Target: one CLI, one report, done well.
- Every AI claim must be checkable. Quotes the model gives as evidence are verified
  against the source text; anything unverified is shown as unverified.
- Runs for a reviewer with nothing installed but Python and `uv`.
- Respect the source: GeBIZ notices carry a no-republication clause and name
  officials. Nothing scraped from GeBIZ is committed or published; contact details
  are dropped at parse time.
