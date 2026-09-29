# 00 — Brief

**Received:** Tue 29 Sep 2026 · **Due:** Thu 1 Oct 2026
**Assessment:** Pragnition Labs — AI-Native Builder Technical Assessment
**Project:** Kopi — a copilot for Singapore government tenders

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

## The product

Pragnition builds AI systems for Singapore government agencies. The other side of
that market is the supplier. Every day GeBIZ publishes new procurement opportunities
(53 on the day I looked), and a small firm's bid team has to read all of them, work out
which ones it is even eligible for, find the registrations and licences each one
needs, and then produce a submission against a deadline.

Kopi does that work alongside them, in four parts:

1. **Overview** — every open GeBIZ opportunity, indexed and searchable by meaning,
   with an AI overview per tender: what is being bought, who is eligible, how it fits
   the company, and what similar tenders were actually awarded for.
2. **Permits and licences** — what registrations (GRA supply heads, BCA workheads)
   and licences a tender needs, whether the company holds them, and how to get them.
3. **Document drafting** — a copilot that drafts the working documents of a bid:
   clarification questions, a compliance matrix, a cover letter, a proposal outline.
4. **Submissions** — a checklist and pack per tender built from the notice itself
   (items to respond, envelopes, validity, closing time), tracked to the deadline.
   The final submission stays with the person on GeBIZ; Kopi prepares, it does not submit.

## What winning looks like

A reviewer at Pragnition opens the live app, searches "AI chatbot for citizen
services", opens a tender, reads an overview whose every quote is verified against
the notice, asks the copilot to draft clarification questions, and downloads the
draft, in under five minutes. Then they open `planning/` and can follow the thinking:
what I found, what I decided and changed, how the work was split between agents,
where the agents went wrong and how it was caught.

## Constraints I set myself

- Every AI claim is checkable. Quotes cited as evidence are verified against the
  source; anything unverified is shown as unverified.
- Everything a rule can decide, a rule decides: eligibility gates are code, not prompts.
- Least privilege for the agent: it runs in a Modal sandbox with read-only tools and
  no web access, and the notice text it reads is treated as untrusted.
- Respect the source: officials' contact details are dropped at scrape time, every
  tender links back to GeBIZ, and the app sits behind an access code, not on the open
  web (GeBIZ notices carry a no-republication clause).
- Finished beats big. Each of the four parts is thin and works end to end.
