# KP-6 — Qwen3 embeddings and retrieval eval

**Built:**
- `backend/kopi/embed.py`, matching the interface KP-7 and KP-8 call:
  - `Embedder.embed_documents` / `embed_query`: float32, L2-normalised, 1024-d;
  - `SEARCH_TASK` and `query_prompt`, with the query instruction in Qwen3's
    `Instruct: …\nQuery:` format;
  - the text builders `notice_text`, `award_text`, `licence_text`.

  `sentence_transformers` is imported inside `Embedder`, so `import kopi.embed` needs
  no torch. 8 tests run with a fake model.
- `evals/`:
  - `queries.json`, 30 supplier queries;
  - `run_eval.py`, with pool, label and score modes;
  - `rankings.json` / `pool.jsonl`, tender numbers only;
  - `labels.jsonl`, the judgements;
  - `RESULTS.md`.

**Numbers** (`evals/RESULTS.md`, 30 queries, 12,052 tenders, 1,546 pooled judgements):

| Method | nDCG@10 | P@10 |
|---|---:|---:|
| Qwen3-Embedding-0.6B (default instruction) | **0.695** | **0.713** |
| BGE-small-en-v1.5 | 0.609 | 0.610 |
| BM25 | 0.594 | 0.607 |
| Qwen3-Embedding-0.6B (my domain instruction) | 0.444 | 0.537 |

**Speed on this Mac (MPS):** Qwen3-0.6B plus BGE-small embedded the whole 12,052-tender
corpus in about 4 minutes, both models together, including the first model download.

**Decisions**
- **Asymmetric embedding.** Queries carry the task instruction and documents carry
  none, which is how Qwen3 was trained. Every embedding text goes through `embed.py`, so
  the two sides can't drift apart.
- **Title written twice** in notice, award and licence text. Titles are the densest
  signal, and descriptions on GeBIZ are often boilerplate.
- **Max 512 tokens.** Notices are short, and 32K context costs memory for nothing here.
- **Labels by pooling plus an LLM judge.** The top 20 from each method are pooled
  (1,384 query-tender pairs). Claude Sonnet judges them 0/1/2 through `claude -p` with no
  tools and a JSON schema, against the rubric in `run_eval.py`. Anything outside the
  pool scores 0, so the metric can understate a method but never flatter it.
  `labelled_by` in every row says the labels are agent-drafted. **Teddy should
  spot-check about 30 labels before the numbers go in the README** and record it in
  RESULTS.md.

**Next agents**
- **Duplicate descriptions.** The same description is often awarded under several
  tender numbers (period contracts re-awarded yearly; catering for Outward Bound shows
  up three times). They crowd the top of the awards results. For market context that's
  fine, since they are separate awards. For the UI's "similar tenders" list, collapse
  identical descriptions.
- **BGE query prefix.** BGE-small needs its own "Represent this sentence…" query prefix;
  the eval uses it, so the comparison is fair to BGE.

**Where the agent went wrong**
- **The big one.** I wrote a domain-specific query instruction for Qwen3 ("Given a
  supplier's search, retrieve relevant Singapore government procurement
  opportunities"). It sounded obviously better than the generic one, and it made Qwen3
  the *worst* method: nDCG@10 0.450, below BM25. The eval caught it. Before blaming the
  model I tested two hypotheses:
  1. Right-padding corrupting last-token pooling. Rejected: the cosine between a text
     embedded alone and the same text in a batch was 1.0.
  2. ALL-CAPS descriptions against a cased model. Rejected: +0.03 at most.

  Then I swapped the instruction for the model's own default, and Qwen3 went to 0.695.
  The domain instruction stays in the eval as a variant, so the evidence is on record.
  **Lesson:** "domain-tuned" prompt text for an embedding model is a hypothesis to test,
  not an improvement to assume.
- The first `--pool` run went straight on to scoring before any labels existed and
  crashed with FileNotFoundError. Harmless, because the pool had been written, but
  sloppy. Scoring now says to run `--label` first.
- I briefly thought the parallel GeBIZ scrape had hung for 25 minutes. The system clock
  showed its last write was 9 seconds earlier; I had misjudged elapsed time. I checked
  the file timestamps before acting, and nothing was restarted.
