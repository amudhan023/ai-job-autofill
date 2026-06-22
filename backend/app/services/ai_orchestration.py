"""AI orchestration (Phase 3) — LangGraph pipelines for JD extraction and
free-text answer generation. Stubbed for now so routes are wired and testable.
"""
from __future__ import annotations

from pydantic import BaseModel

from app.core.config import settings


class JDExtract(BaseModel):
    requiredSkills: list[str] = []
    niceToHaveSkills: list[str] = []
    yearsExp: int | None = None
    domain: str = ""
    seniorityLevel: str = ""
    sponsorshipOffered: bool | None = None
    remotePolicy: str = ""


class AnswerRequest(BaseModel):
    question: str
    jd_summary: str = ""


class AnswerResponse(BaseModel):
    answer: str
    confidence: float
    model: str
    stubbed: bool = False


async def extract_jd(jd_text: str) -> JDExtract:
    if not settings.ai_enabled:
        return JDExtract()
    # TODO(Phase 3): call settings.jd_model for structured extraction.
    raise NotImplementedError("JD extraction lands in Phase 3.")


async def generate_answer(req: AnswerRequest) -> AnswerResponse:
    if not settings.ai_enabled:
        return AnswerResponse(
            answer="",
            confidence=0.0,
            model=settings.qa_model,
            stubbed=True,
        )
    # TODO(Phase 3): RAG retrieval + settings.qa_model generation (STAR format).
    raise NotImplementedError("Answer generation lands in Phase 3.")
