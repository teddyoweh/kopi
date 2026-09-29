# KP-23 — Refresh the redacted logs after the film, and push main

**Done**
- **Re-exported all 12 sessions.** The main log now runs to 29 Sep 14:10 UTC and covers
  KP-17 (script and footage), KP-18 (voice, cut, render), KP-21 (quote sources) and this task.
- **Closed the KP-16 privacy window at 13:00:30 UTC**, when that review's commit landed. Left
  open-ended, it would have hidden every later shell call: the whole filming and cutting
  work.
- **Two more things the exporter now leaves out:**
  - `browser_profiles` results, which list the accounts the browser is signed into;
  - the network log that `browser_act` and `browser_open` return beside their result
    (analytics client ids, Firestore session ids). Only `result`, `url`, `title`,
    `downloaded` and `closed` are kept.

  There's a test for each; the exporter's suite is 43 tests.
- **Raw transcripts now live in `data/log-raw/`** (gitignored, mode 700), and the manifest
  points there. The originals sat in temporary `claude-resume-*` folders, and one of those
  (holding the four subagent transcripts) had already been cleaned up. The surviving copies
  were found in other resume folders at the same byte sizes.
- **Read, not just gated.** The section after 13:00 UTC was searched for account lists,
  tracking ids, tokens and personal strings. The only hits were my own search patterns and
  the exporter's synthetic test data.

**For the next agent**
- Re-export at the very end:
  1. copy the newest main transcript over `data/log-raw/01-main.jsonl`;
  2. run `python3 scripts/export_logs.py --manifest ~/Documents/codes/kopi/data/log-sources.json --secrets-dir ~/Documents/codes/kopi/data/secrets --out logs`.
- The newest main transcript is the largest
  `…/claude-resume-*/projects/-Users-teddy--universe-sessions-529c67bc-…/7142f416-….jsonl`.

**Where the agent went wrong**
- **The manifest pointed at temporary folders.** A resume folder the export depended on
  vanished between runs, and the export failed on a missing file. Copying the sources into
  `data/` should have been part of KP-16.
