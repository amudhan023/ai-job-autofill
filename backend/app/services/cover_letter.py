"""Cover letter generation (Phase 4) — uses the Opus-class model for tone."""
from __future__ import annotations

from pydantic import BaseModel

from app.core.config import settings
from app.services.llm import LLM, get_llm

STYLES = {
    "formal": "Professional and polished. Third-person company references, measured tone.",
    "startup": "Direct, energetic, first-person, outcome-focused. Minimal fluff.",
    "creative": "Warm and distinctive voice, a memorable opening, still substantive.",
}


class CoverLetterRequest(BaseModel):
    profileSummary: str
    jdSummary: str
    company: str
    style: str = "formal"


class CoverLetterResponse(BaseModel):
    letter: str
    model: str
    style: str
    stubbed: bool = False


def _system(style: str) -> str:
    guide = STYLES.get(style, STYLES["formal"])
    return (
        "You write tailored cover letters that are specific and honest. "
        f"Style: {guide} "
        "Use only facts from the candidate summary — never fabricate experience. "
        "3 short paragraphs, under 250 words. No placeholders like [Company]."
    )


def generate_cover_letter(req: CoverLetterRequest, llm: LLM | None = None) -> CoverLetterResponse:
    client = llm or get_llm()
    style = req.style if req.style in STYLES else "formal"
    if client is None:
        return CoverLetterResponse(letter="", model=settings.cover_letter_model, style=style, stubbed=True)

    user = (
        f"Company: {req.company}\n"
        f"Role summary: {req.jdSummary}\n"
        f"Candidate summary: {req.profileSummary}\n\n"
        "Write the cover letter now."
    )
    letter = client.complete(
        system=_system(style),
        user=user,
        model=settings.cover_letter_model,
        max_tokens=700,
    )
    return CoverLetterResponse(letter=letter.strip(), model=settings.cover_letter_model, style=style)
