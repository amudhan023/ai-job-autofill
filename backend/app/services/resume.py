"""Resume understanding pipeline.

PDF/DOCX -> text -> Claude structured extraction -> Pydantic UserProfile.
Text extraction and the LLM are both injectable so the parse logic is fully
unit-testable. Without an LLM configured, falls back to a fast regex extractor
that picks up at minimum email, phone, links, and the candidate's name — useful
immediately without requiring an API key.
"""
from __future__ import annotations

import re

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


def _regex_parse(text: str) -> UserProfile:
    """Fast regex fallback — no LLM required.

    Extracts the most reliable structured fields (email, phone, social links,
    name) using patterns that rarely produce false positives. Everything that
    needs semantic understanding (job titles, dates, bullets) is left empty for
    the user to fill in, or for a later AI-parse once an API key is configured.
    """
    profile = UserProfile()

    # Email
    m = re.search(r"[\w.+\-]+@[\w\-]+\.[\w.]+", text)
    if m:
        profile.personal.email = m.group(0)

    # Phone — US + international formats
    m = re.search(
        r"(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}", text
    )
    if m:
        profile.personal.phone = m.group(0).strip()

    # LinkedIn
    m = re.search(r"linkedin\.com/in/([\w\-]+)", text, re.IGNORECASE)
    if m:
        profile.links.linkedin = f"https://linkedin.com/in/{m.group(1)}"

    # GitHub
    m = re.search(r"github\.com/([\w\-]+)", text, re.IGNORECASE)
    if m:
        profile.links.github = f"https://github.com/{m.group(1)}"

    # Portfolio / personal website (skip linkedin/github hits)
    m = re.search(
        r"https?://(?!(?:www\.)?(?:linkedin|github)\.com)[\w\-]+\.[\w\-]+(?:\.[a-z]{2,})?(?:/[\w.\-/]*)?",
        text,
        re.IGNORECASE,
    )
    if m:
        profile.links.portfolio = m.group(0).rstrip("/.,;)")

    # Candidate name — heuristic: first line of ≤4 capitalised words before any
    # contact details appear. Resume headers almost always start with the name.
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    for line in lines[:8]:
        words = line.split()
        # Skip lines that look like addresses, headings, or contact info
        if not (2 <= len(words) <= 4):
            continue
        if any(c in line for c in ("@", "http", "linkedin", "github", "|", "•")):
            continue
        alpha_words = [w for w in words if re.match(r"^[A-Za-z'\-]+$", w)]
        if len(alpha_words) == len(words) and all(w[0].isupper() for w in alpha_words):
            profile.personal.firstName = alpha_words[0]
            profile.personal.lastName = " ".join(alpha_words[1:])
            break

    # City / State — look for "City, ST" or "City, State" pattern
    m = re.search(
        r"\b([A-Z][a-z]+(?: [A-Z][a-z]+)*),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b",
        text,
    )
    if m:
        profile.personal.location.city = m.group(1)
        profile.personal.location.state = m.group(2)

    return profile


async def parse_resume(
    filename: str, content: bytes, llm: LLM | None = None
) -> UserProfile:
    # Extract (and thereby validate) the file first, so a malformed upload always
    # fails fast with a clear error — regardless of whether AI is configured —
    # rather than silently returning an empty profile.
    text = extract_text(filename, content)
    client = llm or get_llm()
    if client is None:
        # No AI key configured — use the regex fallback so the user at least
        # gets email, phone, links and name pre-filled.
        return _regex_parse(text)
    return parse_resume_text(text, client)
