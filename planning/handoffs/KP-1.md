# KP-1 — Contract

**Built:** the backend uv project (`backend/`, Python 3.13 pinned by `.python-version`),
`kopi/models.py` (the whole data contract), `kopi/store.py` (`Store` protocol +
`FixtureStore`), `kopi/api/app.py` (`create_app(store, settings)`, 14 routes),
`kopi/api/auth.py` (access code → HMAC bearer token, 12 h), fixtures, two profiles,
`Makefile`, `.env.example`, `docs/api.md`, `openapi.json`. 13 tests, all offline.

**Decisions**
- Heavy deps are extras: `search` (needledb pinned to `b88f8b7`, sentence-transformers,
  torch), `agent` (claude-agent-sdk), `deploy` (modal). `uv sync` for the API and
  tests stays small and fast; CI never downloads torch.
- `Profile` uses `None` for "unknown" registrations/licences, never `[]`. `[]` means
  "we hold none". Eligibility must return `unknown` for `None`.
- Tokens are stateless HMAC so any API container can verify them; no session store.
- `POST /tenders/{doc}/detail` exists alongside `GET /tenders/{doc}` because the
  eligibility half needs the profile, which lives in the browser (D11).
- `FixtureStore.chat` is a scripted five-event conversation so the copilot UI can be
  built before the agent exists.

**Fixtures:** `notices.json` is 30 synthetic notices in GeBIZ's structure (real
agency names, invented tenders). `TST000ETQ26000901/902` are prompt-injection bait.
One includes a fake email on purpose. `awards.json` is 40 real rows from
data.gov.sg (open licence). `licences.json` is 15 licences with real names and
approximate fees, placeholders until KP-4 loads the GoBusiness records.
`brightclean.json` is a fictional company; `pragnition.json` uses only pragnition.ai's
public text.

**Next agents**
- Live data goes behind the `Store` protocol in a new `LiveStore`; routes don't change.
- `make types` writes `web/lib/api-types.ts`; run it after any model change.
- Filters are passed as any object with the `SearchFilters` attributes (`Filters` dataclass in the API).

**Where the agent went wrong**
- First `uv sync` picked Python 3.14 from Homebrew because nothing pinned it; the
  project says 3.13. Fixed with `.python-version`.
- The first draft of `app.py` defined a `filters()` dependency and never used it;
  removed before commit.
- The worktree was cut before the web scaffold landed on main, so `make types` could
  not write into `web/` here; KP-5 runs it.

## Review fix (reviewer: Agent 3)
- **Concern:** with `KOPI_ACCESS_CODES` set and `KOPI_SIGNING_KEY` unset, `require_token`
  verified against an empty HMAC key, so anyone could forge a token. The reviewer
  reproduced it. **Fixed:** `create_app` refuses to start in that state, and `verify()`
  rejects an empty key as well. Two tests cover it, including the reviewer's forged token.
- **Also found here:** `.gitignore`'s `data/` matched every `data/` directory, including
  `backend/tests/data/` and `backend/kopi/data/`. Now anchored: `/data/`, `/out/`,
  `/backend/data/`.
