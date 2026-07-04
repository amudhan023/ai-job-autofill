"""Cover letter service + endpoint tests."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.cover_letter import CoverLetterRequest, generate_cover_letter
from app.services.fakes import FakeLLM

client = TestClient(app)


def test_generate_uses_llm_and_selected_style() -> None:
    llm = FakeLLM(default="Dear Hiring Manager, ...")
    res = generate_cover_letter(
        CoverLetterRequest(
            profileSummary="18y SWE", jdSummary="Staff role", company="Acme", style="startup"
        ),
        llm,
    )
    assert res.letter.startswith("Dear")
    assert res.style == "startup"
    assert res.stubbed is False
    # the style guidance is injected into the system prompt
    assert "energetic" in llm.calls[0]["system"].lower()


def test_invalid_style_falls_back_to_formal() -> None:
    llm = FakeLLM(default="letter")
    res = generate_cover_letter(
        CoverLetterRequest(profileSummary="x", jdSummary="y", company="z", style="nonsense"),
        llm,
    )
    assert res.style == "formal"


def test_endpoint_stubs_without_key() -> None:
    res = client.post(
        "/ai/cover-letter",
        json={"profileSummary": "x", "jdSummary": "y", "company": "Acme", "style": "formal"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["stubbed"] is True
    assert body["model"] == "claude-opus-4-8"
