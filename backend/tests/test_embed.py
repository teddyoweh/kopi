import sys
import types
from datetime import date, datetime

import numpy as np
import pytest

from kopi import embed
from kopi.embed import DIMENSION, SEARCH_TASK, Embedder, award_text, licence_text, notice_text, query_prompt
from kopi.models import AwardTender, Licence, Notice


class FakeModel:
    """Stands in for SentenceTransformer: records what it was asked to encode."""

    last: "FakeModel"

    def __init__(self, name: str, device: str) -> None:
        self.name, self.device, self.seen, self.max_seq_length = name, device, [], None
        FakeModel.last = self

    def get_sentence_embedding_dimension(self) -> int:
        return DIMENSION

    def encode(self, texts, batch_size, normalize_embeddings, convert_to_numpy, show_progress_bar):
        assert normalize_embeddings and convert_to_numpy
        self.seen.extend(texts)
        rows = np.ones((len(texts), DIMENSION), dtype=np.float64)
        return rows / np.linalg.norm(rows, axis=1, keepdims=True)


@pytest.fixture
def fake_st(monkeypatch):
    module = types.ModuleType("sentence_transformers")
    module.SentenceTransformer = FakeModel
    monkeypatch.setitem(sys.modules, "sentence_transformers", module)
    return module


NOTICE = Notice(
    doc_no="X1", type="Tender", title="Chatbot  for Citizen\nEnquiries", description="Build a chatbot.", agency="GovTech",
    published=datetime(2026, 9, 1), closing=datetime(2026, 10, 1), category="IT ⇒ Software", items=["Build", "Run"], url="https://x",
)


def test_notice_text_repeats_title_and_collapses_whitespace():
    text = notice_text(NOTICE)
    assert text.split("\n")[:2] == ["Chatbot for Citizen Enquiries"] * 2
    assert "GovTech" in text and "Build; Run" in text and "  " not in text


def test_award_and_licence_text():
    tender = AwardTender(tender_no="T", description="Office cleaning", agency="MOE", award_date=date(2025, 1, 1), status="Awarded", suppliers=["A"], total_amount=1.0)
    assert award_text(tender) == "Office cleaning\nOffice cleaning\nMOE"
    licence = Licence(id="l", name="Cleaning Business Licence", agency="NEA", description="For cleaning firms.", url="https://x")
    assert licence_text(licence).startswith("Cleaning Business Licence\nCleaning Business Licence\nNEA")


def test_builders_are_deterministic():
    assert notice_text(NOTICE) == notice_text(NOTICE.model_copy())


def test_query_prompt_uses_qwen_instruction_format():
    assert query_prompt("  CCTV   install ") == f"Instruct: {SEARCH_TASK}\nQuery:CCTV install"


def test_documents_carry_no_instruction_but_queries_do(fake_st):
    embedder = Embedder(device="cpu")
    docs = embedder.embed_documents(["office cleaning"])
    query = embedder.embed_query("office cleaning")
    assert docs.shape == (1, DIMENSION) and docs.dtype == np.float32
    assert query.shape == (DIMENSION,) and np.isclose(np.linalg.norm(query), 1.0)
    assert FakeModel.last.seen == ["office cleaning", f"Instruct: {SEARCH_TASK}\nQuery:office cleaning"]
    assert FakeModel.last.max_seq_length == embed.MAX_TOKENS


def test_empty_batch_and_device_batch_sizes(fake_st):
    assert Embedder(device="cpu").embed_documents([]).shape == (0, DIMENSION)
    assert Embedder(device="cuda").batch_size == 128 and Embedder(device="mps").batch_size == 32


def test_wrong_dimension_is_refused(fake_st, monkeypatch):
    monkeypatch.setattr(FakeModel, "get_sentence_embedding_dimension", lambda self: 768)
    with pytest.raises(ValueError, match="expected 1024"):
        Embedder(device="cpu")


def test_import_does_not_need_sentence_transformers():
    assert "sentence_transformers" not in embed.__dict__
