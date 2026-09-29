# Retrieval eval

30 supplier queries over 12,052 awarded GeBIZ tenders (data.gov.sg). Relevance: the top 20 from every method, pooled and judged 0/1/2 (1,546 judgements); unjudged results count as 0. Labels were drafted by Claude against the rubric in `run_eval.py`, and the spot-check by a person is recorded below when done.

| Method | nDCG@10 | P@10 |
|---|---:|---:|
| Qwen3-Embedding-0.6B | 0.695 | 0.713 |
| BGE-small-en-v1.5 | 0.609 | 0.610 |
| BM25 | 0.594 | 0.607 |
| Qwen3-Embedding-0.6B, domain instruction | 0.444 | 0.537 |

## What this found

The query instruction matters more than the model. Qwen3 embeds a query with a one-line task instruction. A domain-specific one written for Kopi ("retrieve relevant Singapore government procurement opportunities") made Qwen3 the *worst* method here. The model's own generic instruction ("Given a web search query, retrieve relevant passages…") made it the best. Kopi uses the generic one (`kopi.embed.SEARCH_TASK`). Lower-casing the 38% of tender descriptions written in ALL CAPS moved Qwen3 by under 0.03, so it is not done.

Reproduce: `cd backend && uv run --extra search python ../evals/run_eval.py` (uses the committed labels).
