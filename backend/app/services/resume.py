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


class ResumeExtractionError(Exception):
    """Raised when a resume file cannot be parsed into text."""


def extract_text(filename: str, content: bytes) -> str:
    """Extract plain text from a PDF/DOCX/txt resume (lazy imports).

    Raises ResumeExtractionError on malformed/unsupported input so callers can
    return a 422 rather than surfacing a vendor stack trace as a 500.
    """
    name = filename.lower()
    try:
        if name.endswith(".pdf"):
            from io import BytesIO

            from pdfminer.high_level import extract_text as pdf_extract  # lazy

            text = pdf_extract(BytesIO(content))
        elif name.endswith(".docx"):
            from io import BytesIO

            import docx  # lazy (python-docx)

            document = docx.Document(BytesIO(content))
            text = "\n".join(p.text for p in document.paragraphs)
        else:
            # Plain text / unknown — best effort.
            text = content.decode("utf-8", errors="ignore")
    except Exception as exc:  # noqa: BLE001 — normalize any parser failure
        raise ResumeExtractionError(f"could not read resume '{filename}': {exc}") from exc

    if not text.strip():
        raise ResumeExtractionError(f"no text extracted from '{filename}'")
    return text


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
    # Extract (and thereby validate) the file first, so a malformed upload always
    # fails fast with a clear error — regardless of whether AI is configured —
    # rather than silently returning an empty profile.
    text = extract_text(filename, content)
    client = llm or get_llm()
    if client is None:
        return UserProfile()  # valid file but no AI configured — safe stub
    return parse_resume_text(text, client)
