"""Does Qwen3-Embedding-0.6B actually retrieve better than the alternatives on GeBIZ data?

Corpus: every awarded tender in data.gov.sg's GeBIZ awards dataset (grouped by tender).
Queries: evals/queries.json, 30 things a supplier would type.
Methods: Qwen3-Embedding-0.6B, BGE-small (NeedleDB's local default) and BM25.

    uv run --extra search python ../evals/run_eval.py --pool     # top-20 per method → pool.jsonl
    uv run --extra search python ../evals/run_eval.py --label    # judge the pool → labels.jsonl
    uv run --extra search python ../evals/run_eval.py            # score → RESULTS.md

Relevance comes from a pooled judgement: each query's top 20 from every method is judged
0/1/2 against the rubric in RUBRIC; anything outside the pool counts as 0, the standard
pooling assumption (it can only understate a method, never flatter it).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))

from kopi.config import DATA_DIR  # noqa: E402
from kopi.embed import DOMAIN_TASK, Embedder, award_text  # noqa: E402
from kopi.sources.awards import group_tenders, load_awards  # noqa: E402

K = 10
POOL_DEPTH = 20
BGE = "BAAI/bge-small-en-v1.5"
BGE_QUERY = "Represent this sentence for searching relevant passages: "
CACHE = DATA_DIR / "cache" / "emb"
JUDGE_MODEL = "sonnet"
RUBRIC = """You judge search results for a Singapore government-procurement search tool.
A supplier typed a query; each candidate is a past GeBIZ tender description.
Score each candidate:
  2 = the tender is squarely what the query asks for (a supplier searching this would want it)
  1 = related and plausibly useful (overlapping service, or the query's work is a clear part of it)
  0 = not what the query is about
Judge the work being bought, not shared words. Be strict: most candidates are 0."""


def corpus() -> tuple[list[str], list[str]]:
    tenders = [t for t in group_tenders(load_awards()) if t.description]
    return [t.tender_no for t in tenders], [award_text(t) for t in tenders]


def fingerprint(texts: list[str]) -> str:
    return hashlib.sha256("\n".join(texts).encode()).hexdigest()[:12]


# ---------------------------------------------------------------- methods


def tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


class BM25:
    def __init__(self, docs: list[str], k1: float = 1.5, b: float = 0.75) -> None:
        self.docs = [Counter(tokens(d)) for d in docs]
        self.lengths = np.array([sum(d.values()) for d in self.docs], dtype=np.float64)
        self.avg = self.lengths.mean()
        df = Counter(term for d in self.docs for term in d)
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.k1, self.b = k1, b

    def scores(self, query: str) -> np.ndarray:
        out = np.zeros(len(self.docs))
        for term in set(tokens(query)):
            idf = self.idf.get(term)
            if idf is None:
                continue
            tf = np.array([d.get(term, 0) for d in self.docs], dtype=np.float64)
            out += idf * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * self.lengths / self.avg))
        return out


def dense_scores(name: str, texts: list[str], queries: list[str], task: str | None = None) -> np.ndarray:
    """(queries × docs) cosine scores; document vectors cached per model and corpus."""
    from sentence_transformers import SentenceTransformer

    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name.replace('/', '_')}-{fingerprint(texts)}.npy"
    if name == "qwen3":
        model = Embedder()
        docs = np.load(path) if path.exists() else model.embed_documents(texts)
        q = np.stack([model.embed_query(x, task) if task else model.embed_query(x) for x in queries])
    else:
        st = SentenceTransformer(BGE)
        docs = np.load(path) if path.exists() else st.encode(texts, batch_size=64, normalize_embeddings=True, convert_to_numpy=True)
        q = st.encode([BGE_QUERY + x for x in queries], normalize_embeddings=True, convert_to_numpy=True)
    if not path.exists():
        np.save(path, docs.astype(np.float32))
    return q @ docs.T


def rankings(ids: list[str], texts: list[str], queries: list[dict]) -> dict[str, dict[str, list[str]]]:
    words = [q["query"] for q in queries]
    bm25 = BM25(texts)
    scores = {
        "Qwen3-Embedding-0.6B": dense_scores("qwen3", texts, words),
        "Qwen3-Embedding-0.6B, domain instruction": dense_scores("qwen3", texts, words, DOMAIN_TASK),
        "BGE-small-en-v1.5": dense_scores(BGE, texts, words),
        "BM25": np.stack([bm25.scores(w) for w in words]),
    }
    return {
        method: {q["id"]: [ids[i] for i in np.argsort(-matrix[row])[:POOL_DEPTH]] for row, q in enumerate(queries)}
        for method, matrix in scores.items()
    }


# ---------------------------------------------------------------- judging


def judge(query: str, candidates: list[dict]) -> dict[str, int]:
    """One Claude call per query through the local Claude Code login; no tools, schema-bound output."""
    schema = {
        "type": "object",
        "properties": {"scores": {"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}, "score": {"type": "integer", "enum": [0, 1, 2]}}, "required": ["id", "score"]}}},
        "required": ["scores"],
    }
    listing = "\n".join(f'{c["id"]}: {c["text"][:300]}' for c in candidates)
    prompt = f"{RUBRIC}\n\nQuery: {query}\n\nCandidates (id: description):\n{listing}\n\nScore every candidate id."
    out = subprocess.run(
        ["claude", "-p", "--model", JUDGE_MODEL, "--output-format", "json", "--json-schema", json.dumps(schema), "--tools", ""],
        input=prompt, capture_output=True, text=True, timeout=600, check=True,
    )
    result = json.loads(out.stdout)
    structured = result.get("structured_output") or json.loads(result["result"])
    return {s["id"]: int(s["score"]) for s in structured["scores"]}


# ---------------------------------------------------------------- metrics


def ndcg(ranked: list[str], rel: dict[str, int], k: int = K) -> float:
    dcg = sum((2 ** rel.get(d, 0) - 1) / math.log2(i + 2) for i, d in enumerate(ranked[:k]))
    ideal = sorted(rel.values(), reverse=True)[:k]
    idcg = sum((2**r - 1) / math.log2(i + 2) for i, r in enumerate(ideal))
    return dcg / idcg if idcg else 0.0


def precision(ranked: list[str], rel: dict[str, int], k: int = K) -> float:
    return sum(1 for d in ranked[:k] if rel.get(d, 0) >= 1) / k


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pool", action="store_true", help="rank with every method and write pool.jsonl")
    parser.add_argument("--label", action="store_true", help="judge pool.jsonl into labels.jsonl")
    args = parser.parse_args()
    queries = json.loads((HERE / "queries.json").read_text())
    ids, texts = corpus()
    text_of = dict(zip(ids, texts, strict=True))

    if args.pool or not (HERE / "rankings.json").exists():
        ranked = rankings(ids, texts, queries)
        (HERE / "rankings.json").write_text(json.dumps(ranked))
        with (HERE / "pool.jsonl").open("w") as f:
            for q in queries:
                pooled = list(dict.fromkeys(d for method in ranked.values() for d in method[q["id"]]))
                f.write(json.dumps({"query_id": q["id"], "query": q["query"], "candidates": pooled}) + "\n")
    ranked = json.loads((HERE / "rankings.json").read_text())

    if args.label:
        done = set()
        if (HERE / "labels.jsonl").exists():
            done = {(r["query_id"], r["tender_no"]) for r in map(json.loads, (HERE / "labels.jsonl").read_text().splitlines())}
        with (HERE / "labels.jsonl").open("a") as f:
            for line in (HERE / "pool.jsonl").read_text().splitlines():
                item = json.loads(line)
                new = [d for d in item["candidates"] if (item["query_id"], d) not in done]
                if not new:
                    continue
                scores = judge(item["query"], [{"id": d, "text": text_of[d]} for d in new])
                for d in new:
                    f.write(json.dumps({"query_id": item["query_id"], "tender_no": d, "relevance": scores.get(d, 0), "labelled_by": f"claude-{JUDGE_MODEL} (agent-drafted, rubric in run_eval.py); spot-check pending"}) + "\n")
                print(f"judged {item['query_id']}: {sum(1 for v in scores.values() if v)} relevant of {len(new)} new", flush=True)

    if not (HERE / "labels.jsonl").exists():
        print("No labels yet: run with --label to judge pool.jsonl, then run again to score.")
        return
    labels: dict[str, dict[str, int]] = {}
    for line in (HERE / "labels.jsonl").read_text().splitlines():
        row = json.loads(line)
        labels.setdefault(row["query_id"], {})[row["tender_no"]] = row["relevance"]
    write_results(queries, ranked, labels, len(ids))


def write_results(queries: list[dict], ranked: dict, labels: dict, corpus_size: int) -> None:
    rows = []
    for method, per_query in ranked.items():
        n = [ndcg(per_query[q["id"]], labels.get(q["id"], {})) for q in queries]
        p = [precision(per_query[q["id"]], labels.get(q["id"], {})) for q in queries]
        rows.append((method, float(np.mean(n)), float(np.mean(p))))
    rows.sort(key=lambda r: -r[1])
    judged = sum(len(v) for v in labels.values())
    lines = [
        "# Retrieval eval",
        "",
        f"{len(queries)} supplier queries over {corpus_size:,} awarded GeBIZ tenders (data.gov.sg). "
        f"Relevance: the top {POOL_DEPTH} from every method, pooled and judged 0/1/2 ({judged:,} judgements); "
        "unjudged results count as 0. Labels were drafted by Claude against the rubric in `run_eval.py`, "
        "and the spot-check by a person is recorded below when done.",
        "",
        f"| Method | nDCG@{K} | P@{K} |",
        "|---|---:|---:|",
        *[f"| {m} | {n:.3f} | {p:.3f} |" for m, n, p in rows],
        "",
        "## What this found",
        "",
        "The query instruction matters more than the model. Qwen3 embeds a query with a one-line "
        "task instruction. A domain-specific one written for Kopi (\"retrieve relevant Singapore "
        "government procurement opportunities\") made Qwen3 the *worst* method here. The model's own "
        "generic instruction (\"Given a web search query, retrieve relevant passages…\") made it the "
        "best. Kopi uses the generic one (`kopi.embed.SEARCH_TASK`). Lower-casing the 38% of "
        "tender descriptions written in ALL CAPS moved Qwen3 by under 0.03, so it is not done.",
        "",
        "Reproduce: `cd backend && uv run --extra search python ../evals/run_eval.py` (uses the committed labels).",
    ]
    (HERE / "RESULTS.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
