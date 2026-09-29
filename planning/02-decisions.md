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

## D12 — Qwen3's generic query instruction, measured (KP-6)
**Picked:** `SEARCH_TASK = "Given a web search query, retrieve relevant passages that answer the query"`.
**Rejected:** a domain instruction written for Kopi, which scored nDCG@10 0.444 against 0.695.
**Why:** measured on 30 supplier queries over 12,052 awarded tenders (evals/RESULTS.md).
With the generic instruction, Qwen3-0.6B beats BGE-small (0.609) and BM25 (0.594), which
confirms D3 on our own data rather than MTEB alone.
