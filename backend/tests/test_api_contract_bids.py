"""The KP-31 contract: search insights, bid memory and uploads, over the fixture store."""

from kopi.models import BidMemory, SessionFile, TenderInsight


def profile_body(profile) -> dict:
    return profile.model_dump(mode="json")


def test_insights_follow_the_asked_order_and_skip_unknown_tenders(client, pragnition):
    body = {"doc_nos": ["NLB000ETQ26000089", "NOPE", "GVT000ETT26000101"], "profile": profile_body(pragnition), "query": "chatbot knowledge base"}
    found = [TenderInsight.model_validate(x) for x in client.post("/search/insights", json=body).json()]
    assert [x.doc_no for x in found] == ["NLB000ETQ26000089", "GVT000ETT26000101"]
    first = found[0]
    assert first.eligibility.met >= 1, "an open tender meets the closing check"
    assert first.snippet and len(first.snippet) <= 240
    assert first.items >= 0


def test_insights_name_the_first_blocker(client, brightclean):
    body = {"doc_nos": ["GVT000ETT26000101"], "profile": profile_body(brightclean)}
    (found,) = [TenderInsight.model_validate(x) for x in client.post("/search/insights", json=body).json()]
    summary = found.eligibility
    assert summary.met + summary.unmet + summary.unknown >= 2
    if summary.unmet:
        assert summary.blocker is not None and summary.blocker.status == "unmet"


def test_insights_limit_the_batch(client, pragnition):
    body = {"doc_nos": [f"DOC{i}" for i in range(26)], "profile": profile_body(pragnition)}
    assert client.post("/search/insights", json=body).status_code == 422


def test_memory_takes_notes_and_forgets_them(client):
    assert BidMemory.model_validate(client.get("/sessions/s1/memory").json()).notes == []
    memory = BidMemory.model_validate(client.post("/sessions/s1/memory", json={"text": "  We partner with Acme for training  "}).json())
    (note,) = memory.notes
    assert (note.text, note.source) == ("We partner with Acme for training", "you")
    after = BidMemory.model_validate(client.post(f"/sessions/s1/memory/{note.id}/forget").json())
    assert after.notes == []
    assert client.post("/sessions/s1/memory/nope/forget").status_code == 404
    assert client.post("/sessions/s1/memory", json={"text": ""}).status_code == 422


def test_uploads_are_listed_and_served_with_their_type(client):
    pdf = b"%PDF-1.7 synthetic"
    response = client.post("/sessions/s2/uploads", params={"name": "Tender Specs (v2).pdf"}, content=pdf,
                           headers={"Content-Type": "application/pdf"})
    assert response.status_code == 200
    stored = SessionFile.model_validate(response.json())
    assert (stored.kind, stored.size) == ("upload", len(pdf))
    listed = [SessionFile.model_validate(x) for x in client.get("/sessions/s2/files").json()]
    assert [(f.name, f.kind) for f in listed] == [("Tender Specs (v2).pdf", "upload")]
    served = client.get("/sessions/s2/files/Tender Specs (v2).pdf")
    assert served.content == pdf and served.headers["content-type"] == "application/pdf"


def test_uploads_refuse_other_types_bad_names_and_empty_bodies(client):
    assert client.post("/sessions/s3/uploads", params={"name": "run.exe"}, content=b"x").status_code == 400
    assert client.post("/sessions/s3/uploads", params={"name": "../notes.md"}, content=b"x").status_code == 400
    assert client.post("/sessions/s3/uploads", params={"name": ".hidden.md"}, content=b"x").status_code == 400
    assert client.post("/sessions/s3/uploads", params={"name": "empty.txt"}, content=b"").status_code == 400


def test_uploads_are_capped_at_8_mb(client):
    big = b"a" * (8 * 1024 * 1024 + 1)
    assert client.post("/sessions/s4/uploads", params={"name": "big.txt"}, content=big).status_code == 413


def test_bid_flag_defaults_off_in_chat_requests(pragnition):
    from kopi.models import ChatRequest

    assert ChatRequest(message="hi", profile=pragnition).bid is False
