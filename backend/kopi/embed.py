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
    from sentence_transformers import SentenceTransformer

MODEL = "Qwen/Qwen3-Embedding-0.6B"
DIMENSION = 1024
# The model's own default instruction. A domain-specific one ("retrieve relevant Singapore
# government procurement opportunities") scored nDCG@10 0.450 against this one's 0.66 on
# evals/: Qwen3 was trained on generic task phrasings, and the specific one hurt.
SEARCH_TASK = "Given a web search query, retrieve relevant passages that answer the query"
DOMAIN_TASK = "Given a supplier's search, retrieve relevant Singapore government procurement opportunities"
BATCH = {"cuda": 128, "mps": 32, "cpu": 16}
MAX_TOKENS = 512


def _collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _join(*parts: str | None) -> str:
    return "\n".join(_collapse(p) for p in parts if p and _collapse(p))


def notice_text(notice: Notice) -> str:
    return _join(notice.title, notice.title, notice.agency, notice.category, notice.description, "; ".join(notice.items))


def award_text(tender: AwardTender) -> str:
    return _join(tender.description, tender.description, tender.agency)


def licence_text(licence: Licence) -> str:
    return _join(licence.name, licence.name, licence.agency, licence.description, licence.who_needs_it)


def query_prompt(text: str, task: str = SEARCH_TASK) -> str:
    return f"Instruct: {task}\nQuery:{_collapse(text)}"


def pick_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class Embedder:
    """Loads the model once; every vector it returns is float32 and L2-normalised."""

    def __init__(self, model: str = MODEL, device: str | None = None, batch_size: int | None = None) -> None:
        from sentence_transformers import SentenceTransformer

        self.device = device or pick_device()
        self.batch_size = batch_size or BATCH.get(self.device, 16)
        self.model: SentenceTransformer = SentenceTransformer(model, device=self.device)
        self.model.max_seq_length = MAX_TOKENS
        dimension = self.model.get_sentence_embedding_dimension()
        if model == MODEL and dimension != DIMENSION:
            raise ValueError(f"{model} returned {dimension}-d vectors, expected {DIMENSION}")

    def _encode(self, texts: list[str]) -> np.ndarray:
        vectors = self.model.encode(texts, batch_size=self.batch_size, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
        return np.asarray(vectors, dtype=np.float32)

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.model.get_sentence_embedding_dimension()), dtype=np.float32)
        return self._encode(texts)

    def embed_query(self, text: str, task: str = SEARCH_TASK) -> np.ndarray:
        return self._encode([query_prompt(text, task)])[0]
