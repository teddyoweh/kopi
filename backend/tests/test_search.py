from kopi.index import Match
from kopi.search import BM25, as_doc_no, distinct_awards, rerank, tokens


def match(doc_id: str, score: float, **meta) -> Match:
    return Match(doc_id, score, meta)


def test_tokens_drop_stopwords_and_case():
    assert tokens("Supply OF the CCTV for Schools") == ["supply", "cctv", "schools"]


def test_doc_numbers_are_recognised():
    assert as_doc_no(" moeschetq26004322 ") == "MOESCHETQ26004322"
    assert as_doc_no("office cleaning") is None


def test_rerank_breaks_close_dense_scores_toward_exact_words():
    bm25 = BM25({"a": "CCTV installation for schools", "b": "Security services for schools"})
    ranked = rerank("CCTV installation", [match("b", 0.50, title="Security services for schools"), match("a", 0.48, title="CCTV installation for schools")], bm25, lambda m: m.metadata["title"])
    assert [r.match.id for r in ranked] == ["a", "b"]
    assert ranked[0].highlights == ["cctv", "installation"]


def test_rerank_does_not_let_keywords_override_a_clear_semantic_winner():
    bm25 = BM25({"a": "cleaning cleaning cleaning", "b": "janitorial services"})
    ranked = rerank("cleaning", [match("b", 0.80, title="janitorial services"), match("a", 0.40, title="cleaning")], bm25, lambda m: m.metadata["title"])
    assert ranked[0].match.id == "b"


def test_distinct_awards_collapse_repeated_descriptions_keeping_the_closest():
    found = [
        match("T1", 0.9, tender_no="T1", description="Catering for  camp", agency="A", status="Awarded", suppliers=["X"], amount=10.0),
        match("T2", 0.8, tender_no="T2", description="catering for camp", agency="A", status="Awarded", suppliers=["Y"], amount=12.0),
        match("T3", 0.7, tender_no="T3", description="Event venue", agency="B", status="Awarded", suppliers=["Z"]),
    ]
    assert [t.tender_no for t in distinct_awards(found)] == ["T1", "T3"]
