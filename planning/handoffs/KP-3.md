# KP-3 — Awards history and market context

**Built:**
- `kopi/sources/awards.py` pages data.gov.sg's GeBIZ awards dataset
  (`d_acde1106003906a75c3fa052592f2fcb`, 5,000 rows a page) into
  `data/cache/awards.json`, parses dates and amounts, and groups rows by tender.
  CLI: `uv run python -m kopi.sources.awards [--refresh]`.
- `kopi/market.py` has `market_context(similar, agency)`, a pure function that returns
  the quartiles, top suppliers, same-agency incumbents, no-award share and three examples.
- 9 tests on a 40-row sample of real rows (open licence), committed at
  `backend/tests/data/awards/sample.json` and confirmed tracked with `git ls-files`.

**Live, 29 Sep 2026**

| Measure | Count |
|---|---:|
| Rows | 18,464 |
| Tenders after grouping | 12,052 (awarded 2021 to 2026) |
| Tenders with a real price | 11,141 |
| Tenders with no real price (panel placeholders or no award) | 911 |
| Tenders awarded to no supplier | 639 |

Sanity check: 24 past tenders mention AI, chatbots or machine learning. Their
median award is S$329,000, and Stacktribe and Terra Systems each won 2.

**Decisions**
- **Amounts are per tender, not per row.** The dataset has one row per supplier or
  per item, and a per-row median would halve every multi-supplier contract.
- **Placeholders are not prices.** Panel and period contracts record $0 or $1 per
  supplier, so rows at or under $1 are ignored when summing. The AGC legal panel is
  11 firms at $1 each, which would otherwise enter the market as an $11 tender.
- **"Unknown" and "na" are not suppliers.** Those rows are placeholders on tenders
  awarded to no supplier; they're excluded from wins.
- **market.py never searches.** Callers pass the similar tenders, closest first.
  NeedleDB does the lookup in production (KP-7/KP-8), so market.py stays pure and
  testable.

**Next agents**
- Embed `AwardTender.description` for the awards index, not the raw rows, so there is
  one vector per tender (about 12k).
- Rank tenders closest first before calling `market_context`, because `examples` takes
  the first three awarded ones.

**Where the agent went wrong**
- **Nominal amounts.** The first version summed every row. Checking the real sample
  showed the AGC panel (11 rows at $1) and no-award rows at $0 with supplier
  "Unknown". I caught this before commit by inspecting real multi-row tenders rather
  than trusting the schema, and fixed it with the nominal-amount rule and the
  placeholder supplier list, each with a test.
- **Where the task was picked up.** It sat unstaffed while the other milestone-1 tasks
  ran. The main agent took it after resolving the reviewers' concerns on KP-1 and KP-2.
