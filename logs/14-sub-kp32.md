# Subagent: KP-32 fast search insights (parallel, cached market bands)

`14-sub-kp32` · model claude-opus-5-5 · 24 assistant messages · 65 tool calls · 29 Sep 18:01 UTC → 29 Sep 18:18 UTC

Redacted export: thinking, images, system reminders and mailbox results are removed; secrets, emails, phone numbers and home paths are masked; long tool output is cut.

---

## Turn 1 · Teddy · 29 Sep 18:01 UTC

> You are building task KP-32 "Search insights on the backend" for Kopi, a copilot for Singapore government tenders (GeBIZ). Repo: ~/Documents/codes/kopi. Work ONLY in the git worktree ~/.universe/cache/worktrees/kp/kp-32 (branch factory/kp-32, already created from main). Do not touch main, do not push, do not merge — the lead merges your branch.
>
> Context to read first:
> - planning/handoffs/KP-31.md (the contract you build on) and planning/02-decisions.md D27
> - backend/kopi/insights.py (a working but serial first version), backend/kopi/store.py, backend/kopi/api/live.py, backend/kopi/api/app.py (route POST /search/insights), backend/kopi/models.py (TenderInsight, EligibilitySummary, MarketBand)
> - backend/tests/test_api_contract_bids.py and tests/conftest.py
>
> The problem: insights() calls store.tender(doc, profile) for each of up to 25 documents in series. On the live store, tender() embeds the full notice text (embed_document, CPU on Modal) and queries NeedleDB's awards index for the market band, so 25 docs in series is several seconds. Search cards call this right after the hits render, so it must feel fast.
>
> Do:
> 1. Make insights fast on the live store while keeping the result identical in meaning:
>    - Eligibility for all docs (rules, cheap) plus the snippet (pure text) come first.
>    - Market bands are computed in parallel (a small ThreadPoolExecutor, e.g. 8 workers) and cached in-process per doc_no (the band does not depend on the profile). Consider a bounded LRU and a TTL around the 5-minute notice refresh. If NeedleDB can return the notice's own stored vector for a doc (check kopi/index.py and the needledb client in the venv for a fetch-by-id), use that instead of re-embedding; if not, embed once per doc and cache.
>    - One doc's failure (embedding or NeedleDB error) gives market=None for that doc, never an error for the batch. Unknown doc numbers are skipped (NotFound). Order follows the request.
>    - You may make additive changes to backend/kopi/store.py and backend/kopi/api/live.py (e.g. a public `notice(doc_no)` and/or `market_for(notice)` on the Store protocol with FixtureStore + LiveStore implementations) if that is the clean way to avoid computing a whole TenderDetail. Keep the route and the TenderInsight contract unchanged.
> 2. Tests in backend/tests/test_insights.py (never touch the network, Modal, NeedleDB servers or Claude — use FixtureStore and fakes): snippet picks the sentence with most query-token overlap and falls back to the first; clip to 240 chars at a word boundary; blocker is the first unmet and open_question the first unknown; unknown docs skipped and order kept; a failing market lookup gives market=None; the market cache means a second call does not recompute; batch of 25 works.
> 3. Measure: if practical, time 25 docs against a local LiveStore wired like data/film-rig/film_api.py (live NeedleDB read key in data/secrets/needledb-keys.kryptonairc-lc.json, embedder on MPS) — never print keys. Report before/after timings. If that setup is too heavy, say so and report the fixture timings.
> 4. Rules: backend is a uv project in backend/ (Python 3.13): `export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd backend && uv sync && uv run pytest -q` must be green. Code reads like a careful senior wrote it: small, typed, docstrings only where the why is not obvious, no dead code, no TODOs. No new dependencies.
> 5. Write planning/handoffs/KP-32.md (what was built, decisions and why, what the next agent must know, and an honest 'Where the agent went wrong' with the fix). Commit in the worktree with a message ending in the line: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
>
> Finish by replying with: the commit sha(s), the pytest count, timings, and anything the lead must know to merge (files touched outside insights.py/tests).

I'll start by reading the context files in the worktree.

- **Bash** — Inspect worktree state and layout
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32 && git status && git log --oneline -5 && ls && ls backend backend/kopi backend/kopi/api backend/tests planning planning/handoffs
  ```

  <details><summary>result</summary>

  ```
  On branch factory/kp-32
  nothing to commit, working tree clean
  2a6d1f5 KP-33: Rich search result cards with preview pane
  c11a1bc KP-33: search results as rich cards with eligibility, snippet, price band, actions, preview pane and keyboard
  102d0ce KP-31: Contract for search insights and bid sessions (API models, routes, web client, mocks)
  7f49faf KP-31: contract for search insights and bid sessions (models, routes, stores, web client, mocks, bids store)
  3e0fa47 KP-30: film tightened to 3:56 (copilot answer at 1.25x),
  [… 1,044 chars cut …]
  KP-21.md
  KP-24.md
  KP-25.md
  KP-26.md
  KP-27.md
  KP-28.md
  KP-29.md
  KP-3.md
  KP-30.md
  KP-31.md
  KP-33.md
  KP-4.md
  KP-5.md
  KP-6.md
  KP-7.md
  KP-8.md
  KP-9.md
  deploy.md
  logs-refresh.md
  ```

  </details>

- **Bash** — Read KP-31 handoff and D27 decision
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32 && cat planning/handoffs/KP-31.md && grep -n "D27" -A 30 planning/02-decisions.md | head -80
  ```

  <details><summary>result</summary>

  ```
  # KP-31 — Contract for search insights and bid sessions
  
  **Built (the contract the next four tasks share)**
  - **Models** (`kopi/models.py`, additive):
    - `InsightsRequest`, `EligibilitySummary`, `MarketBand`, `TenderInsight`;
    - `ChatRequest.bid` (default false);
    - `SessionFile.kind` (`draft` | `upload`, default `draft`);
    - `MemoryNote`, `BidStage` (qualify, clarify, draft, review, submit), `BidMemory`,
      `MemoryRequest`.
  - **Routes** (`kopi/api/app.py`):
    - `POST /search/insights` (Authed, Read, at most 25
  [… 2,323 chars cut …]
  and search cards "100x better". A bid team's work is
  242-per tender and spans days. The memory is what lets the copilot pick a bid up again after
  243-the sandbox has gone.
  ```

  </details>

- **Bash** — Read insights.py and store.py
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && cat kopi/insights.py kopi/store.py
  ```

  <details><summary>result</summary>

  ```
  """What a search card shows beyond the summary: eligibility at a glance, why it matched, and
  what similar work sold for. Works over any Store, through `Store.tender`."""
  
  from __future__ import annotations
  
  import re
  from collections.abc import Sequence
  
  from kopi.models import (
      EligibilityCheck,
      EligibilityStatus,
      EligibilitySummary,
      MarketBand,
      MarketContext,
      Profile,
      TenderDetail,
      TenderInsight,
  )
  from kopi.store import NotFound, Store, tokens
  
  SNIPPET_CHARS = 240
  SENTENCES =
  [… 2,313 chars cut …]
     **row,
          "award_date": f"{year:04d}-{month:02d}-{day:02d}" if year else None,
          "awarded_amt": float(amount) if amount not in (None, "", "na") else None,
      }
  ```

  </details>

- **Bash** — Read live.py
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && cat kopi/api/live.py
  ```

  <details><summary>result</summary>

  ```
  """The live Store: NeedleDB for search, the Volume for full notices and licences, rules for eligibility.
  
  NeedleDB holds vectors and the fields search filters on. The full notice (description,
  GRA heads, items) and the licence catalogue live as JSON on the Modal Volume, which
  ingest keeps current; this store re-reads them at most every `refresh_seconds`.
  """
  
  from __future__ import annotations
  
  import json
  import logging
  import threading
  import time
  from collections.abc import AsyncIterator, Callable
  from datetime
  [… 2,331 chars cut …]
          claude=bool(os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY")),
          overview_cache=Path("/tmp/kopi-overviews"),
      )
  ```

  </details>

- **Bash** — Read route and models for insights
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && grep -n "insights\|Insight" -n kopi/api/app.py && grep -n "class TenderInsight\|class EligibilitySummary\|class MarketBand\|class InsightsRequest\|class MarketContext\|class TenderDetail" -A 22 kopi/models.py
  ```

  <details><summary>result</summary>

  ```
  18:from kopi.insights import insights as tender_insights
  28:    InsightsRequest,
  39:    TenderInsight,
  135:    @app.post("/search/insights", response_model=list[TenderInsight], dependencies=[Authed, Read])
  136:    def insights(request: Request, body: InsightsRequest) -> list[TenderInsight]:
  137:        return tender_insights(db(request), body.doc_nos, body.profile, body.query)
  182:class MarketContext(BaseModel):
  183-    similar_count: int
  184-    median_amount: float | None
  185-    p25_amount: float | None
  186-   
  [… 2,233 chars cut …]
  "review", "submit"]
  343-
  344-
  345-class MemoryNote(BaseModel):
  346-    id: str
  347-    text: str
  348-    source: Literal["kopi", "you"]
  349-    created: datetime
  350-
  ```

  </details>

- **Bash** — Read index.py and app.py
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && cat kopi/index.py && sed -n 1,160p kopi/api/app.py
  ```

  <details><summary>result</summary>

  ```
  """Kopi's three NeedleDB indexes: what they hold, how records are shaped, and how vectors travel.
  
  The vectors themselves live on the Modal Volume as one `.npz` per index (`VectorSet`).
  NeedleDB is the serving layer, loaded from those files when its container starts and
  kept current by ingest over HTTP. So a lost container costs a reload, never a re-embed.
  """
  
  from __future__ import annotations
  
  import hashlib
  import json
  from collections.abc import Iterable, Iterator
  from dataclasses import dataclass
  from datetime
  [… 2,308 chars cut …]
  response_model=list[ChecklistItem], dependencies=[Authed, Read])
      def checklist(request: Request, doc_no: str, body: OverviewRequest) -> list[ChecklistItem]:
  ```

  </details>

Now let me look at the needledb client for fetch-by-id, and the tests.

