"""Free-text answer generation (Phase 3) — RAG + STAR for behavioral questions."""

from __future__ import annotations

from pydantic import BaseModel

from app.core.config import settings
from app.services.classifier import classify_question, is_ai_category
from app.services.llm import LLM, get_llm
from app.services.rag import VectorStore


class AnswerRequest(BaseModel):
    question: str
    jd_summary: str = ""
    experience: list[dict] = []  # profile.experience for RAG context


class AnswerResponse(BaseModel):
    answer: str
    confidence: float
    model: str
    category: str
    retrieved: list[str] = []
    stubbed: bool = False


ANSWER_SYSTEM = """You write concise, specific job-application answers in the
candidate's voice. For behavioral questions use STAR (Situation, Task, Action,
Result). Use ONLY the provided experiences — never invent metrics or facts.
Max 200 words."""


def _build_prompt(question: str, jd_summary: str, chunks: list[str]) -> str:
    context = "\n".join(f"- {c}" for c in chunks) or "(no specific experience provided)"
    jd = f"\nTarget role summary: {jd_summary}" if jd_summary else ""
    return (
        f"Question: {question}{jd}\n\n"
        f"Candidate's relevant experiences:\n{context}\n\n"
        f"Write the answer now."
    )


def generate(
    req: AnswerRequest,
    llm: LLM | None = None,
    store: VectorStore | None = None,
) -> AnswerResponse:
    client = llm
    if client is None:
        client = get_llm()

    category = classify_question(req.question, client)

    if not is_ai_category(category):
        # Deterministic categories must not be AI-generated here.
        return AnswerResponse(
            answer="",
            confidence=0.0,
            model=settings.qa_model,
            category=category,
            stubbed=client is None,
        )

    if client is None:
        return AnswerResponse(
            answer="", confidence=0.0, model=settings.qa_model, category=category, stubbed=True
        )

    chunks: list[str] = []
    if store is not None and len(store) > 0:
        chunks = [t for t, _ in store.retrieve(req.question, k=3)]

    answer = client.complete(
        system=ANSWER_SYSTEM,
        user=_build_prompt(req.question, req.jd_summary, chunks),
        model=settings.qa_model,
        max_tokens=512,
    )
    # RAG-backed answers with concrete chunks earn higher confidence.
    confidence = 0.85 if chunks else 0.6
    return AnswerResponse(
        answer=answer.strip(),
        confidence=confidence,
        model=settings.qa_model,
        category=category,
        retrieved=chunks,
    )
