import json

from kopi.models import SearchResponse


def test_health(client):
    assert client.get("/health").json() == {"ok": True, "auth": False}


def test_search_returns_ranked_open_tenders(client):
    body = SearchResponse.model_validate(client.get("/search", params={"q": "generative AI assistant"}).json())
    assert body.hits, "expected matches"
    assert body.hits[0].notice.doc_no == "GVT000ETT26000101"
    assert all(h.notice.status == "open" for h in body.hits)


def test_list_and_detail(client, pragnition):
    listed = client.get("/tenders", params={"limit": 5}).json()
    assert len(listed) == 5
    doc = listed[0]["doc_no"]
    detail = client.post(f"/tenders/{doc}/detail", json={"profile": pragnition.model_dump(mode="json")}).json()
    assert detail["notice"]["doc_no"] == doc
    assert detail["eligibility"][0]["kind"] == "closing"


def test_unknown_tender_is_404(client):
    assert client.get("/tenders/NOPE").status_code == 404


def test_overview_and_eligibility(client, pragnition):
    profile = {"profile": pragnition.model_dump(mode="json")}
    overview = client.post("/tenders/GVT000ETT26000101/overview", json=profile).json()
    assert overview["fit"]["recommendation"] in {"BID", "MAYBE", "NO_BID"}
    checks = client.post("/eligibility", json={"doc_no": "GVT000ETT26000101", **profile}).json()
    gra = [c for c in checks if c["kind"] == "gra"]
    assert gra and gra[0]["status"] == "unknown"


def test_awards_and_licences(client):
    market = client.get("/awards/similar", params={"q": "data analytics platform"}).json()
    assert market["similar_count"] >= 1
    assert client.get("/licences").json()
    found = client.get("/licences/search", params={"q": "cleaning"}).json()
    assert found[0]["id"] == "nea-cleaning-business"


def test_chat_streams_events_and_saves_a_file(client, pragnition):
    body = {"message": "cleaning services", "profile": pragnition.model_dump(mode="json"), "session_id": "s1"}
    with client.stream("POST", "/chat", json=body) as response:
        events = [json.loads(line[6:]) for line in response.iter_lines() if line.startswith("data: ")]
    assert [e["type"] for e in events] == ["tool_call", "tool_result", "text", "file", "done"]
    files = client.get("/sessions/s1/files").json()
    assert files[0]["name"] == "clarification-questions.md"
    download = client.get("/sessions/s1/files/clarification-questions.md")
    assert download.text.startswith("# Clarification questions")


def test_access_code_gate(gated_client):
    assert gated_client.get("/search", params={"q": "x"}).status_code == 401
    assert gated_client.post("/auth", json={"code": "wrong"}).status_code == 401
    token = gated_client.post("/auth", json={"code": "kopi-demo"}).json()["token"]
    ok = gated_client.get("/search", params={"q": "cleaning"}, headers={"Authorization": f"Bearer {token}"})
    assert ok.status_code == 200
    forged = token[:-2] + ("AA" if not token.endswith("AA") else "BB")
    assert gated_client.get("/search", params={"q": "x"}, headers={"Authorization": f"Bearer {forged}"}).status_code == 401
