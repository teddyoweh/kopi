# KP-19 — Deploy Kopi to Modal, first cloud ingest

**Where it runs:** Modal workspace **kryptonairc-lc**. Teddy chose it on 29 Sep because
`teddyoweh` is paused on billing. Every Kopi resource there is prefixed `kopi`:
- app `kopi`;
- Volume `kopi-data`;
- secrets `kopi-needledb`, `kopi-needledb-write`, `kopi-needledb-read` and `kopi-app`.

Nothing else in the workspace was read or changed. It held 2 apps, 2 secrets and 3
volumes, none named kopi.

**Live endpoints**

| Service | URL | Access |
|---|---|---|
| NeedleDB | https://kryptonairc-lc--kopi-needledb.modal.run | API key required |
| Kopi API | https://kryptonairc-lc--kopi-api.modal.run | Access code required |

- NeedleDB: `/health` returns 200. `/indexes` with no key or a bad key returns 401.
- Kopi API: serves fixtures until KP-8's live store lands.

**Proof, 29 Sep 2026**

| Check | Result |
|---|---|
| Deploy | 41 s (images built with needledb pinned at b88f8b7) |
| NeedleDB load at start (from Volume `.npz`) | 727 notices, 12,052 awards, 324 licences |
| Remote filtered search, from this Mac over the internet | 240–340 ms, mostly network |

A search for "data analytics platform and dashboards" returned an embedded-dashboard
tender first.

First cloud ingest, through the deployed `refresh_sources` function:

| Measure | Result |
|---|---|
| Open opportunities on GeBIZ | 732 (up from 727) |
| Embedded on the L4 | 5 (new notices) |
| Vectors reused | 12,703 |
| Rows pushed to NeedleDB | 8 (5 new, 3 amended) |
| Scraping | 183 s |
| Whole run, wall time | 293 s |

Live NeedleDB then reported 732 notices. The 3-hour cron (`15 */3 * * *`) is
deployed.

**Keys:** fresh keys were minted for this workspace; the teddyoweh keys aren't reused.
The plaintext copies needed for local testing are in `data/secrets/`, which is
gitignored and mode 600.

**Where the agent went wrong**
- **The workspace URL was baked into code.** `modal_app.py` had the NeedleDB URL
  hard-coded for `teddyoweh`, so moving workspaces would have pointed ingest at a URL
  that doesn't exist. The URL now comes from the `NEEDLEDB_URL` field in the read and
  write secrets, which were set once the deploy printed the real address.
- **The board's block couldn't be answered.** Teddy answered the blocked-task question
  in a post thread, not with the block's buttons, so the board stayed blocked. I
  recorded his answer on the task (a comment quoting him), cleared the blocker the way
  the app's own answer path does, and posted in the thread.