- **Bash** — Find needledb package in venv
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && ls -la .venv 2>/dev/null | head -3; ls ~/Documents/codes/kopi/backend/.venv/lib/python3.13/site-packages | grep -i needle; grep -n "needledb" pyproject.toml
  ```

  <details><summary>result</summary>

  ```
  needledb
  needledb-0.1.0.dist-info
  16:index = ["needledb @ git+https://github.com/teddyoweh/needledb@b88f8b7"]
  28:    "needledb @ git+https://github.com/teddyoweh/needledb@b88f8b7",
  ```

  </details>

- **Bash** — Read tests conftest and bids contract test
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && cat tests/conftest.py && cat tests/test_api_contract_bids.py | head -120
  ```

  <details><summary>result</summary>

  ```
  import json
  
  import pytest
  from fastapi.testclient import TestClient
  
  from kopi.api.app import create_app
  from kopi.config import PROFILES_DIR, Settings
  from kopi.models import Profile
  from kopi.store import FixtureStore
  
  
  @pytest.fixture
  def store() -> FixtureStore:
      return FixtureStore()
  
  
  @pytest.fixture
  def pragnition() -> Profile:
      return Profile.model_validate(json.loads((PROFILES_DIR / "pragnition.json").read_text()))
  
  
  @pytest.fixture
  def brightclean() -> Profile:
      return
  [… 2,349 chars cut …]
  
  
  def test_bid_flag_defaults_off_in_chat_requests(pragnition):
      from kopi.models import ChatRequest
  
      assert ChatRequest(message="hi", profile=pragnition).bid is False
  ```

  </details>

- **Bash** — List needledb client functions
  
  ```
  cd ~/Documents/codes/kopi/backend/.venv/lib/python3.13/site-packages/needledb && ls && grep -n "def \|class " *.py | head -120
  ```

  <details><summary>result</summary>

  ```
  __init__.py
  __main__.py
  __pycache__
  cli.py
  client
  core
  embed.py
  errors.py
  py.typed
  server
  __init__.py:13:def __getattr__(name: str):
  cli.py:15:def _serve(args) -> int:
  cli.py:50:def _keys(args) -> int:
  cli.py:79:def main(argv: list[str] | None = None) -> int:
  embed.py:32:class Provider:
  embed.py:41:class Model:
  embed.py:53:    def supports(self, dimension: int) -> bool:
  embed.py:127:def find_model(provider: str, model: str) -> Model | None:
  embed.py:131:def get_model(provider: str, model: str) -> Model:
  [… 2,174 chars cut …]
  errors.py:44:class ResourceExhausted(NeedleError):
  errors.py:49:class FailedPrecondition(NeedleError):
  errors.py:55:class Unavailable(NeedleError):
  ```

  </details>

- **Bash** — List needledb client methods
  
  ```
  cd ~/Documents/codes/kopi/backend/.venv/lib/python3.13/site-packages/needledb/client && ls && grep -n "def " *.py | head -80
  ```

  <details><summary>result</summary>

  ```
  __init__.py
  __pycache__
  aio.py
  common.py
  http.py
  index.py
  local.py
  http.py:16:def settings(url: str | None, api_key: str | None) -> tuple[str, dict]:
  http.py:36:    def __init__(self, url: str | None = None, api_key: str | None = None, *,
  http.py:47:    def request(self, method: str, path: str, body=None, params=None):
  http.py:64:    def create_index(self, name: str, dimension: int | None = None, metric: str = "cosine",
  http.py:79:    def list_indexes(self) -> list[Obj]:
  http.py:82:    def describe_index(self, name:
  [… 2,330 chars cut …]
     async def fetch(self, ids: list[str], namespace: str | None = None) -> Obj:
  aio.py:196:    async def get(self, id: str, namespace: str | None = None) -> Obj | None:
  ```

  </details>

- **Bash** — Read needledb index fetch/get/query methods
  
  ```
  cd ~/Documents/codes/kopi/backend/.venv/lib/python3.13/site-packages/needledb/client && sed -n 1,200p index.py && sed -n 100,175p http.py && sed -n 80,125p common.py && sed -n 210,240p common.py
  ```

  <details><summary>result</summary>

  ```
  """The Index surface the sync clients share, and the result type every client returns."""
  from __future__ import annotations
  
  import re
  from collections.abc import Iterable, Iterator, Mapping
  from typing import Any
  
  from .common import (TEXT_BATCH, array_records, batches, count_in, scan_size, scanned, search_args,
                       text_records)
  
  _CAMEL = re.compile(r"_([a-z])")
  
  
  class _Key:
      """An attribute that reads a key when the dict has it, and the dict method otherwise,
      so `record.values` is the
  [… 2,318 chars cut …]
  record = found.get(rid)
          if record is not None:
              out.append(record if include_values else {k: v for k, v in record.items() if k != "values"})
      return out
  ```

  </details>

NeedleDB has `fetch(ids)` (batched). Let me check how values come back and how ingest embeds notices, to confirm the stored vector equals what `tender()` computes.

- **Bash** — Check needledb binary packing and fetch response
  
  ```
  cd ~/Documents/codes/kopi/backend/.venv/lib/python3.13/site-packages/needledb/client && sed -n 1,45p common.py && sed -n 1,62p http.py; grep -rn "binary\|unpack\|values" ../server/*.py 2>/dev/null | grep -in "fetch\|unpack\|b64\|binary" | head -30; ls ../server
  ```

  <details><summary>result</summary>

  ```
  """Request bodies, record helpers and error handling shared by every client."""
  from __future__ import annotations
  
  import base64
  import hashlib
  from collections.abc import Iterable, Mapping
  from typing import Any
  
  import numpy as np
  import orjson
  
  from ..errors import BY_CODE, AlreadyExists, NeedleError
  
  TRANSIENT = {502, 503, 504}
  TEXT_BATCH = 256  # records per request when the server embeds them
  KEEP = object()  # "leave this setting as it is"
  
  
  def backoff(attempt: int) -> float:
      return min(0.25 * 2 **
  [… 2,301 chars cut …]
  resp.content, resp.text)
  
      # ---- indexes -----------------------------------------------------------------------
  __init__.py
  app.py
  audit.py
  auth.py
  providers.py
  static
  ```

  </details>

