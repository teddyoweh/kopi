# 01 — Discovery

Done with Claude Code (running inside Universe) before any code was written. The agent
probed each source with `curl` and short Python snippets; findings below are what
came back, not what the docs claim.

## Who is reviewing this

- pragnition.ai: builds AI systems for Singapore government agencies and large
  enterprises; engineers "sit with the people doing the actual work", ship, own it.
- github.com/pragnition: **RAPID** — a Claude Code plugin for parallel, isolated
  agent development. Its core idea is *context rot*: split work into sets, `/clear`
  between steps, give each agent a fresh context with only the artifacts it needs
  (CONTEXT.md, PLAN.md, per-wave plans), run executors in git worktrees, review, merge.

Implication for how I work here: small task briefs, each agent in its own worktree,
explicit handoff files, a review pass per task. The same shape RAPID encodes.

## Source 1 — GeBIZ open opportunities (live)

| Probe | Result |
|---|---|
| `GET /robots.txt` | `Allow: /`, only `/scripts/` disallowed |
| `GET /ptn/opportunity/BOListing.xhtml?origin=opportunities` | 200, server-rendered JSF. "53 opportunities found" today, 10 per page |
| Paging | JSF postback: `javax.faces.ViewState` + a `..._Next_N` command button. Needs a cookie session |
| Listing card fields | type + document no., status, title, agency, published, procurement category, closing date/time |
| `GET /ptn/opportunity/directlink.xhtml?docCode=<no>` | 200, no login. Full notice detail |
| Detail fields | description, reference no., procurement type/method/nature, two-envelope, WTO-GPA, **GRA supply head + tendering capacity** (e.g. `EPU/CMP/10 … [$250,000 (EPU S3)]`), items to respond, delivery location/date, contact persons |
| Tender documents | **Behind login** ("Please log in to view the Documents") |
| Notice footer | Content "shall not be reproduced, distributed … republished … without prior permission, other than for its intended purpose" (suppliers preparing bids) |

Consequences:
- Triage works from the notice, not the full tender pack. That is a real limitation
  and it goes in the README.
- The GRA supply head and tendering capacity are gold for triage: they are a hard
  eligibility gate a supplier can check deterministically, no model needed.
- Contact persons are named officials with emails and phones. Not needed for triage,
  so they are dropped at parse time and never stored.
- No scraped notice goes into the repo or onto a public URL. Tests and the offline
  demo use synthetic notices in the same structure.

## Source 2 — data.gov.sg "Government Procurement via GeBIZ" (awards)

- `datastore_search?resource_id=d_acde1106003906a75c3fa052592f2fcb`, no key needed,
  5,000 rows per page.
- **18,464 rows**, award years 2021–2026 (806 so far in 2026 — kept current).
- Fields: `tender_no, tender_description, agency, award_date (d/m/yyyy),
  tender_detail_status, supplier_name, awarded_amt`.
- Status mix: Awarded to Suppliers 9,294 · Awarded by Items 7,845 · interface 686 ·
  Awarded to No Suppliers 639. One tender can appear on several rows (per supplier /
  per item) — aggregation must group by `tender_no`.
- Singapore Open Data Licence → fine to cache and to use in committed evals.

This gives each open notice market context no model can invent: how many similar
tenders were awarded, at what amounts, and who keeps winning them.

## Source 3 — the model

- Claude Code CLI 2.1 is installed and supports `claude -p --json-schema <schema>
  --output-format json --tools ""`. That gives schema-constrained output from the
  local Claude login with **no tools** (the notice is untrusted input) and no API key
  in the repo.
- The Anthropic API is the other backend, keyed by `ANTHROPIC_API_KEY` from the env.
- A third backend, `replay`, serves recorded responses so the demo and the tests
  run with no key and no network.
