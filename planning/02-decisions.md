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

## D13 — Kopi runs in the kryptonairc-lc Modal workspace
**Picked:** the kryptonairc-lc workspace, with every resource prefixed `kopi`.
**Why:** Teddy's call on 29 Sep. The personal teddyoweh workspace is paused on billing,
and he chose this one over the Spawn Labs workspaces. Kopi touches only its own `kopi*`
app, Volume and secrets there, so its keys and data share nothing with anything else in
the workspace.

## D14 — Hybrid search, measured (KP-8)
**Picked:** dense top 50 from NeedleDB, plus BM25 over titles at weight 0.05, plus a
fast path for tender numbers.
**Why:** on evals/, nDCG@10 goes 0.695 → 0.715 with P@10 unchanged; weights of 0.1–0.3
were no better. Keyword matches break ties toward exact words without overriding meaning.

## D15 — The Volume stores data; containers never hold files open on it (KP-8)
**Picked:**
- the embedding model baked into the API image;
- registry caches in /tmp;
- all notices as one bundle file on the Volume.

**Why:** `volume.reload()` fails while any file on the Volume is open, and memory-mapped
model weights count, so the API would never have seen a new ingest. Every file open on
the Volume is also a network round trip: 732 single-file reads took 37.5 s, and one
bundle takes 0.3 s.

## D16 — The copilot is locked down by construction (KP-11)
**Picked:** the agent's only built-in tools are Read, Write, Edit and Glob, fenced by a
PreToolUse hook to the workspace (writes to drafts/ only). Every other capability is a
read-only Kopi MCP tool that calls the API with the session's token, and anything not
pre-approved is denied (`dontAsk`).
**Why:** the agent reads untrusted notice text. The worst a hostile notice can make it
do is read other public tenders and write a markdown file in its own drafts folder.

## D17 — The overview's evidence is checked by code, not trusted (KP-10)
**Picked:** the overview is a one-shot Claude call with no tools that returns structured
output. Code then checks every quote word for word, after normalising, against the
notice as the model saw it and the profile. Any miss caps BID at MAYBE and says so.
**Why:** the brief drives a bid or no-bid decision, so its evidence must be real. Over
10 live overviews, every verified quote was in the notice. Code can check that the words
exist, but not that they prove the point, so the UI calls a quote evidence, not proof.
