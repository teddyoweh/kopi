# KP-8 — Live API: search, tenders, eligibility, licences, auth

**Built**
- **`kopi/search.py`**
  - Hybrid ranking: dense results from NeedleDB, lightly re-ranked by BM25 over titles.
  - A fast path for tender numbers.
  - `distinct_awards()`, which collapses repeated award descriptions.
- **`kopi/api/live.py`, `LiveStore`**, behind the existing `Store` protocol, so no route
  changed:
  - NeedleDB serves search (read key).
  - The Modal Volume holds the full notices (one bundle) and the GoBusiness catalogue.
  - `kopi.eligibility` does the rules; `kopi.market` summarises similar awards.
- **`kopi/api/limits.py`**: per-token limits.

  | Kind | Limit |
  |---|---|
  | read | 240 per minute |
  | overview | 40 per hour |
  | chat | 30 per hour |

  A breach gets a 429.
- **`kopi/bundle.py`**: every known notice in one file, written by ingest and read by the API.
- **`create_app()`** picks the live store when `KOPI_STORE=live`. A store with no copilot
  answers `/chat` with a clean 503 before any stream opens.
- **Tests:** 20 new, 154 in total, against NeedleDB's embedded engine with a
  bag-of-words fake embedder.

**Live, 29 Sep 2026** (https://kryptonairc-lc--kopi-api.modal.run, from a US laptop)
- **Auth:** no token, 401. Wrong code, 401. Right code, a 12-hour token.
- **Search:** new query about 0.9–1.1 s end to end (server: query embed about 0.6 s on 4
  vCPU, NeedleDB about 0.25 s). A repeated query is 0.38 s (LRU cache). Examples:
  - "CCTV installation": a CCTV install tender first, at 0.729.
  - "selling food at an event" (licences): Temporary Fair Permit, then Food Stall Licence.
- **Tender detail:** eligibility plus market context in 2.3 s. The 25 similar awards had a
  median of S$410k, with top suppliers shown.
- **Other routes:**
  - tender list 0.31 s;
  - licences 0.33 s;
  - unknown tender 404;
  - chat 503 (copilot not built yet).
- **Freshness:** a cloud ingest took the open count from 727 to 733, and the API served
  733 after its 5-minute refresh, with no redeploy.

**Decisions** (also in 02-decisions)
- **BM25 weight 0.05 over the top 50 dense results.** Measured on evals/: nDCG@10 0.695
  → 0.715 with P@10 unchanged; heavier weights did no better.
- **A search result must pass the filters twice.** NeedleDB's status is only as fresh as
  the last ingest. Results are filtered again against the notice on the Volume, and a
  notice past its closing time is closed even before the next ingest.
- **The model is baked into the API image, and every cache is on local disk.** See
  below for why.
- **One bundle file for notices.** Also below.
- **`create_app` is a factory; there's no app object built at import.** Local dev is
  `uvicorn --factory kopi.api.app:create_app`.

**Next agents**
- **Copilot (KP-12):** replace `LiveStore.chat`, `session_files` and `session_file`.
  Raise `CopilotUnavailable` for a clean 503.
- **Overview (KP-10):** replace `LiveStore.overview`, which is extractive for now and
  says so (`model="extractive"`).
- **Web:** agency and category filters match exactly on live data. A category without
  "⇒" filters by group.

**Where the agent went wrong**
- **Blamed the wrong container.** The first live tests returned 500s, and I nearly
  debugged the new code. The traceback pointed at `store.py`, the old fixture store: the
  previous deploy's container was still answering. I read the stack before changing
  anything.
- **Volume reload always failed, and my fallback hid it.** The API's `HF_HOME` sat on the
  Volume, and memory-mapped model weights are open files that block `volume.reload()`.
  The graceful fallback turned this into a warning, so the API would have served
  day-one notices forever. Fixed by baking the model into the image and moving every
  cache to local disk. Proven by the 727 → 733 refresh.
- **Per-file reads on a network filesystem.** The first tender list took 37.5 s:
  732 files read one at a time over the Volume. It's one bundle file now, and 0.31 s.
- **The first latency fix went the wrong way.** I gave the API 4 CPUs and an LRU cache,
  then tried int8 quantisation, which needs an engine the Mac lacks and a deprecated
  PyTorch API. Two attempts on the same bottleneck was my limit. New queries stay around
  1 s, and ONNX or a bigger CPU is the next step if it matters.
- **Timing logs didn't print.** Modal pre-configures the root logger, so
  `logging.basicConfig` did nothing. Fixed by setting the `kopi.api.live` logger's level
  directly.
