# KP-4 — Permits, licences, registrations and eligibility gates

**Built**
- `backend/kopi/eligibility.py`: `check(notice, profile, *, now, registry, catalogue)`,
  returning `list[EligibilityCheck]`, each met / unmet / unknown with one reason and a
  source link. The checks cover:
  - closing date;
  - GRA supply head and grade against tendering capacity;
  - BCA workhead and grade against the tendering limit;
  - licences implied by the notice, or named in it;
  - bizSAFE level;
  - ACRA status when the profile has a UEN.
- `backend/kopi/sources/licences.py` has two halves.
  - **Reference-table loaders:** `gsr()`, `bca()`, `licence_rules()`, `ssic_title()`.
  - **Runtime sources:**
    - `fetch_gobusiness`, which reads the licence directory through its RSC payload;
    - `LiveRegistry`, which looks a UEN up in the GeBIZ Supplier Directory, the BCA
      e-Directory, the bizSAFE register and ACRA's data.gov.sg datasets;
    - a stdlib XLSX reader;
    - a CLI: `python -m kopi.sources.licences --gobusiness | --uen <UEN>`.
- `backend/kopi/data/` holds the reference tables, each with its source URL and fetch date:

  | File | Contents |
  |---|---|
  | `gsr.json` | 45 supply heads, 9 grades S2–S10 with tendering capacity |
  | `bca.json` | 70 workheads, tendering limits dated 16 Jun 2026 |
  | `ssic.json` | SSIC 2025 plus the 2020 codes that changed |
  | `licence_rules.json` | 15 rules |
  | `registers.json` | dataset ids, including ACRA's per-letter datasets |
  | `gobusiness_agencies.json` | agency id → name |
- 75 tests, all offline: synthetic pages, a fake registry, httpx `MockTransport`,
  and XLSX files built inside the test.

**Proved live (29 Sep 2026) on NCS PTE. LTD. (198101793G)**
- **GeBIZ Supplier Directory:** 12 approved supply heads at S10, expiring 06 May 2027.
- **BCA e-Directory:** ME02 at L1 and ME04 at L5, expiring 01/04/2029.
- **bizSAFE:** Level Star, from the 23 Sep 2026 export (51k rows, parsed with no
  dependency).
- **ACRA:** a Live Company, activities 62011 (software development) and 62023
  (computer facilities management), titles joined from SingStat's SSIC table.
- **GoBusiness:** the full directory fetched at 1 request/s, **324 of 324 licences**, every one with its agency resolved (IMDA 46, SPF 40, NEA 33, SFA 26, Customs 16, …). About 6 minutes.

**Decisions and why**
- **Only reference facts are committed:** codes, titles, grades, limits, rules. The
  catalogue, the registers and per-UEN answers are fetched into `data/` (gitignored).
  GeBIZ, BCA, GoBusiness, NEA, SPF, CSRO and SFA all forbid republication. The data.gov.sg
  sets are ODL and could be committed, but nothing needs them in the repo.
- **"Unknown" and "no" stay separate at every step:**
  - `Profile` fields set to `None` give `unknown`.
  - A registry lookup that errors returns `None` and eligibility falls back to the
    profile's claims.
  - `NOT_LISTED` means the bizSAFE register answered and the company isn't on it.
  - Every HTTP call goes through `raise_for_status`, so a failed page is never read
    as "holds nothing".
- **Live registers override profile claims** when a UEN is given, and the reason says
  so ("(GeBIZ Supplier Directory)"). If the profile claims S9 and the directory says
  S2, it's S2.
- **Licence rules** are explicit (`licence_rules.json`): which GRA head, procurement
  category or wording implies which licence. Each rule is either:
  - `required`: the law or the GSR guideline requires it. Missing gives `unmet`.
  - `check`: it depends on how the work is done, e.g. an Employment Agency licence
    for manpower supply. Missing gives `unknown`, with the reason spelled out.
- **Licence matching compares meaningful words, not strings.** Generic words
  ("licence", "certificate") don't count, and a held name needs two meaningful words
  to match a longer one. A profile listing "Business Licence" can't pass for a
  Cleaning Business Licence.
- **bizSAFE** is read from the notice ("bizSAFE Level 3", "bizSAFE Star") and ordered
  Level 1 < 2 < 3 < 4 < Star. Partner and Mentor aren't certification levels, so
  they give `unknown`.
- **BCA RW and TR workheads** have no published tendering limit. Registration alone
  decides them, and the reason says there is no limit.
- **The GRA-unmet reason** says "the tender documents say whether it is a critical
  criterion". GeBIZ notices say exactly that; some tenders treat GRA as non-critical.
- **No `value` checks.** Notices don't state the contract value, and inventing one
  would be the model's job, not a rule's.

**What the next agent needs to know**
- **Call it:** `eligibility.check(notice, profile, registry=LiveRegistry(),
  catalogue=load_licences())`. Without `registry` there are no UEN lookups; without
  `catalogue`, reasons name the agency but not the fee or processing time.
- **Refresh the catalogue** with `uv run python -m kopi.sources.licences --gobusiness`,
  which writes `data/licences/gobusiness.json` in about 6 minutes. The NeedleDB
  licences index (KP-7) should read `load_licences()`.
- **Holder registers without a UEN column** (NEA cleaning licensees, CSRO, SPF SACE,
  SFA) are linked from each rule's `register` field but not queried. Two are PDFs,
  and parsing them would need a new dependency.
- **The KP-1 fixtures use GRA codes that don't exist:** EPU/SER/03 (cleaning is
  EPU/SER/46) and EPU/FMS/01. Posted to the feed.

**Where the agent went wrong**
- **BCA 503 read as "not registered".** The first `LiveRegistry.bca` read the page
  text without checking the status, so a 503 parsed as zero workheads: a confident
  "not registered", the worst kind of wrong for this module. The failure-path test
  caught it. Fix: every fetch goes through `_get` with `raise_for_status`.
- **bizSAFE unreachable read as "no certificate".** Same shape: an unreachable
  register first returned `{}`, which would have said "not on the bizSAFE register".
  It now returns `None` (can't answer) rather than `NOT_LISTED`.
- **Licence matching too loose.** The first version matched by substring either way,
  and I wrote a test asserting that "Licence" matching everything was fine. Re-reading
  it, that was a false "met" waiting to happen. Replaced with word-set matching and
  flipped the test.
- **An invented URL.** I guessed a BCA builders-licensing URL and it 404'd when I
  checked every link in the rules. Replaced with the real page, found by search and
  confirmed 200.
- **JSON-spacing brittleness.** `licence_record` looked for `{"licence":{` exactly and
  missed payloads with a space after the colon, which the test builder produced.
  It's a regex now.
