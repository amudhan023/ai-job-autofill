"""Resume understanding pipeline (Phase 3).

PDF/DOCX -> text -> Claude structured extraction -> Pydantic UserProfile.
Text extraction and the LLM are both injectable so the parse logic is fully
unit-testable. Without an LLM configured, returns an empty profile (safe stub).
"""
from __future__ import annotations

from app.core.config import settings
from app.models.profile import UserProfile
from app.services.llm import LLM, extract_json, get_llm

RESUME_SYSTEM = """You extract a candidate's resume into strict JSON.
Return ONLY a JSON object with this shape (omit unknown fields, never invent):
{
  "personal": {"firstName","lastName","email","phone","location":{"city","state","country","postalCode"}},
  "workAuth": {"usAuthorized": bool, "sponsorshipNeeded": bool, "visaType"},
  "experience": [{"company","title","startDate","endDate","current": bool, "bullets": []}],
  "education": [{"school","degree","major","gpa": number|null, "year"}],
  "skills": {"technical": [], "languages": [], "certifications": []},
  "preferences": {"salaryExpected","noticePeriod","remotePreference","willingToRelocate": bool},
  "meta": {"totalYearsExp": number}
}
Do not hallucinate values that are not present in the resume text."""


def extract_text(filename: str, content: bytes) -> str:
    """Extract plain text from a PDF/DOCX/txt resume (lazy imports)."""
    name = filename.lower()
    if name.endswith(".pdf"):
        from io import BytesIO

        from pdfminer.high_level import extract_text as pdf_extract  # lazy

        return pdf_extract(BytesIO(content))
    if name.endswith(".docx"):
        from io import BytesIO

        import docx  # lazy (python-docx)

        document = docx.Document(BytesIO(content))
        return "\n".join(p.text for p in document.paragraphs)
    # Plain text / unknown — best effort.
    return content.decode("utf-8", errors="ignore")


def parse_resume_text(text: str, llm: LLM) -> UserProfile:
    """Parse already-extracted resume text into a UserProfile via the LLM."""
    raw = llm.complete(
        system=RESUME_SYSTEM,
        user=text[:20000],  # guard against pathological inputs
        model=settings.resume_model,
        max_tokens=2048,
    )
    data = extract_json(raw)
    return UserProfile.model_validate(data)


async def parse_resume(
    filename: str, content: bytes, llm: LLM | None = None
) -> UserProfile:
    client = llm or get_llm()
    if client is None:
        return UserProfile()  # no key — safe stub
    text = extract_text(filename, content)
    return parse_resume_text(text, client)
