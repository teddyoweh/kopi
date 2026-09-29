"""Hybrid search: dense retrieval from NeedleDB, lightly re-ranked by BM25 over titles.

Measured on evals/ (30 queries, 12,052 tenders): Qwen3 alone scores nDCG@10 0.695, and
adding BM25 at weight 0.05 over the top 50 dense candidates gives 0.715 with P@10
unchanged. Heavier weights did no better. The boost is small on purpose: it breaks ties
toward exact words (agency names, "CCTV", "HR") without letting keyword matches
override meaning. A query that is itself a GeBIZ document number skips ranking.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from kopi.index import Match
from kopi.models import AwardTender

DENSE_DEPTH = 50
KEYWORD_WEIGHT = 0.05
DOC_NO = re.compile(r"^[A-Z0-9]{12,20}$")
STOPWORDS = frozenset("a an and at for from in of on or the to with by".split())


def tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOPWORDS]


def as_doc_no(query: str) -> str | None:
    candidate = query.strip().upper()
    return candidate if DOC_NO.match(candidate) else None


class BM25:
    """Okapi BM25 over a fixed set of documents, keyed by id."""

    def __init__(self, docs: dict[str, str], k1: float = 1.5, b: float = 0.75) -> None:
        self.terms = {doc_id: Counter(tokens(text)) for doc_id, text in docs.items()}
        lengths = [sum(c.values()) for c in self.terms.values()] or [1]
        self.avg = sum(lengths) / len(lengths)
        df = Counter(term for counts in self.terms.values() for term in counts)
        n = len(self.terms)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.k1, self.b = k1, b

    def score(self, query: str, doc_id: str) -> float:
        counts = self.terms.get(doc_id)
        if not counts:
            return 0.0
        length = sum(counts.values())
        total = 0.0
        for term in set(tokens(query)):
            tf = counts.get(term, 0)
            if tf and term in self.idf:
                total += self.idf[term] * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * length / self.avg))
        return total


@dataclass(frozen=True)
class Ranked:
    match: Match
    score: float
    highlights: list[str]


def rerank(query: str, matches: Sequence[Match], bm25: BM25, text_of: Callable[[Match], str], weight: float = KEYWORD_WEIGHT) -> list[Ranked]:
    """Dense score plus `weight` × BM25 normalised to the best candidate; highest first."""
    keyword = [bm25.score(query, m.id) for m in matches]
    top = max(keyword, default=0.0)
    wanted = set(tokens(query))
    ranked = []
    for match, kw in zip(matches, keyword, strict=True):
        combined = match.score + (weight * kw / top if top > 0 else 0.0)
        words = [w for w in tokens(text_of(match)) if w in wanted]
        ranked.append(Ranked(match, combined, list(dict.fromkeys(words))))
    ranked.sort(key=lambda r: -r.score)
    return ranked


def award_from(match: Match) -> AwardTender:
    meta = match.metadata
    return AwardTender(
        tender_no=meta.get("tender_no", match.id),
        description=meta.get("description", ""),
        agency=meta.get("agency", ""),
        award_date=meta.get("award_date"),
        status=meta.get("status", ""),
        suppliers=list(meta.get("suppliers") or []),
        total_amount=meta.get("amount"),
    )


def distinct_awards(matches: Sequence[Match]) -> list[AwardTender]:
    """Awards closest first, with repeated descriptions collapsed to their first (closest) award.

    The dataset re-awards period contracts under new tender numbers with identical
    descriptions, and those copies would otherwise fill the whole "similar" list.
    """
    seen: set[str] = set()
    tenders = []
    for match in matches:
        tender = award_from(match)
        key = " ".join(tender.description.lower().split())
        if key in seen:
            continue
        seen.add(key)
        tenders.append(tender)
    return tenders
