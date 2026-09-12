"""Gates around AI-suggested values for unmatched form fields."""

from __future__ import annotations

import json

from app.services.classifier import is_llm_fillable
from app.services.fakes import FakeLLM
from app.services.field_fill import FillField, FillRequest, suggest_fills


def _llm(fills: list[dict]) -> FakeLLM:
    return FakeLLM(default=json.dumps({"fills": fills}))


def test_structured_fields_never_reach_the_model() -> None:
    """CLAUDE.md's inviolable rule: identity / work-auth / demographics / salary
    are the rule engine's job, so they are dropped before the prompt is built."""
    llm = _llm([])
    req = FillRequest(
        fields=[
            FillField(field_id="a", label="Email address"),
            FillField(field_id="b", label="Are you authorized to work in the US?"),
            FillField(field_id="c", label="What is your gender?"),
            FillField(field_id="d", label="Expected salary"),
        ]
    )
    assert suggest_fills(req, llm).suggestions == []
    assert llm.calls == []  # not a single call was made


def test_answers_a_free_text_question() -> None:
    llm = _llm([{"field_id": "q1", "value": "Because I love it.", "confidence": 0.8}])
    req = FillRequest(
        fields=[FillField(field_id="q1", label="Why do you want to work here?")],
        profile_summary="Jo Dev; Staff Engineer at Acme",
    )
    out = suggest_fills(req, llm).suggestions
    assert [(s.field_id, s.value) for s in out] == [("q1", "Because I love it.")]
    assert out[0].category == "MOTIVATION"


def test_drops_a_field_id_we_never_sent() -> None:
    """A confused model must not be able to write into some other control."""
    llm = _llm([{"field_id": "not-on-this-page", "value": "hi", "confidence": 0.9}])
    req = FillRequest(fields=[FillField(field_id="q1", label="Why do you want this role?")])
    assert suggest_fills(req, llm).suggestions == []


def test_choice_fields_must_use_an_option_that_exists() -> None:
    opts = ["Yes", "No"]
    req = FillRequest(
        fields=[FillField(field_id="q1", label="Why relocate? Willing to relocate?", options=opts)]
    )
    assert (
        suggest_fills(
            req, _llm([{"field_id": "q1", "value": "Maybe", "confidence": 0.9}])
        ).suggestions
        == []
    )
    # Case-insensitive match snaps back to the page's exact option text.
    got = suggest_fills(
        req, _llm([{"field_id": "q1", "value": "yes", "confidence": 0.9}])
    ).suggestions
    assert got[0].value == "Yes"


def test_respects_max_length_and_unparseable_replies() -> None:
    req = FillRequest(fields=[FillField(field_id="q1", label="Why us?", max_length=5)])
    assert (
        suggest_fills(
            req, _llm([{"field_id": "q1", "value": "far too long", "confidence": 1}])
        ).suggestions
        == []
    )
    assert suggest_fills(req, FakeLLM(default="sorry, I can't")).suggestions == []


def test_no_llm_configured_is_reported_as_stubbed() -> None:
    res = suggest_fills(FillRequest(fields=[FillField(field_id="q1", label="Why us?")]), None)
    assert res.stubbed is True and res.suggestions == []


def test_denylist() -> None:
    assert is_llm_fillable("BEHAVIORAL") and is_llm_fillable("TECHNICAL_SKILL")
    assert not is_llm_fillable("PERSONAL") and not is_llm_fillable("VISA_WORK_AUTH")
