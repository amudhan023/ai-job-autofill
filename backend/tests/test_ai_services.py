"""Phase 3 AI service tests — deterministic via FakeLLM / FakeEmbeddings."""

from __future__ import annotations

import json

from app.services.answers import AnswerRequest, generate
from app.services.classifier import classify_keyword, classify_question, is_ai_category
from app.services.fakes import FakeEmbeddings, FakeLLM
from app.services.jd import JDExtract, extract_jd_text, skill_gap
from app.services.rag import VectorStore, chunk_resume, cosine
from app.services.resume import parse_resume_text

# ---- classifier ----------------------------------------------------------- #


def test_keyword_classifier_routes_sensitive_categories_first() -> None:
    assert classify_keyword("Are you authorized to work in the US?") == "VISA_WORK_AUTH"
    assert classify_keyword("What is your gender identity?") == "DIVERSITY"
    assert classify_keyword("Expected salary?") == "SALARY"
    assert classify_keyword("Describe a time you led a team") == "BEHAVIORAL"
    assert classify_keyword("Why do you want to join us?") == "MOTIVATION"


def test_is_ai_category_excludes_sensitive() -> None:
    assert is_ai_category("BEHAVIORAL")
    assert is_ai_category("COVER_LETTER")
    assert not is_ai_category("VISA_WORK_AUTH")
    assert not is_ai_category("DIVERSITY")


def test_classifier_uses_llm_when_provided() -> None:
    llm = FakeLLM(default="BEHAVIORAL")
    assert classify_question("Some ambiguous prompt", llm) == "BEHAVIORAL"


def test_classifier_falls_back_when_llm_returns_garbage() -> None:
    llm = FakeLLM(default="NOT_A_CATEGORY")
    # keyword classifier sees "salary" → SALARY despite bad LLM output
    assert classify_question("expected salary", llm) == "SALARY"


# ---- resume parse --------------------------------------------------------- #


def test_parse_resume_text_validates_into_profile() -> None:
    payload = {
        "personal": {"firstName": "Amudhan", "lastName": "Shanmugam", "email": "a@x.com"},
        "experience": [{"company": "Confluent", "title": "Staff Engineer", "bullets": ["Led X"]}],
        "meta": {"totalYearsExp": 18},
    }
    llm = FakeLLM(default=f"```json\n{json.dumps(payload)}\n```")
    profile = parse_resume_text("resume text", llm)
    assert profile.personal.firstName == "Amudhan"
    assert profile.experience[0].company == "Confluent"
    assert profile.meta.totalYearsExp == 18


# ---- JD extraction -------------------------------------------------------- #


def test_extract_jd_text_parses_json() -> None:
    payload = {"requiredSkills": ["Kafka", "Go"], "yearsExp": 8, "seniorityLevel": "Staff"}
    llm = FakeLLM(default=json.dumps(payload))
    jd = extract_jd_text("we need kafka", llm)
    assert jd.requiredSkills == ["Kafka", "Go"]
    assert jd.yearsExp == 8


def test_skill_gap_is_case_insensitive() -> None:
    jd = JDExtract(requiredSkills=["Kafka", "Go", "Rust"])
    gap = skill_gap(["kafka", "go"], jd)
    assert gap["matched"] == ["Kafka", "Go"]
    assert gap["missing"] == ["Rust"]


# ---- RAG ------------------------------------------------------------------ #


def test_cosine_bounds() -> None:
    assert cosine([1, 0], [1, 0]) == 1.0
    assert cosine([1, 0], [0, 1]) == 0.0
    assert cosine([0, 0], [1, 1]) == 0.0


def test_chunk_resume_produces_bullet_chunks() -> None:
    exp = [{"company": "Acme", "title": "SWE", "bullets": ["Built X", "Scaled Y"]}]
    chunks = chunk_resume(exp)
    assert len(chunks) == 2
    assert "Built X" in chunks[0]


def test_vector_store_retrieves_most_relevant_chunk() -> None:
    store = VectorStore(embeddings=FakeEmbeddings())
    store.add(["Led migration to Kafka", "Mentored interns", "Wrote documentation"])
    results = store.retrieve("Led migration to Kafka", k=1)
    assert results[0][0] == "Led migration to Kafka"
    assert results[0][1] > 0.99


# ---- answer generation ---------------------------------------------------- #


def test_generate_behavioral_answer_with_rag() -> None:
    llm = FakeLLM(default="STAR answer here.")
    store = VectorStore(embeddings=FakeEmbeddings())
    store.add(
        chunk_resume([{"company": "Acme", "title": "SWE", "bullets": ["Led a team through reorg"]}])
    )
    res = generate(
        AnswerRequest(
            question="Describe a time you led a team through change", jd_summary="Staff role"
        ),
        llm=llm,
        store=store,
    )
    assert res.category == "BEHAVIORAL"
    assert res.answer == "STAR answer here."
    assert res.confidence == 0.85
    assert res.retrieved  # RAG context was used


def test_generate_skips_deterministic_categories() -> None:
    llm = FakeLLM(default="should not be used")
    res = generate(AnswerRequest(question="Are you authorized to work in the US?"), llm=llm)
    assert res.category == "VISA_WORK_AUTH"
    assert res.answer == ""


def test_generate_stubbed_without_llm() -> None:
    res = generate(AnswerRequest(question="Why do you want to join us?"), llm=None)
    assert res.stubbed is True
    assert res.answer == ""


def test_classify_batch_endpoint() -> None:
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    res = client.post(
        "/ai/classify-batch",
        json={
            "questions": [
                "Are you authorized to work in the US?",
                "Why do you want to join us?",
                "What is your expected salary?",
            ]
        },
    )
    assert res.status_code == 200
    cats = res.json()["categories"]
    assert cats[0] == "VISA_WORK_AUTH"
    assert cats[1] == "MOTIVATION"
    assert cats[2] == "SALARY"


def test_classify_batch_caps_input() -> None:
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    res = client.post("/ai/classify-batch", json={"questions": ["salary?"] * 100})
    assert res.status_code == 200
    assert len(res.json()["categories"]) == 25
