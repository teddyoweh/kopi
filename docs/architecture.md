# Kopi architecture

One backend package (`backend/kopi`), one static web app (`web/`), and one Modal app
(`backend/modal_app.py`) that runs everything live. Every server-side read goes through
the `Store` protocol (`kopi/store.py`). `FixtureStore` serves synthetic fixtures for
development and tests; `LiveStore` (`kopi/api/live.py`) serves real data. The routes don't
know which one they're talking to.

## Sources → vectors (ingest)

```
refresh_sources  (Modal, CPU, cron "15 */3 * * *")
  ├─ kopi.sources.gebiz.fetch_open         Open tab via JSF partial-ajax paging, then each notice page
  │                                        (contact sections dropped before parsing, 1 req/s, incremental)
  ├─ kopi.bundle.write_bundle              every known notice in one file; ones that left the listing marked closed
  ├─ kopi.sources.awards.load_awards       data.gov.sg, daily; rows grouped per tender, $0/$1 placeholders dropped
  └─ kopi.sources.licences.fetch_gobusiness  324 licences, daily
        │  volume.commit()
        ▼
embed_and_push  (Modal, L4 GPU)
  ├─ kopi.embed.Embedder                   Qwen3-Embedding-0.6B; documents carry no instruction
  ├─ kopi.ingest.refresh                   re-embed only text whose hash changed; save /vectors/<index>.npz
  └─ push changed rows                     NeedleDB write key, three indexes: notices, awards, licences
```

## Serving

```
NeedleService  (Modal, 1 container, the only writer)
  start: copy the hashed key store from the Volume, bulk-load /vectors/*.npz into
         NeedleDB on local disk (13,103 vectors in 1.5 s), then `needledb serve`

api  (Modal ASGI, min 1 container, 4 vCPU, model baked into the image)
  kopi.api.app.create_app(LiveStore)
  ├─ /auth                    access code → HMAC token (12 h)
  ├─ /search                  query embed (CPU, LRU-cached) → NeedleDB top 50 with filters
  │                           → re-filter against the Volume's notices → BM25 × 0.05 re-rank
  ├─ /tenders/{doc}[/detail]  notice + kopi.eligibility.check + market context
  │                           (similar awards from NeedleDB → kopi.market.market_context)
  ├─ /tenders/{doc}/overview  kopi.overview.generate_overview: Claude one-shot with a JSON
  │                           schema and no tools; quotes verified; cached; extractive fallback
  ├─ /tenders/{doc}/checklist kopi.checklist.submission_checklist (rules)
  ├─ /licences[/search]       GoBusiness catalogue; semantic search over the licences index
  └─ /chat, /sessions/*       kopi.sandbox.Copilot (below)
  the store re-reads the Volume at most every 5 minutes, under a lock
```

## The copilot

```
POST /chat  {message, session_id?, profile, doc_no?}      (app-scoped token required)
  Copilot.turn
    ├─ session record + drafts in a Modal Dict ("kopi-sessions"); caps: 20 turns, 12 sessions a day
    ├─ Modal Sandbox per session (agent image: claude-agent-sdk + kopi, nothing else)
    │    secrets: kopi-claude (CLAUDE_CODE_OAUTH_TOKEN)
    │    egress:  api.anthropic.com, claude.ai, the Kopi API; everything else blocked
    ├─ sb.exec("python -m kopi.agent.runner …") with a fresh 20-minute scope=agent token
    │    kopi.agent.runner: ClaudeAgentOptions(tools=[Read, Write, Edit, Glob],
    │       allowed_tools=[mcp__kopi__*], permission_mode="dontAsk",
    │       PreToolUse hook = workspace fence, strict_mcp_config, setting_sources=[])
    │    kopi.agent.tools: search_tenders, get_tender, check_eligibility, similar_awards,
    │       find_licences, get_company_profile, submission_checklist → the Kopi API
    ├─ stdout (chunks → lines → ChatEvent JSON) → SSE to the browser
    └─ after the turn: copy /workspace/drafts/*.md into the Dict (downloads outlive the sandbox)
```

## Trust boundaries

| Component | Can | Cannot |
|---|---|---|
| Browser | call the API with an app token | hold any secret (the bundle has only the API origin) |
| API | read NeedleDB (read key), read the Volume, start sandboxes | write NeedleDB, see the admin key |
| Ingest | write NeedleDB (write key scoped to 3 indexes) | mint keys |
| Copilot sandbox | reach Anthropic and the Kopi read routes (agent token) | chat, read drafts, run overviews, reach anything else, run a shell |
| Notice text | be read by models inside `<notice>` delimiters | close its delimiter (escaped), trigger tools |

## Local development

- `web/` in mock mode needs nothing. `lib/mock.ts` mirrors `FixtureStore`, including the
  overview cap rule and the market filters.
- `make dev-api` serves `FixtureStore`. `KOPI_STORE=live` plus NeedleDB environment
  variables switch it to `LiveStore`.
- `python -m kopi.agent.runner --workspace /tmp/ws --profile-file backend/profiles/pragnition.json --message "…"`
  runs a real copilot turn on the local Claude login, against any Kopi API
  (`KOPI_API`, `KOPI_SESSION_TOKEN`).
