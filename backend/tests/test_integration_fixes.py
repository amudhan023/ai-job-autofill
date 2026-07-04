"""Regression tests for issues found during integration testing.

These guard the fixes in the fast unit suite (the live HTTP versions live in
extension/integration/contract.spec.ts)."""
from __future__ import annotations

from fastapi.testclient import TestClient

import app.core.config as config_module
from app.main import app

client = TestClient(app)


def test_cors_echoes_extension_origin() -> None:
    # The bug: allow_origins=["chrome-extension://*"] was a literal, never matching
    # a real extension origin. Fixed with allow_origin_regex.
    origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
    res = client.get("/health", headers={"Origin": origin})
    assert res.headers.get("access-control-allow-origin") == origin


def test_cors_preflight_allows_extension_json_post() -> None:
    origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
    res = client.options(
        "/ai/answer",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert res.status_code in (200, 204)
    assert res.headers.get("access-control-allow-origin") == origin


def test_resume_parse_malformed_pdf_returns_422_not_500() -> None:
    files = {"file": ("broken.pdf", b"not a real pdf", "application/pdf")}
    res = client.post("/resume/parse", files=files)
    assert res.status_code == 422


def test_resume_parse_empty_file_returns_422() -> None:
    files = {"file": ("empty.txt", b"", "text/plain")}
    res = client.post("/resume/parse", files=files)
    assert res.status_code == 422


def test_fake_ai_mode_produces_non_stub_answer(monkeypatch) -> None:
    monkeypatch.setattr(config_module.settings, "use_fake_ai", True)
    res = client.post(
        "/ai/answer",
        json={
            "question": "Describe a time you led a team through change",
            "jd_summary": "Staff",
            "experience": [
                {"company": "Acme", "title": "Staff Engineer", "bullets": ["Led a migration"]}
            ],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["stubbed"] is False
    assert body["category"] == "BEHAVIORAL"
    assert len(body["answer"]) > 0
    assert len(body["retrieved"]) > 0


def test_health_reports_ai_enabled_in_fake_mode(monkeypatch) -> None:
    monkeypatch.setattr(config_module.settings, "use_fake_ai", True)
    assert client.get("/health").json()["ai_enabled"] is True