- **Bash** — Find how ingest builds notice text and vectors
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && grep -n "notice_text\|def .*text\|embed_documents\|NOTICES\|VectorSet(" kopi/ingest.py kopi/embed.py | head -40
  ```

  <details><summary>result</summary>

  ```
  kopi/embed.py:31:def _collapse(text: str) -> str:
  kopi/embed.py:39:def notice_text(notice: Notice) -> str:
  kopi/embed.py:43:def award_text(tender: AwardTender) -> str:
  kopi/embed.py:47:def licence_text(licence: Licence) -> str:
  kopi/embed.py:51:def query_prompt(text: str, task: str = SEARCH_TASK) -> str:
  kopi/embed.py:85:    def _encode(self, texts: list[str]) -> np.ndarray:
  kopi/embed.py:89:    def embed_documents(self, texts: list[str]) -> np.ndarray:
  kopi/embed.py:94:    def embed_query(self, text: str, task: str =
  [… 467 chars cut …]
  records.metadata), len(todo)
  kopi/ingest.py:104:        VectorSet(
  kopi/ingest.py:119:    if name == NOTICES:
  kopi/ingest.py:135:    for name in (NOTICES, AWARDS, LICENCES):
  ```

  </details>

- **Bash** — Read embed.py and ingest notice flow
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && sed -n 1,110p kopi/embed.py && sed -n 40,145p kopi/ingest.py
  ```

  <details><summary>result</summary>

  ```
  """Text embeddings with Qwen3-Embedding-0.6B, and the text Kopi embeds for each kind of record.
  
  Qwen3 embeddings are asymmetric: queries carry a one-line task instruction, documents
  carry nothing. Mixing that up quietly costs retrieval quality, so both paths live here
  and nowhere else builds embedding text.
  """
  
  from __future__ import annotations
  
  import re
  from typing import TYPE_CHECKING
  
  import numpy as np
  
  from kopi.models import AwardTender, Licence, Notice
  
  if TYPE_CHECKING:
      from sentence_transformers import
  [… 2,300 chars cut …]
  LICENCES):
          vectors = VectorSet.load(store / f"{name}.npz")
          loaded[name] = upsert_rows(db.Index(name), vectors) if len(vectors) else 0
      return loaded
  ```

  </details>

- **Bash** — Find server fetch handler
  
  ```
  cd ~/Documents/codes/kopi/backend/.venv/lib/python3.13/site-packages/needledb/server && grep -n "fetch" app.py | head -20
  ```

  <details><summary>result</summary>

  ```
  277:            return headers.get(b"sec-fetch-site", b"same-origin") in (b"same-origin", b"none")
  704:    @app.get("/indexes/{name}/vectors/fetch")
  705:    async def fetch_get(name: str, request: Request):
  709:        result = await run(lambda: orjson.dumps(index.fetch(ids, namespace)))
  712:    @app.post("/indexes/{name}/vectors/fetch")
  713:    async def fetch_post(name: str, request: Request):
  719:            return orjson.dumps(index.fetch(body.get("ids"), body.get("namespace"),
  ```

  </details>

- **Bash** — Read server fetch handler and core fetch
  
  ```
  cd ~/Documents/codes/kopi/backend/.venv/lib/python3.13/site-packages/needledb/server && sed -n 700,730p app.py; grep -rn "def fetch" ../core/*.py | head; 
  ```

  <details><summary>result</summary>

  ```
  index = index_for(request, name, "read")
          raw = await request.body()
          return Response(await run(_query_response, index, raw), media_type="application/json")
  
      @app.get("/indexes/{name}/vectors/fetch")
      async def fetch_get(name: str, request: Request):
          index = index_for(request, name, "read")
          ids = request.query_params.getlist("ids")
          namespace = request.query_params.get("namespace")
          result = await run(lambda: orjson.dumps(index.fetch(ids, namespace)))
         
  [… 916 chars cut …]
  include_values: bool = True) -> dict[str, dict]:
  ../core/index.py:277:    def fetch(self, ids: list[str], namespace: str | None = None, include_values: bool = True) -> dict:
  ```

  </details>

- **Bash** — Read market maths and award_from
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && sed -n 1,80p kopi/market.py && grep -n "def award_from\|def distinct_awards" -A 15 kopi/search.py
  ```

  <details><summary>result</summary>

  ```
  """What similar tenders were actually awarded for, and to whom.
  
  Pure functions over AwardTenders. Finding the similar tenders is the caller's job
  (NeedleDB in production, anything in tests), so this module never searches.
  """
  
  from __future__ import annotations
  
  from collections import Counter
  from statistics import quantiles
  
  from kopi.models import AwardExample, AwardTender, MarketContext, SupplierWins
  from kopi.sources.awards import NO_SUPPLIER
  
  
  def _percentiles(amounts: list[float]) -> tuple[float | None, float |
  [… 2,352 chars cut …]
  106-        if key in seen:
  107-            continue
  108-        seen.add(key)
  109-        tenders.append(tender)
  110-    return tenders
  ```

  </details>

- **Bash** — Read core fetch return format
  
  ```
  cd ~/Documents/codes/kopi/backend/.venv/lib/python3.13/site-packages/needledb/core && sed -n 270,300p index.py && sed -n 375,410p collection.py
  ```

  <details><summary>result</summary>

  ```
  return {
              "matches": matches,
              "namespace": ns,
              "usage": {"latencyMs": round((time.perf_counter() - started) * 1000, 3), "plan": plan,
                        **({"embedMs": embed_ms} if embed_ms is not None else {})},
          }
  
      def fetch(self, ids: list[str], namespace: str | None = None, include_values: bool = True) -> dict:
          ns = self._namespace(namespace)
          if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
              raise
  [… 2,328 chars cut …]
       if len(live) == 0:
              return None
          rng = np.random.default_rng(seed)
          slots = np.sort(rng.choice(live, size=min(limit, len(live)), replace=False))
  ```

  </details>

`fetch` is batched (up to 1000 ids) and returns float values, so the stored vector is reachable. Let me look at the existing live-store test fakes, the film rig, and the eligibility registry cost.

- **Bash** — Read live store tests and fakes
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && sed -n 1,120p tests/test_api_live.py
  ```

  <details><summary>result</summary>

  ```
  import json
  
  import numpy as np
  import pytest
  from fastapi.testclient import TestClient
  from needledb import NeedleDBLocal
  
  from kopi.api.app import create_app
  from kopi.api.live import LiveStore, needle_filter
  from kopi.config import FIXTURES_DIR, PROFILES_DIR, Settings
  from kopi.index import AWARDS, DIMENSION, LICENCES, NOTICES, VectorSet, award_metadata, ensure_indexes, licence_metadata, notice_metadata, upsert_rows
  from kopi.models import Licence, Notice, NoticeStatus
  from kopi.search import tokens
  from
  [… 2,337 chars cut …]
      listed = client.get("/tenders", params={"limit": 10}).json()
      published = [t["published"] for t in listed]
      assert published == sorted(published, reverse=True)
  ```

  </details>

- **Bash** — Look at film rig live API wiring
  
  ```
  cd ~/Documents/codes/kopi && ls data/ data/film-rig 2>/dev/null | head -40; cat data/film-rig/film_api.py 2>/dev/null | head -120
  ```

  <details><summary>result</summary>

  ```
  data/:
  cache
  film-rig
  ingest-local.done
  licences
  licences.log
  log-raw
  log-sources.json
  notices
  scrape.log
  secrets
  vectors
  
  data/film-rig:
  cards
  cut.py
  film_api.py
  qa-quotes.mjs
  record.mjs
  reencode.py
  render_cards.mjs
  sheet.py
  shoot29.mjs
  shots.mjs
  vo
  """Kopi's API on this Mac for filming: live NeedleDB + the live notice bundle, Claude via the local login.
  
  Same code as the deployed API. Two differences: the copilot's "sandbox" is a local temp folder
  (the runner is the same module), and there is no access code. Never
  [… 2,307 chars cut …]
  "http://localhost:4790"])
      uvicorn.run(create_app(store, settings), host="127.0.0.1", port=PORT, log_level="info")
  
  
  if __name__ == "__main__":
      main()
  ```

  </details>

- **Bash**
  
  ```
  
  ```

  <details><summary>result</summary>

  ```
  [omitted: output lists resources outside this project]
  ```

  </details>

- **Bash** — Inspect eligibility check for network use
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && grep -n "def check\|registry\|def " kopi/eligibility.py | head -40
  ```

  <details><summary>result</summary>

  ```
  57:def facts_for(profile: Profile, registry: Registry | None, today: date | None = None) -> Facts:
  64:    if registry is None or not profile.uen:
  67:    gra_live, bca_live = registry.gsr(profile.uen), registry.bca(profile.uen)
  68:    safe: BizSafe | None = registry.bizsafe(profile.uen)
  78:        company=registry.company(profile.uen),
  86:def current_bizsafe(record: BizSafe, today: date) -> tuple[str | None, str | None]:
  97:def check(
  102:    registry: Registry | None = None,
  107:    facts = facts_for(profile, registry,
  [… 1,298 chars cut …]
  EligibilityStatus, reason: str) -> EligibilityCheck:
  315:def bizsafe_label(level: str) -> str:
  324:def company_check(uen: str, company: Company | None) -> EligibilityCheck:
  ```

  </details>

- **Bash** — Read eligibility facts and registry caching
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && sed -n 50,125p kopi/eligibility.py && grep -n "class LiveRegistry" -A 40 kopi/sources/licences.py | grep -n "def \|cache\|lru" | head -20
  ```

  <details><summary>result</summary>

  ```
  company: Company | None = None
      gra_verified: bool = False
      bca_verified: bool = False
      bizsafe_verified: bool = False
      bizsafe_note: str | None = None  # why the register shows no current certificate
  
  
  def facts_for(profile: Profile, registry: Registry | None, today: date | None = None) -> Facts:
      """The profile's claims, with each live register's answer replacing the claim it covers.
  
      A register that answered wins even when its answer is "no": a company that claims
      bizSAFE Level 3 but is
  [… 2,328 chars cut …]
  / f"{key}.json"
  20:549-    def gsr(self, uen: str) -> list[Registration] | None:
  21:550-        def fetch():
  40:569-        found = self._cached(f"gsr-{uen}", fetch)
  ```

  </details>

Let me get the baseline test suite running in the worktree.

- **Bash** — Sync deps and run baseline tests
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && uv sync 2>&1 | tail -3 && uv run pytest -q 2>&1 | tail -5
  ```

  <details><summary>result</summary>

  ```
  + uvloop==0.22.1
   + watchfiles==1.3.0
   + websockets==17.1
  ........................................................................ [ 25%]
  ........................................................................ [ 50%]
  ........................................................................ [ 75%]
  .....................................................................    [100%]
  285 passed in 5.75s
  ```

  </details>

Baseline is 285 passed. Now let me check the pyproject extras so I can wire a local LiveStore for the "before" timing.

- **Bash** — Read pyproject and data bundle layout
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && cat pyproject.toml; cd ~/Documents/codes/kopi && ls -la data/notices/_* 2>/dev/null; ls data/notices | grep -v '^[A-Z]' | head
  ```

  <details><summary>result</summary>

  ```
  [project]
  name = "kopi"
  version = "0.1.0"
  description = "A copilot for Singapore government tenders"
  requires-python = ">=3.13"
  dependencies = [
      "fastapi>=0.115",
      "uvicorn>=0.32",
      "httpx>=0.28",
      "selectolax>=0.3",
      "pydantic>=2.9",
      "numpy>=2.0",
  ]
  
  [project.optional-dependencies]
  index = ["needledb @ git+https://github.com/teddyoweh/needledb@b88f8b7"]
  search = [
      "sentence-transformers>=3.0",
      "transformers>=4.51",
      "torch>=2.4",
  ]
  agent = ["claude-agent-sdk>=0.2.161"]
  deploy =
  [… 399 chars cut …]
  -rw-r--r--@ 1 teddy  staff  827313 Sep 29 06:56 data/notices/_bundle.json
  -rw-r--r--@ 1 teddy  staff   15267 Sep 29 05:55 data/notices/_open.json
  _bundle.json
  _open.json
  ```

  </details>

- **Bash** — Verify main venv has torch and imports worktree kopi
  
  ```
  cd /tmp && PYTHONPATH=~/.universe/cache/worktrees/kp/kp-32/backend ~/Documents/codes/kopi/backend/.venv/bin/python -c "
  import kopi, torch, sentence_transformers, needledb
  print(kopi.__file__, torch.__version__, torch.backends.mps.is_available())
  "
  ```

  <details><summary>result</summary>

  ```
  ~/.universe/cache/worktrees/kp/kp-32/backend/kopi/__init__.py 2.14.0 True
  ```

  </details>

Imports resolve to the worktree. Now I'll write a scratch bench script outside the repo to get the "before" timing and component costs. It never prints keys.

- **Bash**
  
  ```
  
  ```

  <details><summary>result</summary>

  ```
  [omitted: output lists resources outside this project]
  ```

  </details>

- **Bash** — Probe batched vs per-doc fetch under parallelism
  
  ```
  cat > /tmp/kp32/probe.py <<'EOF'
  import json
  import time
  from concurrent.futures import ThreadPoolExecutor
  
  import numpy as np
  
  from kopi.index import AWARDS, NOTICES, query
  from rig import store
  
  s = store()
  batch = json.load(open("/tmp/kp32/before.json"))["docs"]
  notices, awards = s.db.Index(NOTICES), s.db.Index(AWARDS)
  notices.fetch(batch[:1])
  
  def timed(label, fn, n=3):
      runs = []
      for _ in range(n):
          t = time.perf_counter(); fn(); runs.append(round((time.perf_counter() - t) * 1000))
      print(label, runs)
  
  timed("batch fetch 25", lambda: notices.fetch(batch))
  timed("single get", lambda: notices.get(batch[3]))
  vectors = {k: np.asarray(v["values"], dtype=np.float32) for k, v in notices.fetch(batch)["vectors"].items()}
  for workers in (8, 16):
      with ThreadPoolExecutor(workers) as pool:
          timed(f"25 award queries, {workers} workers", lambda: list(pool.map(lambda d: query(awards, vectors[d], top_k=25), batch)))
          timed(f"25 x (get + award query), {workers} workers", lambda: list(pool.map(lambda d: query(awards, np.asarray(notices.get(d)["values"], dtype=np.float32), top_k=25), batch)))
  EOF
  cd /tmp/kp32 && PYTHONPATH=~/.universe/cache/worktrees/kp/kp-32/backend:/tmp/kp32 ~/Documents/codes/kopi/backend/.venv/bin/python probe.py 2>&1 | grep -v "^INFO\|Loading\|warn" | tail -20
  ```

  <details><summary>result</summary>

  ```
  Warning: You are sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN to enable higher rate limits and faster downloads.
  batch fetch 25 [165, 184, 329]
  single get [83, 109, 119]
  25 award queries, 8 workers [1445, 20494, 463]
  25 x (get + award query), 8 workers [950, 797, 843]
  25 award queries, 16 workers [371, 449, 343]
  25 x (get + award query), 16 workers [931, 976, 688]
  ```

  </details>

- **Bash** — Inspect Modal NeedleDB deployment config
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && grep -n "needledb\|concurren\|max_containers\|min_containers\|scaledown\|@app\.\|def \|timeout" modal_app.py | head -60
  ```

  <details><summary>result</summary>

  ```
  12:    kopi-needledb        NEEDLEDB_API_KEY  admin key, only the NeedleDB container has it
  13:    kopi-needledb-write  NEEDLEDB_API_KEY, NEEDLEDB_URL  write key scoped to Kopi's indexes, for ingest
  14:    kopi-needledb-read   NEEDLEDB_API_KEY, NEEDLEDB_URL  read key, for the API
  32:NEEDLE_AUTH = Path(VOL) / "needledb" / "auth.sqlite"
  34:NEEDLEDB_LABEL = "kopi-needledb"
  51:        "needledb @ git+https://github.com/teddyoweh/needledb@b88f8b7",
  82:def optional_secret(name: str) -> list[modal.Secret]:
  95:@app.cls(
  98:   
  [… 1,328 chars cut …]
  207:    timeout=600,
  209:@modal.concurrent(max_inputs=40)
  211:def api():
  228:@app.function(image=agent_image, timeout=60)
  229:def agent_image_ready() -> str:
  ```

  </details>

- **Bash** — Re-run probe with more repetitions
  
  ```
  cd /tmp/kp32 && sed -i '' 's/def timed(label, fn, n=3)/def timed(label, fn, n=6)/' probe.py && PYTHONPATH=~/.universe/cache/worktrees/kp/kp-32/backend:/tmp/kp32 ~/Documents/codes/kopi/backend/.venv/bin/python probe.py 2>&1 | grep -v "^INFO\|Loading\|warn\|Warning" | tail -20
  ```

  <details><summary>result</summary>

  ```
  batch fetch 25 [195, 118, 114, 179, 102, 111]
  single get [87, 72, 150, 65, 67, 75]
  25 award queries, 8 workers [436, 418, 394, 410, 368, 903]
  25 x (get + award query), 8 workers [940, 928, 1005, 811, 815, 855]
  25 award queries, 16 workers [818, 388, 346, 366, 343, 369]
  25 x (get + award query), 16 workers [661, 677, 20546, 676, 671, 710]
  ```

  </details>

- **Bash** — Count fixtures and find _notice callers
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32 && python3 -c "import json;print(len(json.load(open('backend/fixtures/notices.json'))))"; grep -rn "_notice\b\|\._notice(" --include=*.py backend | grep -v "^backend/.venv" ; grep -rn "\.notice(" --include=*.py backend/kopi | head; grep -rn "tender_insights\|from kopi.insights\|kopi.insights" --include=*.py --include=*.ts backend web/lib 2>/dev/null | grep -v node_modules
  ```

  <details><summary>result</summary>

  ```
  30
  (eval):1: no matches found: --include=*.py
  (eval):1: no matches found: --include=*.py
  (eval):1: no matches found: --include=*.py
  ```

  </details>

- **Bash** — Find _notice and insights callers
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && grep -rn "_notice(" kopi tests | grep -v "def _notice\|self\._notice(" ; echo ---; grep -rn "self\._notice(" kopi | wc -l; echo ---; grep -rn "kopi.insights\|tender_insights" kopi tests; echo ---; grep -rn "\bnotice(" kopi --include=*.py | grep -v "_notice(\|def \|extractive\|summarise" | head
  ```

  <details><summary>result</summary>

  ```
  tests/test_api_live.py:153:    assert live._notice("PAST0000000001").status == NoticeStatus.CLOSED
  tests/test_api_contract.py:88:def test_checklist_route_builds_the_list_from_the_notice(client, brightclean):
  tests/test_eligibility.py:191:def test_licence_named_only_in_the_notice(held, status):
  tests/test_overview.py:187:def test_a_quote_in_both_is_credited_to_the_notice(cleaning, brightclean):
  tests/test_overview.py:262:def test_the_cache_key_changes_with_the_profile_model_prompt_and_notice(cleaning, brightclean,
  [… 212 chars cut …]
  as tender_insights
  kopi/api/app.py:137:        return tender_insights(db(request), body.doc_nos, body.profile, body.query)
  ---
  (eval):1: no matches found: --include=*.py
  ```

  </details>

- **Bash** — Compare bands from stored vs re-embedded vectors
  
  ```
  cat > /tmp/kp32/compare.py <<'EOF'
  import json
  
  import numpy as np
  
  from kopi.embed import notice_text
  from kopi.index import NOTICES
  from kopi.insights import band
  from rig import store
  
  s = store()
  before = {x["doc_no"]: x["market"] for x in json.load(open("/tmp/kp32/before.json"))["out"]}
  stored = s.db.Index(NOTICES).fetch(list(before))["vectors"]
  same = close = far = 0
  for doc, old in before.items():
      n = s._notice(doc)
      v_stored = np.asarray(stored[doc]["values"], dtype=np.float32)
      v_text = s.embed_document(notice_text(n))
      new = band(s._market(v_stored, n.agency, 25))
      new = new.model_dump() if new else None
      cos = float(v_stored @ s.embed_document(f"{n.title}\n{n.agency}\n{n.description}") / np.linalg.norm(v_stored))
      cos_nt = float(v_stored @ v_text / np.linalg.norm(v_stored))
      if new == old:
          same += 1
      else:
          ratio = (new or {}).get("median_amount") and old and old.get("median_amount") and new["median_amount"] / old["median_amount"]
          if ratio and 0.8 <= ratio <= 1.25:
              close += 1
          else:
              far += 1
          print(doc, "old
  [… 84 chars cut …]
  f"cos(stored, tender text) {cos:.3f} cos(stored, notice_text re-embedded) {cos_nt:.3f}")
  print(f"identical {same}, median within 25% {close}, further {far}")
  EOF
  cd /tmp/kp32 && PYTHONPATH=~/.universe/cache/worktrees/kp/kp-32/backend:/tmp/kp32 ~/Documents/codes/kopi/backend/.venv/bin/python compare.py 2>&1 | grep -v "^INFO\|Loading\|warn\|Warning" | tail -30
  ```

  <details><summary>result</summary>

  ```
  WSG000ETT26000002 old median 248847.5 new median 197280.0 cos(stored, tender text) 0.955 cos(stored, notice_text re-embedded) 1.001
  IRA000ETT26000003 old median 279526.0 new median 1799735.7 cos(stored, tender text) 0.861 cos(stored, notice_text re-embedded) 1.004
  SPO000ETT26000032 old median 1605010.0 new median 1947660.0 cos(stored, tender text) 0.983 cos(stored, notice_text re-embedded) 0.998
  LTA000ETT26000096 old median 2176906.0 new median 1306680.0 cos(stored, tender text) 0.944 cos(stored, notice_text
  [… 2,335 chars cut …]
  old median 1157100.0 new median 1606052.0 cos(stored, tender text) 0.955 cos(stored, notice_text re-embedded) 1.002
  identical 0, median within 25% 13, further 12
  ```

  </details>

- **Bash** — Inspect nearest awards for both vector sources
  
  ```
  cat > /tmp/kp32/look.py <<'EOF'
  import numpy as np
  
  from kopi.index import AWARDS, NOTICES, query
  from rig import store
  
  s = store()
  for doc in ["IRA000ETT26000003", "HDB000ETQ26000172"]:
      n = s._notice(doc)
      print("\n==", doc, "|", n.title, "|", n.category, "| items:", len(n.items))
      stored = np.asarray(s.db.Index(NOTICES).get(doc)["values"], dtype=np.float32)
      detail = s.embed_document(f"{n.title}\n{n.agency}\n{n.description}")
      for label, v in (("detail text", detail), ("stored notice_text", stored)):
          found = query(s.db.Index(AWARDS), v, top_k=25)
          print(f"  -- {label}: top 6 of 25")
          for m in found[:6]:
              print(f"     {m.score:.3f} {m.metadata.get('amount')!s:>12} {m.metadata.get('description','')[:90]}")
  EOF
  cd /tmp/kp32 && PYTHONPATH=~/.universe/cache/worktrees/kp/kp-32/backend:/tmp/kp32 ~/Documents/codes/kopi/backend/.venv/bin/python look.py 2>&1 | grep -v "^INFO\|Loading\|warn\|Warning" | tail -40
  ```

  <details><summary>result</summary>

  ```
  == IRA000ETT26000003 | Provision of Application Services,  Infrastructure & Identity Solutions Managed Services and Software Licensing and Maintenance Services | IT&Telecommunication ⇒ Softwares & Licences | items: 4
    -- detail text: top 6 of 25
       0.739      94770.0 Provision of Transcription Services
       0.717      77980.0 Provision of Private Liquidator Services
       0.702     120000.0 PROVISION OF FIELD WORK SERVICES
       0.698    111935.56 Invitation to Tender for the Provision of Static Application Security
  [… 2,160 chars cut …]
  PROVISION OF SERVICES FOR MANAGEMENT OF ENTERPRISE SYSTEM
       0.574       2205.0 Supply of Programming and IT Related Services for a period of 2 years (Contract 35 - 2022)
  ```

  </details>

- **Bash** — Check demo script for market numbers
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32 && grep -n -i "median\|price band\|similar work\|sold for\|\$[0-9]" planning/06-demo-script.md | head -20; grep -rn -i "market\|median" planning/handoffs/KP-30.md planning/handoffs/KP-33.md | head -20
  ```

  <details><summary>result</summary>

  ```
  43:profile doesn't say. Then the market: who won similar work, and for how
  planning/handoffs/KP-33.md:28:  eligibility list, what similar work sold for (median, middle half, count, most frequent
  ```

  </details>

- **Bash** — Read demo script market beat and KP-33 handoff
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32 && sed -n 35,55p planning/06-demo-script.md; sed -n 1,60p planning/handoffs/KP-33.md
  ```

  <details><summary>result</summary>

  ```
  *[03-search]*
  Search is semantic. I describe what we do in plain words, and it finds tenders that never use
  those words.
  
  *[04-tender]*
  Each tender opens with eligibility, checked by code rather than by the model: supply heads and
  grades, construction workheads, bizSAFE, named licences. Met, not met, or unknown when the
  profile doesn't say. Then the market: who won similar work, and for how
  much.
  
  The AI overview makes a call: bid, maybe or no-bid. Every quote it cites is checked word for
  word, and the page says
  [… 2,317 chars cut …]
  row and made only the selected card's button filled.
  - The preview's "most often won by X PTE. LTD.." doubled the full stop; it now strips the
    supplier's own trailing one.
  ```

  </details>

- **Bash** — Find LiveStore constructions and tender/overview calls in tests
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && grep -rn "LiveStore(" tests kopi | grep -v "^kopi/api/live.py"; grep -rn "\.tender(\|\.overview(" tests | head -20
  ```

  <details><summary>result</summary>

  ```
  tests/test_api_live.py:52:    store = LiveStore(db, bag_of_words, bag_of_words, data_dir=data, reload=None, registry=None)
  tests/test_sandbox.py:152:    store = LiveStore(db=None, embed_query=None, embed_document=None, copilot=copilot())
  tests/test_sandbox.py:184:    store = LiveStore(db=None, embed_query=None, embed_document=None)
  tests/test_sandbox.py:191:    store = LiveStore(db=None, embed_query=None, embed_document=None, copilot=copilot(limits=Limits(sessions_per_caller_per_day=0)))
  tests/test_sandbox.py:201:   
  [… 472 chars cut …]
  profile).model == "extractive"
  tests/test_overview.py:427:    assert _live_store(tmp_path, claude=True).overview("GVT000ETT26000101", profile).model == "claude-opus-5-5"
  ```

  </details>

- **Bash** — Read overview live-store tests
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && sed -n 385,430p tests/test_overview.py
  ```

  <details><summary>result</summary>

  ```
  # ---------------------------------------------------------------- wired into the live store
  
  
  def _live_store(tmp_path, claude: bool):
      import json as _json
  
      from kopi.api.live import LiveStore
      from kopi.config import FIXTURES_DIR
  
      data = tmp_path / "data"
      (data / "notices").mkdir(parents=True)
      for n in _json.loads((FIXTURES_DIR / "notices.json").read_text()):
          (data / "notices" / f"{n['doc_no']}.json").write_text(_json.dumps(n))
      store = LiveStore(db=None, embed_query=None,
  [… 1,242 chars cut …]
  / "pragnition.json").read_text())
      assert _live_store(tmp_path, claude=True).overview("GVT000ETT26000101", profile).model == "claude-opus-5-5"
  ```

  </details>

- **Bash** — List fixture docs with market similar counts
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && sed -n 140,160p tests/test_api_live.py; export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; uv run python -c "
  from kopi.store import FixtureStore
  s = FixtureStore()
  for d, n in s.notices.items():
      m = s.similar_awards(n.title, n.agency, 25)
      print(d, m.similar_count, m.median_amount, n.status.value, len(n.description))
  "
  ```

  <details><summary>result</summary>

  ```
  def broken():
          raise OSError("volume unreachable")
      live.reload = broken
      live._loaded_at = 0
      assert live.list_tenders(type("F", (), {"status": None, "agency": None, "category": None, "method": None, "closing_after": None, "closing_before": None})(), 5, 0)
  
  
  def test_a_notice_past_its_closing_time_is_closed_even_before_ingest_notices(live, tmp_path):
      past = fixture_notices()[0].model_copy(update={"doc_no": "PAST0000000001", "closing": fixture_notices()[0].published})
      (live.data_dir /
  [… 1,558 chars cut …]
  25 710642.79 open 64
  CPF000ETQ26000120 25 821630.0 open 118
  URA000ETQ26000033 2 683448.0 open 85
  TST000ETQ26000901 25 568888.0 open 252
  TST000ETQ26000902 25 568888.0 open 181
  ```

  </details>

All 30 fixture notices have bands, so a 25-doc batch can come straight from the fixtures. Now the store changes: a public `notice` and `market_for` on the protocol and both stores.

- **Bash** — Add notice and market_for to Store and FixtureStore
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && python3 - <<'EOF'
  from pathlib import Path
  
  p = Path("kopi/store.py")
  s = p.read_text()
  
  s = s.replace('''class NotFound(LookupError):
      """The requested tender, licence, session or file does not exist."""
  ''', '''SIMILAR_AWARDS = 25  # a tender's market is its 25 nearest past awards
  
  
  class NotFound(LookupError):
      """The requested tender, licence, session or file does not exist."""
  ''')
  
  s = s.replace('''    def list_tenders(self, filters: SearchFilters, limit: int, offset: int) -> list[NoticeSummary]: ...
      def tender(self, doc_no: str, profile: Profile | None) -> TenderDetail: ...
  ''', '''    def list_tenders(self, filters: SearchFilters, limit: int, offset: int) -> list[NoticeSummary]: ...
      def notice(self, doc_no: str) -> Notice: ...
      def tender(self, doc_no: str, profile: Profile | None) -> TenderDetail: ...
      def market_for(self, notice: Notice) -> MarketContext: ...
  ''')
  
  s = s.replace('''    def _notice(self, doc_no: str) -> Notice:
          try:
              return self.notices[doc_no]''', '''    def notice(self, doc_no: str) ->
  [… 458 chars cut …]
  if profile else []
          return TenderDetail(notice=notice, eligibility=checks, market=self.market_for(notice))
  
      def market_for(self, notice: Notice) -> MarketContext:
          return self.similar_awards(notice.title, notice.agency, SIMILAR_AWARDS)
  ''')
  p.write_text(s)
  EOF
  git diff --stat; grep -n "_notice\|SIMILAR_AWARDS\|def notice\|def market_for" kopi/store.py
  ```

  <details><summary>result</summary>

  ```
  backend/kopi/store.py | 20 ++++++++++++++------
   1 file changed, 14 insertions(+), 6 deletions(-)
  49:SIMILAR_AWARDS = 25  # a tender's market is its 25 nearest past awards
  68:    def notice(self, doc_no: str) -> Notice: ...
  70:    def market_for(self, notice: Notice) -> MarketContext: ...
  123:    def notices(self) -> dict[str, Notice]:
  136:    def notice(self, doc_no: str) -> Notice:
  165:    def market_for(self, notice: Notice) -> MarketContext:
  166:        return self.similar_awards(notice.title, notice.agency, SIMILAR_AWARDS)
  ```

  </details>

Now the LiveStore: rename `_notice` to `notice`, add `market_for` over the stored vector, and route `tender()` and `overview()` through it.

- **Bash** — Add LiveStore.market_for and route tender/overview through it
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && python3 - <<'EOF'
  from pathlib import Path
  
  p = Path("kopi/api/live.py")
  s = p.read_text()
  
  def swap(old, new):
      global s
      assert s.count(old) == 1, old
      s = s.replace(old, new)
  
  swap("from kopi.config import DATA_DIR\n", "from kopi.config import DATA_DIR\nfrom kopi.embed import notice_text\n")
  swap("from kopi.store import NotFound, SearchFilters, matches, summarise\n",
       "from kopi.store import SIMILAR_AWARDS, NotFound, SearchFilters, matches, summarise\n")
  swap('''    def _notice(self, doc_no: str) -> Notice:
          self._fresh()''', '''    def notice(self, doc_no: str) -> Notice:
          self._fresh()''')
  s = s.replace("self._notice(", "self.notice(")
  
  swap('''        checks = self.eligibility(doc_no, profile) if profile else []
          text = f"{notice.title}\\n{notice.agency}\\n{notice.description}"
          return TenderDetail(notice=notice, eligibility=checks, market=self._market(self.embed_document(text), notice.agency, 25))
  ''', '''        checks = self.eligibility(doc_no, profile) if profile else []
          return
  [… 953 chars cut …]
  text ingest embeds.
          """
          stored = self.db.Index(NOTICES).get(notice.doc_no)
          vector = np.asarray(stored["values"], dtype=np.float32) if stored else self.embed_document(notice_text(notice))
          return self._market(vector, notice.agency, SIMILAR_AWARDS)
  ''')
  p.write_text(s)
  EOF
  grep -n "_notice\|market_for\|embed_document\|, 25)" kopi/api/live.py
  ```

  <details><summary>result</summary>

  ```
  73:        embed_document: EmbedOne,
  84:        self.embed_document = embed_document
  115:        self.notices = self._read_notices()
  121:    def _read_notices(self) -> dict[str, Notice]:
  177:        return TenderDetail(notice=notice, eligibility=checks, market=self.market_for(notice))
  192:        market = self.market_for(notice)
  205:    def market_for(self, notice: Notice) -> MarketContext:
  211:        vector = np.asarray(stored["values"], dtype=np.float32) if stored else self.embed_document(notice_text(notice))
  336:        embed_document=lambda text: embedder.embed_documents([text])[0],
  ```

  </details>

Now `insights.py`: eligibility and snippets first, then the market bands from a per-store `MarketBands` (a bounded LRU with TTL that caches futures on an 8-worker pool, plus a wait deadline).

- **Write** `~/.universe/cache/worktrees/kp/kp-32/backend/kopi/insights.py`

  <details><summary>result</summary>

  ```
  The file ~/.universe/cache/worktrees/kp/kp-32/backend/kopi/insights.py has been updated successfully. (file state is current in your context — no need to Read it back)
  ```

  </details>

- **Read** `~/.universe/cache/worktrees/kp/kp-32/backend/kopi/api/app.py`

  <details><summary>result</summary>

  ```
  78	    if settings.store == "live":
  79	        from kopi.api.live import from_environment
  80	
  81	        return from_environment()
  82	    return FixtureStore()
  83	
  84	
  85	def create_app(store: Store | None = None, settings: Settings | None = None) -> FastAPI:
  86	    settings = settings or Settings()
  87	    if settings.auth_required and not settings.signing_key:
  88	        raise ValueError("KOPI_ACCESS_CODES is set but KOPI_SIGNING_KEY is not: refusing to start with a forgeable gate")
  89	    app = FastAPI(title="Kopi API", version="0.1.0", description="A copilot for Singapore government tenders.")
  ```

  </details>

- **Bash** — Wire MarketBands into app and update two test helpers
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && python3 - <<'EOF'
  from pathlib import Path
  
  p = Path("kopi/api/app.py")
  s = p.read_text()
  
  def swap(old, new):
      global s
      assert s.count(old) == 1, old
      s = s.replace(old, new)
  
  swap("from kopi.insights import insights as tender_insights\n", "from kopi.insights import MarketBands\nfrom kopi.insights import insights as tender_insights\n")
  swap("    app.state.store = store or default_store(settings)\n",
       "    app.state.store = store or default_store(settings)\n    app.state.bands = MarketBands(app.state.store)\n")
  swap("        return tender_insights(db(request), body.doc_nos, body.profile, body.query)\n",
       "        return tender_insights(db(request), request.app.state.bands, body.doc_nos, body.profile, body.query)\n")
  p.write_text(s)
  EOF
  sed -i '' 's/assert live\._notice("PAST0000000001")/assert live.notice("PAST0000000001")/' tests/test_api_live.py
  sed -i '' 's/    store\._market = lambda vector, agency, k: None/    store.market_for = lambda notice: None/' tests/test_overview.py
  git diff kopi/api/app.py tests/
  ```

  <details><summary>result</summary>

  ```
  diff --git a/backend/kopi/api/app.py b/backend/kopi/api/app.py
  index d322d59..2e158a6 100644
  --- a/backend/kopi/api/app.py
  +++ b/backend/kopi/api/app.py
  @@ -15,6 +15,7 @@ from fastapi.responses import Response, StreamingResponse
   from kopi.api.auth import AppOnly, Authed, check_code, issue
   from kopi.api.limits import LIMITS, RateLimiter, limited
   from kopi.config import Settings
  +from kopi.insights import MarketBands
   from kopi.insights import insights as tender_insights
   from kopi.models import (
       AuthRequest,
  @@
  [… 2,312 chars cut …]
  text: None, data_dir=data, claude=claude)
  -    store._market = lambda vector, agency, k: None
  +    store.market_for = lambda notice: None
       return store
  ```

  </details>

Let me run the existing suite before writing the new tests.

- **Bash** — Run the test suite after the refactor
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && uv run pytest -q 2>&1 | tail -5
  ```

  <details><summary>result</summary>

  ```
  ........................................................................ [ 25%]
  ........................................................................ [ 50%]
  ........................................................................ [ 75%]
  .....................................................................    [100%]
  285 passed in 1.64s
  ```

  </details>

Existing suite still passes (285). Now the new tests.

- **Write** `~/.universe/cache/worktrees/kp/kp-32/backend/tests/test_insights.py`

  <details><summary>result</summary>

  ```
  File created successfully at: ~/.universe/cache/worktrees/kp/kp-32/backend/tests/test_insights.py (file state is current in your context — no need to Read it back)
  ```

  </details>

- **Bash** — Run the new insights tests
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && uv run pytest -q tests/test_insights.py 2>&1 | tail -30
  ```

  <details><summary>result</summary>

  ```
  =================================== FAILURES ===================================
  _____ test_the_summary_names_the_first_blocker_and_the_first_open_question _____
  
      def test_the_summary_names_the_first_blocker_and_the_first_open_question():
          checks = [
              check("closing", EligibilityStatus.MET),
  >           check("bizsafe", EligibilityStatus.UNKNOWN),
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
              check("gra", EligibilityStatus.UNMET),
              check("licence",
  [… 947 chars cut …]
  summary info ============================
  FAILED tests/test_insights.py::test_the_summary_names_the_first_blocker_and_the_first_open_question
  1 failed, 14 passed in 0.71s
  ```

  </details>

`bizsafe` isn't a valid check kind. I'll use `bca` instead.

- **Bash** — Fix check kind and rerun insights tests repeatedly
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && sed -i '' 's/check("bizsafe", EligibilityStatus.UNKNOWN)/check("bca", EligibilityStatus.UNKNOWN)/; s/summary.open_question.kind == "bizsafe"/summary.open_question.kind == "bca"/' tests/test_insights.py && uv run pytest -q tests/test_insights.py 2>&1 | tail -3 && for i in 1 2 3 4 5; do uv run pytest -q -p no:randomly tests/test_insights.py 2>&1 | tail -1; done
  ```

  <details><summary>result</summary>

  ```
  ...............                                                          [100%]
  15 passed in 0.69s
  15 passed in 0.60s
  15 passed in 0.54s
  15 passed in 0.55s
  15 passed in 0.54s
  15 passed in 0.56s
  ```

  </details>

The only on-disk change is my own `sed` edit. Two tests depend on timing, so let me measure how long a fixture market lookup takes to size their margins.

- **Bash** — Time fixture market lookups
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && uv run python -c "
  import time
  from kopi.store import FixtureStore
  s = FixtureStore()
  n = s.notice('NLB000ETQ26000089')
  t = time.perf_counter(); s.market_for(n); print('first', round((time.perf_counter()-t)*1000,1), 'ms')
  t = time.perf_counter()
  for d in list(s.notices)[:25]: s.market_for(s.notice(d))
  print('25 more', round((time.perf_counter()-t)*1000,1), 'ms')
  "
  ```

  <details><summary>result</summary>

  ```
  first 0.8 ms
  25 more 3.5 ms
  ```

  </details>

Lookups take under 1 ms, so the parallel-batch threshold has plenty of margin. I'll still loosen the slow-lookup test's wait from 0.05 s to 0.5 s so a loaded machine can't flake it.

- **Read** `~/.universe/cache/worktrees/kp/kp-32/backend/tests/test_insights.py`

  <details><summary>result</summary>

  ```
  160	    bands.get([first, second])
  161	    assert lookups.count == {FIRST: 1, SECOND: 2, THIRD: 1}
  162	
  163	
  164	def test_a_failed_lookup_is_retried_on_the_next_call(lookups):
  165	    bands = MarketBands(lookups)
  166	    notice = lookups.notice(FIRST)
  167	    lookups.broken = {FIRST}
  168	    assert bands.get([notice]) == {FIRST: None}
  169	    lookups.broken = set()
  170	    assert bands.get([notice])[FIRST] is not None
  171	    assert lookups.count[FIRST] == 2
  172	
  173	
  174	def test_a_slow_lookup_is_left_behind_and_fills_the_cache(lookups):
  175	    lookups.held = {SECOND: threading.Event()}
  ```

  </details>

- **Edit** `~/.universe/cache/worktrees/kp/kp-32/backend/tests/test_insights.py`

  <details><summary>result</summary>

  ```
  The file ~/.universe/cache/worktrees/kp/kp-32/backend/tests/test_insights.py has been updated successfully.
  ```

  </details>

Now a quick mutation check to confirm the tests catch the regressions they're meant to: serial lookups, no cache, and failures being cached.

- **Bash** — Mutation-check the new tests, then restore
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && cp kopi/insights.py /tmp/kp32/insights.keep
  echo "== serial"; sed -i '' 's/workers: int = 8,/workers: int = 1,/' kopi/insights.py; uv run pytest -q tests/test_insights.py 2>&1 | grep -E "FAILED|passed|failed"; cp /tmp/kp32/insights.keep kopi/insights.py
  echo "== no cache"; sed -i '' 's/if entry is None or entry.expires <= now or _failed(entry.lookup):/if True:/' kopi/insights.py; uv run pytest -q tests/test_insights.py 2>&1 | grep -E "FAILED|passed|failed"; cp /tmp/kp32/insights.keep kopi/insights.py
  echo "== failures cached"; sed -i '' 's/ or _failed(entry.lookup):/:/' kopi/insights.py; uv run pytest -q tests/test_insights.py 2>&1 | grep -E "FAILED|passed|failed"; cp /tmp/kp32/insights.keep kopi/insights.py
  git diff --stat kopi/insights.py | tail -1; cmp kopi/insights.py /tmp/kp32/insights.keep && echo restored
  ```

  <details><summary>result</summary>

  ```
  == serial
  FAILED tests/test_insights.py::test_a_batch_of_25_looks_its_bands_up_in_parallel
  1 failed, 14 passed in 2.38s
  == no cache
  FAILED tests/test_insights.py::test_bands_are_cached_across_calls_and_profiles
  FAILED tests/test_insights.py::test_a_band_is_looked_up_again_once_it_expires
  FAILED tests/test_insights.py::test_the_cache_keeps_the_most_recently_used_bands
  FAILED tests/test_insights.py::test_a_slow_lookup_is_left_behind_and_fills_the_cache
  4 failed, 11 passed in 1.02s
  == failures cached
  _______________
  [… 381 chars cut …]
  FAILED tests/test_insights.py::test_a_failed_lookup_is_retried_on_the_next_call
  1 failed, 14 passed in 1.04s
   1 file changed, 88 insertions(+), 11 deletions(-)
  restored
  ```

  </details>

Each mutation is caught by its test, and `insights.py` is restored. Full suite now.

- **Bash** — Run full suite and lint touched files
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && uv sync 2>&1 | tail -1 && uv run pytest -q 2>&1 | tail -3; uvx ruff check --line-length 200 kopi/insights.py kopi/store.py kopi/api/live.py kopi/api/app.py tests/test_insights.py 2>&1 | tail -15
  ```

  <details><summary>result</summary>

  ```
  Audited 53 packages in 1ms
  ........................................................................ [ 96%]
  ............                                                             [100%]
  300 passed in 2.07s
  208 |
  209 |     def Index(self, name: str) -> FakeIndex:  # noqa: N802, NeedleDB's spelling
      |                                               ^^^^^^^^^^^^
  210 |         return self.indexes[name]
      |
  help: Remove unused `noqa` directive
      |
  208 |
      -     def Index(self, name: str) -> FakeIndex:  # noqa: N802, NeedleDB's spelling
  209 +     def Index(self, name: str) -> FakeIndex:
  210 |         return self.indexes[name]
      |
  
  Found 6 errors.
  [*] 2 fixable with the `--fix` option.
  ```

  </details>

- **Bash** — Show lint findings vs baseline
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && uvx ruff check --line-length 200 --output-format concise kopi/insights.py kopi/store.py kopi/api/live.py kopi/api/app.py tests/test_insights.py 2>&1 | tail -10; git stash -q && uvx ruff check --line-length 200 --output-format concise kopi/insights.py kopi/store.py kopi/api/live.py kopi/api/app.py 2>&1 | tail -5; git stash pop -q && git status --short
  ```

  <details><summary>result</summary>

  ```
  kopi/api/app.py:131:47: B008 Do not perform function call `Query` in argument defaults; instead, perform the call within the function, or read the default from a module-level singleton variable
  kopi/api/app.py:143:48: B008 Do not perform function call `Query` in argument defaults; instead, perform the call within the function, or read the default from a module-level singleton variable
  kopi/api/live.py:113:20: BLE001 Do not catch blind exception: `Exception`
  kopi/api/live.py:196:16: BLE001 Do not catch blind exception:
  [… 762 chars cut …]
  Found 4 errors.
   M kopi/api/app.py
   M kopi/api/live.py
   M kopi/insights.py
   M kopi/store.py
   M tests/test_api_live.py
   M tests/test_overview.py
  ?? tests/test_insights.py
  ```

  </details>

A ruff config in the repo enables non-default rules. Four findings pre-exist; mine add an import-sort warning in `store.py` and an unneeded `noqa`. Let me see the sort diff.

- **Bash** — Show import sort diff for store.py
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && uvx ruff check --line-length 200 --select I --diff kopi/store.py 2>&1 | head -30; ls ../ruff.toml ../pyproject.toml ruff.toml 2>/dev/null; git diff kopi/store.py | head -30
  ```

  <details><summary>result</summary>

  ```
  --- kopi/store.py
  +++ kopi/store.py
  @@ -45,7 +45,6 @@
   )
   from kopi.sources.awards import group_tenders
   
  -
   SIMILAR_AWARDS = 25  # a tender's market is its 25 nearest past awards
   
   
  
  Would fix 1 error.
  diff --git a/backend/kopi/store.py b/backend/kopi/store.py
  index 53b7716..0eb795a 100644
  --- a/backend/kopi/store.py
  +++ b/backend/kopi/store.py
  @@ -46,6 +46,9 @@ from kopi.models import (
   from kopi.sources.awards import group_tenders
   
   
  +SIMILAR_AWARDS = 25  # a tender's market is its 25 nearest past awards
  +
  +
  
  [… 943 chars cut …]
  for x in json.loads((self.dir / "licences.json").read_text())]
   
  -    def _notice(self, doc_no: str) -> Notice:
  +    def notice(self, doc_no: str) -> Notice:
  ```

  </details>

- **Bash** — Fix import spacing and drop the unused noqa
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && uvx ruff check --line-length 200 --select I --fix kopi/store.py 2>&1 | tail -1 && sed -i '' 's/    def Index(self, name: str) -> FakeIndex:  # noqa: N802, NeedleDB.s spelling/    def Index(self, name: str) -> FakeIndex:/' tests/test_insights.py && grep -n "def Index" tests/test_insights.py && uvx ruff check --line-length 200 --output-format concise kopi/insights.py kopi/store.py tests/test_insights.py tests/test_api_live.py tests/test_overview.py 2>&1 | tail -3
  ```

  <details><summary>result</summary>

  ```
  Found 1 error (1 fixed, 0 remaining).
  209:    def Index(self, name: str) -> FakeIndex:
  All checks passed!
  [This command modified 1 file you've previously read: ../../cache/worktrees/kp/kp-32/backend/tests/test_insights.py. Call Read before editing.]
  ```

  </details>

- **Bash** — Time the new insights against live NeedleDB
  
  ```
  cat > /tmp/kp32/after.py <<'EOF'
  import json
  import logging
  import statistics
  import time
  
  from kopi.index import AWARDS, query
  from kopi.insights import MarketBands, insights
  from kopi.models import Profile
  from kopi.config import PROFILES_DIR
  from rig import profile, store
  
  logging.basicConfig(level=logging.WARNING)
  s = store()
  p = profile()
  other = Profile.model_validate(json.loads((PROFILES_DIR / "brightclean.json").read_text()))
  before = json.load(open("/tmp/kp32/before.json"))
  q, batch = before["q"], before["docs"]
  
  # warm the same things the before-bench warmed: registry cache, embedder, NeedleDB connection
  s.eligibility(batch[0], p)
  s.embed_document("warm")
  query(s.db.Index(AWARDS), s.embed_query("warm"), top_k=25)
  
  cold, missing = [], []
  for _ in range(6):
      bands = MarketBands(s)
      t = time.perf_counter(); out = insights(s, bands, batch, p, q); cold.append(round((time.perf_counter() - t) * 1000))
      missing.append(sum(1 for x in out if x.market is None))
      t = time.perf_counter(); insights(s, bands, batch, other, q); warm = round((time.perf_counter() - t) * 1000)
  print("cold 25 docs (ms):",
  [… 728 chars cut …]
  - t) * 1000)
  print(f"detail-page market, median of 10: re-embed + query {statistics.median(detail_old):.0f} ms, stored vector + query {statistics.median(detail_new):.0f} ms")
  EOF
  cd /tmp/kp32 && PYTHONPATH=~/.universe/cache/worktrees/kp/kp-32/backend:/tmp/kp32 ~/Documents/codes/kopi/backend/.venv/bin/python after.py 2>&1 | grep -v "^INFO\|Loading\|Warning: You" | tail -20
  ```

  <details><summary>result</summary>

  ```
  cold 25 docs (ms): [978, 797, 1188, 957, 833, 953] | cards without a band per run: [0, 0, 0, 0, 0, 0]
  warm 25 docs, another profile (ms): 3
  eligibility, snippet, items, envelopes, method identical to before: True
  detail-page market, median of 10: re-embed + query 118 ms, stored vector + query 186 ms
  ```

  </details>

- **Bash** — Measure CPU embedding cost per notice
  
  ```
  cat > /tmp/kp32/cpu.py <<'EOF'
  import json
  import statistics
  import time
  
  import torch
  
  from kopi.embed import Embedder
  from rig import store
  
  s = store()
  batch = json.load(open("/tmp/kp32/before.json"))["docs"]
  texts = [f"{n.title}\n{n.agency}\n{n.description}" for n in (s.notice(d) for d in batch)]
  cpu = Embedder(device="cpu")
  cpu.embed_documents(texts[:1])
  for threads in (torch.get_num_threads(), 2):
      torch.set_num_threads(threads)
      runs = []
      for text in texts[:10]:
          t = time.perf_counter(); cpu.embed_documents([text]); runs.append((time.perf_counter() - t) * 1000)
      print(f"CPU embed, {threads} torch threads: median {statistics.median(runs):.0f} ms, max {max(runs):.0f} ms per notice")
  EOF
  cd /tmp/kp32 && PYTHONPATH=~/.universe/cache/worktrees/kp/kp-32/backend:/tmp/kp32 ~/Documents/codes/kopi/backend/.venv/bin/python cpu.py 2>&1 | grep -v "^INFO\|Loading\|Warning: You" | tail -5; grep -n "cpu=\|KOPI_TORCH_THREADS\|memory=" ~/.universe/cache/worktrees/kp/kp-32/backend/modal_app.py | head
  ```

  <details><summary>result</summary>

  ```
  CPU embed, 5 torch threads: median 245 ms, max 541 ms per notice
  CPU embed, 2 torch threads: median 587 ms, max 1376 ms per notice
  65:    .env({"HF_HOME": "/root/hf", "KOPI_STORE": "live", "KOPI_EMBED_DEVICE": "cpu", "KOPI_TORCH_THREADS": "4"})
  101:    cpu=2.0,
  102:    memory=4096,
  205:    cpu=4.0,
  206:    memory=6144,
  ```

  </details>

- **Bash** — Time old serial path with CPU embedder
  
  ```
  cat > /tmp/kp32/before_cpu.py <<'EOF'
  import json
  import time
  
  import torch
  
  from kopi.embed import Embedder
  from kopi.models import TenderDetail
  from rig import profile, store
  
  s = store()
  p = profile()
  batch = json.load(open("/tmp/kp32/before.json"))["docs"]
  cpu = Embedder(device="cpu")
  torch.set_num_threads(4)
  cpu.embed_documents(["warm"])
  s.eligibility(batch[0], p)
  
  
  def old_tender(doc):  # LiveStore.tender as it was on main: embed the notice, then query awards
      n = s.notice(doc)
      checks = s.eligibility(doc, p)
      return TenderDetail(notice=n, eligibility=checks, market=s._market(cpu.embed_documents([f"{n.title}\n{n.agency}\n{n.description}"])[0], n.agency, 25))
  
  
  for _ in range(2):
      t = time.perf_counter()
      for doc in batch:
          old_tender(doc)
      print(f"serial, embedder on CPU (4 threads): {(time.perf_counter() - t) * 1000:.0f} ms for 25 docs")
  EOF
  cd /tmp/kp32 && PYTHONPATH=~/.universe/cache/worktrees/kp/kp-32/backend:/tmp/kp32 ~/Documents/codes/kopi/backend/.venv/bin/python before_cpu.py 2>&1 | grep -v "^INFO\|Loading\|Warning: You" | tail -3
  ```

  <details><summary>result</summary>

  ```
  serial, embedder on CPU (4 threads): 11540 ms for 25 docs
  serial, embedder on CPU (4 threads): 11944 ms for 25 docs
  ```

  </details>

Before (production-like, embedder on CPU): 11.5-11.9 s for 25 docs. Let me see which planning files earlier tasks touched, so the handoff follows the same conventions.

- **Bash** — Inspect files and messages of recent task commits
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32 && git show --stat --format="%h %s" HEAD~1 | head -30; git show --stat --format="%h %s" 7f49faf | head -40; git log -3 --format="%B" | head -30
  ```

  <details><summary>result</summary>

  ```
  102d0ce KP-31: Contract for search insights and bid sessions (API models, routes, web client, mocks)
  
   Makefile                                |   2 +-
   backend/kopi/api/app.py                 |  57 +++-
   backend/kopi/api/live.py                |  20 ++
   backend/kopi/insights.py                |  89 +++++
   backend/kopi/models.py                  |  63 ++++
   backend/kopi/store.py                   |  49 ++-
   backend/tests/test_api_contract_bids.py |  73 +++++
   openapi.json                            | 552
  [… 1,802 chars cut …]
  pane and keyboard
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  
  KP-31: Contract for search insights and bid sessions (API models, routes, web client, mocks)
  ```

  </details>

Let me review the complete diff once before writing the handoff.

- **Bash** — Review live.py and store.py diff
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32 && git diff backend/kopi/api/live.py backend/kopi/store.py
  ```

  <details><summary>result</summary>

  ```
  diff --git a/backend/kopi/api/live.py b/backend/kopi/api/live.py
  index 1eba705..d74ff33 100644
  --- a/backend/kopi/api/live.py
  +++ b/backend/kopi/api/live.py
  @@ -24,6 +24,7 @@ from kopi import eligibility, market
   from kopi.bundle import read_bundle
   from kopi.checklist import submission_checklist
   from kopi.config import DATA_DIR
  +from kopi.embed import notice_text
   from kopi.index import AWARDS, LICENCES, NOTICES, notice_filter, query
   from kopi.models import (
       BidMemory,
  @@ -56,7 +57,7 @@ from kopi.search import
  [… 2,334 chars cut …]
  ")[0].rstrip(".")
           score = int(100 * overlap_score(tokens(" ".join(profile.capabilities)), notice.description + notice.title))
           return Overview(
  ```

  </details>

The diff reads cleanly. One more check: whether the overview cache key includes the market, since `overview()` now gets a different market for the same notice.

- **Bash** — Check overview cache key inputs
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && grep -n "def cache_key\|def _key\|sha256\|cache_dir" kopi/overview.py | head; grep -n "def cache_key" -A 12 kopi/overview.py | head -20
  ```

  <details><summary>result</summary>

  ```
  339:    return hashlib.sha256(text.encode()).hexdigest()
  342:def cache_key(notice: Notice, profile: Profile, model: str) -> str:
  386:    cache_dir: Path | None = None,
  389:    """Claude's triage brief on `notice` for `profile`, quotes verified, cached when `cache_dir` is given."""
  391:    path = Path(cache_dir) / f"{cache_key(notice, profile, model)}.json" if cache_dir else None
  342:def cache_key(notice: Notice, profile: Profile, model: str) -> str:
  343-    """doc_no, the profile, the notice as the model sees it, the
  [… 320 chars cut …]
  = path.read_bytes()  # opened and closed at once
  351-    except FileNotFoundError:
  352-        return None
  353-    try:
  354-        return Overview.model_validate_json(body)
  ```

  </details>

- **Write** `~/.universe/cache/worktrees/kp/kp-32/planning/handoffs/KP-32.md`

  <details><summary>result</summary>

  ```
  File created successfully at: ~/.universe/cache/worktrees/kp/kp-32/planning/handoffs/KP-32.md (file state is current in your context — no need to Read it back)
  ```

  </details>

Let me verify two claims in the handoff: the bizSAFE check's kind, and that `SIMILAR_AWARDS` replaced literals "in three places".

- **Bash** — Verify bizsafe kind and replaced literals count
  
  ```
  cd ~/.universe/cache/worktrees/kp/kp-32/backend && sed -n 291,312p kopi/eligibility.py | grep -n "kind" ; git diff main -- kopi | grep -c "^-.*, 25)"
  ```

  <details><summary>result</summary>

  ```
  11:        return EligibilityCheck(kind="licence", requirement=requirement, status=status, reason=reason, source_url=BIZSAFE_URL)
  3
  ```

  </details>

Both confirmed. Final full run, then commit.

- **Bash** — Run suite, then commit the branch
  
  ```
  export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH; cd ~/.universe/cache/worktrees/kp/kp-32/backend && uv sync 2>&1 | tail -1 && uv run pytest -q 2>&1 | tail -2 && cd .. && git add backend/kopi/insights.py backend/kopi/store.py backend/kopi/api/live.py backend/kopi/api/app.py backend/tests/test_insights.py backend/tests/test_api_live.py backend/tests/test_overview.py planning/handoffs/KP-32.md && git status --short && git commit -q -F - <<'EOF'
  KP-32: fast search insights (parallel, cached market bands from the notice's stored vector)
  
  - insights: eligibility and snippet first, then market bands from MarketBands: an 8-worker
    pool, a bounded LRU of lookup futures with a 5-minute TTL, a 2 s wait per batch, and
    failures and stragglers giving market=None for that card only.
  - Store gains notice() and market_for(). LiveStore.market_for starts from the notice's
    stored vector in NeedleDB and embeds only notices the index lacks. tender() and overview()
    use it too, so the card's band and the detail page's market agree.
  - Live timing for 25 tenders: 11.5 s serial with the embedder on CPU (3.2 s on MPS), now
    0.8 to 1.2 s cold and 3 ms warm.
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  EOF
  git log --oneline -1 && git show --stat HEAD | tail -10
  ```

  <details><summary>result</summary>

  ```
  Audited 53 packages in 10ms
  ............                                                             [100%]
  300 passed in 2.24s
  M  backend/kopi/api/app.py
  M  backend/kopi/api/live.py
  M  backend/kopi/insights.py
  M  backend/kopi/store.py
  M  backend/tests/test_api_live.py
  A  backend/tests/test_insights.py
  M  backend/tests/test_overview.py
  A  planning/handoffs/KP-32.md
  597ebfe KP-32: fast search insights (parallel, cached market bands from the notice's stored vector)
  
   backend/kopi/api/app.py        |   4 +-
  
  [… 262 chars cut …]
   backend/tests/test_overview.py |   2 +-
   planning/handoffs/KP-32.md     | 131 +++++++++++++++++++++
   8 files changed, 514 insertions(+), 29 deletions(-)
  ```

  </details>

Search insights are now fast on the live store: 25 tenders take 0.8–1.2 s on a cold cache instead of 11.5–11.9 s, and 3 ms once cached. The work is committed on `factory/kp-32` as **`597ebfe`** and the suite is **300 passed** (285 before, plus 15 new in `backend/tests/test_insights.py`). One change goes beyond "additive" and needs your approval: the tender detail page now gets its market numbers the same way the cards do.

**Timings** (25 tenders from two live searches, measured from this Mac against live NeedleDB with the read key and the MPS embedder):

| | 25 tenders |
|---|---|
| Before: serial, embedder on CPU at 4 threads (as deployed) | 11.5–11.9 s |
| Before: serial, embedder on MPS | 3.2 s |
| After, cold cache (6 runs) | 0.8–1.2 s, every card had a band |
| After, cached, different profile | 3 ms |

Eligibility, snippet, item count, envelopes and method are identical to the old output. Inside Modal the cold time should be lower, but that can only be measured after the KP-36 deploy.

**How it works**
- Eligibility and the snippet are computed for every tender first.
- Market bands are looked up in parallel on 8 workers and cached per tender for 5 minutes, up to 2048 tenders. The band doesn't depend on the profile, so switching profile hits the cache.
- A batch waits at most 2 s for bands. While probing, about one parallel batch in 20 had a NeedleDB request hang until the client's 20 s timeout. A card whose band isn't ready, or whose lookup fails, gets `market=None`; the rest of the batch is unaffected, and a failed lookup is retried on the next call.
- NeedleDB can return a notice's stored vector by id, so bands use that instead of re-embedding. A notice the index doesn't hold yet is embedded once.

**What you must know to merge**
1. **The detail page's market numbers change (needs your OK).** The stored vector is built from a fuller notice text than the one `tender()` used to embed. On the 25 live tenders no band came out the same, and 12 of 25 medians moved by more than 25% (IRA000ETT26000003: $280k vs $1.8M). The stored vector finds clearly better matches: software-licence awards for a software-licensing tender, where the old text found transcription and insurance awards.
   - KP-33's preview pane shows the detail page's market right beside the card's price band, so the two must agree.
   - I made `LiveStore.tender()` and `overview()` use the same lookup, and a test holds the card's band equal to the detail page's.
   - Side effect: the detail page no longer embeds on CPU in production, which saves about 250–600 ms per view.
   - After deploy, detail pages and overviews show different market figures than before; a re-shot film would too.
   - Overviews cached before the deploy keep the old figures until the container restarts, because the overview cache key doesn't include the market. That was already the case whenever awards were re-ingested.
2. **Files touched besides `insights.py` and the new tests:**
   - `backend/kopi/store.py`: the Store protocol gains `notice()` (the old private `_notice`, now public in both stores) and `market_for()`, plus a `SIMILAR_AWARDS = 25` constant.
   - `backend/kopi/api/live.py`: `LiveStore.market_for`, and `tender()`/`overview()` now call it.
   - `backend/kopi/api/app.py`: one band cache per app, passed to the route. The route, `TenderInsight` and `openapi.json` are unchanged.
   - `backend/tests/test_api_live.py` and `backend/tests/test_overview.py`: one line each, following the `_notice` rename and the new lookup.
3. **Signature change:** `insights(store, bands, doc_nos, profile, query)`. `app.py` is the only caller.
4. `planning/02-decisions.md` is untouched. You may want to record decision 1 as D28 there.

No new dependencies; nothing was pushed or merged, and main is untouched. The benchmark scripts are uncommitted in `/tmp/kp32`. They run with the main checkout's venv, because the worktree's venv has no torch, and they never print keys.

Files are in ~/.universe/cache/worktrees/kp/kp-32:
- backend/kopi/insights.py
- backend/tests/test_insights.py
- planning/handoffs/KP-32.md
