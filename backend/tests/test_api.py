"""Backend API tests (skeleton phase). Uses FastAPI's TestClient."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_models_and_ai_disabled_by_default() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    # Corrected model IDs from the plan changelog.
    assert body["models"]["cover_letter"] == "claude-opus-4-8"
    assert body["models"]["embedding"] == "voyage-3.5-lite"
    # No key configured in test env → AI stubbed.
    assert body["ai_enabled"] is False


def test_profile_put_then_get_roundtrips() -> None:
    profile = {
        "personal": {"firstName": "Amudhan", "lastName": "Shanmugam", "email": "a@example.com"},
        "meta": {"totalYearsExp": 18},
    }
    put = client.put("/profile/u1", json=profile)
    assert put.status_code == 200
    assert put.json()["personal"]["firstName"] == "Amudhan"

    got = client.get("/profile/u1")
    assert got.status_code == 200
    assert got.json()["personal"]["lastName"] == "Shanmugam"
    assert got.json()["meta"]["totalYearsExp"] == 18


def test_get_unknown_profile_404() -> None:
    assert client.get("/profile/does-not-exist").status_code == 404


def test_resume_parse_without_key_uses_regex_extraction() -> None:
    # A VALID (parseable) file with no AI configured → regex fallback still
    # extracts name/contact basics (see commit 9b9ea4c); AI-only fields stay blank.
    files = {"file": ("resume.txt", b"Jane Doe\nStaff Engineer", "text/plain")}
    res = client.post("/resume/parse", files=files)
    assert res.status_code == 200
    body = res.json()
    assert body["personal"]["firstName"] == "Jane"
    assert body["personal"]["lastName"] == "Doe"
    assert body["experience"] == []  # structured extraction still needs AI


def test_ai_answer_stub_flags_stubbed() -> None:
    res = client.post("/ai/answer", json={"question": "Tell me about a time...", "jd_summary": ""})
    assert res.status_code == 200
    body = res.json()
    assert body["stubbed"] is True
    assert body["model"] == "claude-sonnet-4-6"


def test_ai_jd_stub_returns_empty_extract() -> None:
    res = client.post("/ai/jd", json={"jd_text": "We need a Staff Engineer..."})
    assert res.status_code == 200
    assert res.json()["requiredSkills"] == []
