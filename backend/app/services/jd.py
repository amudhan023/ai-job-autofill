"""Job-description understanding (Phase 3)."""
from __future__ import annotations

from pydantic import BaseModel

from app.core.config import settings
from app.services.llm import LLM, extract_json, get_llm


class JDExtract(BaseModel):
    requiredSkills: list[str] = []
    niceToHaveSkills: list[str] = []
    yearsExp: int | None = None
    domain: str = ""
    seniorityLevel: str = ""
    sponsorshipOffered: bool | None = None
    remotePolicy: str = ""


JD_SYSTEM = """Extract structured data from a job description. Return ONLY JSON:
{"requiredSkills":[],"niceToHaveSkills":[],"yearsExp":number|null,"domain":"",
 "seniorityLevel":"","sponsorshipOffered":bool|null,"remotePolicy":""}
Base every field strictly on the text; use null/empty when unstated."""


def extract_jd_text(jd_text: str, llm: LLM) -> JDExtract:
    raw = llm.complete(
        system=JD_SYSTEM, user=jd_text[:20000], model=settings.jd_model, max_tokens=1024
    )
    return JDExtract.model_validate(extract_json(raw))


async def extract_jd(jd_text: str, llm: LLM | None = None) -> JDExtract:
    client = llm or get_llm()
    if client is None:
        return JDExtract()
    return extract_jd_text(jd_text, client)


def skill_gap(profile_skills: list[str], jd: JDExtract) -> dict[str, list[str]]:
    """Compare profile skills against JD requirements (case-insensitive)."""
    have = {s.lower() for s in profile_skills}
    missing = [s for s in jd.requiredSkills if s.lower() not in have]
    matched = [s for s in jd.requiredSkills if s.lower() in have]
    return {"matched": matched, "missing": missing}
