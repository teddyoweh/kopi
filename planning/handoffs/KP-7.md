# KP-7 — NeedleDB and ingest on Modal

**Built**
- **`kopi/index.py`**
  - The three indexes (notices, awards, licences; 1024-d cosine).
  - Flat, filterable metadata per record type, including `closing_ts` and `category_group`
    for range and group filters.
  - `VectorSet`, a record set saved atomically to `.npz`.
  - `changed()`, which finds the rows that need pushing.
  - `notice_filter()` and `query()`.
- **`kopi/ingest.py`**
  - `refresh()` embeds only the texts whose hash changed and saves the set.
  - It keeps notices that left the Open tab as `status=closed` rather than deleting them.
  - It pushes only changed rows to NeedleDB.
  - `load_into()` bulk-loads every set when a server starts.
- **`modal_app.py`**
  - `NeedleService`: one container, the only writer, rebuilt from `/vectors/*.npz` on
    local disk at start.
  - `refresh_sources`: CPU, runs on a 3-hour cron. It scrapes GeBIZ; awards and
    licences refresh daily.
  - `embed_and_push`: on an L4 GPU.
  - `api`: the FastAPI hook, which uses the live store because the image sets
    `KOPI_STORE=live`.
- **Tests:** 12 tests against NeedleDB's embedded engine.

**Proven locally, 29 Sep 2026**
- **Embedding:** first full run on MPS took 238 s.

  | Index | Records |
  |---|---:|
  | Open notices | 727 |
  | Awarded tenders | 12,052 |
  | GoBusiness licences | 324 |

- **Serving:** loading all 13,103 vectors into NeedleDB takes 0.6 s. A warm query
  embed takes 22 ms and a filtered search under 1 ms.
- **Keys against a real `needledb serve`:** the write key upserts, the read key queries
  (1.4 ms), and the read key is refused with PermissionDenied for both writes and
  minting keys.
- **Real searches**, sensible results. Example: "security guard services" in the
  licence index returns the SPF Security Service Provider Licence first.
- **Staged on Volume `kopi-data`:**
  - `/vectors`: all three sets;
  - `/data`: notices, licences and the awards cache;
  - `/needledb/auth.sqlite`: the key store, hashed.

**Not done here: deployment.** `modal deploy` returns "Workspace … is paused" (billing),
so the deploy is its own task (KP-19). Everything it needs is staged.

**Decisions**
- **Vectors live on the Volume; NeedleDB serves from local disk.** NeedleDB stores
  data in SQLite, and SQLite on a network filesystem risks locking and consistency
  problems. The `.npz` sets are the durable copy, and a restart costs 0.6 s of loading,
  never a GPU re-embed.
- **Least privilege by key.** The admin key exists only in the NeedleDB container's
  secret. Ingest holds a write key scoped to Kopi's three indexes, and the API holds a
  read key. The keys were minted with NeedleDB's own KeyStore in a temporary directory
  and went straight into Modal secrets, never printed. Only the hashed store was
  uploaded.
- **Scraping is split from embedding.** Scraping runs on CPU and embedding on GPU, so
  a 12-minute GeBIZ pass never bills L4 time.
- **Test dependencies.** `needledb` moved from the `search` extra into its own `index`
  extra and the dev group, so tests use the real engine without torch. `numpy` is now a
  base dependency because `kopi.index` needs it.

**Next agents (KP-8)**
- Read with `NeedleDB(os.environ["NEEDLEDB_URL"], api_key=os.environ["NEEDLEDB_API_KEY"])`
  (secret `kopi-needledb-read`), and pass `kopi.index.query` a vector from
  `Embedder().embed_query(q)`.
- Filter exact fields with `notice_filter(...)`. Agency matches exactly; if the UI needs
  "contains", build the agency list from the metadata.
- Semantic-only search puts school *renovation* tenders at ranks 3–4 for "office cleaning
  for schools". The planned BM25 boost on titles should fix that; measure it on
  `evals/`.

**Where the agent went wrong**
- I didn't check that the Modal workspace was active before building the deploy.
  Listing apps and creating secrets both work on a paused workspace, and only `deploy`
  and `run` refuse, so the pause showed up at the last step. The work was rearranged
  so nothing waits on it: local ingest, staged Volume, a separate deploy task.
- I nearly re-scraped because I thought the local scrape had stalled for 25 minutes.
  The clock showed the last write was 9 seconds earlier. I checked the timestamps
  before touching anything.
