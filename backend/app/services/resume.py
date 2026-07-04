"""Resume understanding pipeline.

PDF/DOCX -> text -> Claude structured extraction -> Pydantic UserProfile.
Text extraction and the LLM are both injectable so the parse logic is fully
unit-testable. Without an LLM configured, falls back to a fast regex/heuristic
extractor that picks up email, phone, links, name, and — for reasonably
conventional resume layouts — experience, education, and skills sections too.
Useful immediately without requiring an API key.
"""
from __future__ import annotations

import re
from datetime import date

from app.core.config import settings
from app.models.profile import Education, Experience, UserProfile
from app.services.llm import LLM, extract_json, get_llm

RESUME_SYSTEM = """You extract a candidate's resume into strict JSON.
Return ONLY a JSON object with this shape (omit unknown fields, never invent):
{
  "personal": {"firstName","lastName","email","phone",
    "location":{"city","state","country","postalCode"}},
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


# --------------------------------------------------------------------------- #
# Section-aware heuristics for the no-LLM fallback.
#
# These only recognize entries in reasonably conventional resume layouts
# (a heading line, then "Title — Company" / date-range / bullet blocks). They
# are deliberately conservative: a missed entry is far better than a wrong one
# for something the user will submit on a job application.
# --------------------------------------------------------------------------- #

_SECTION_ALIASES: dict[str, list[str]] = {
    "experience": [
        "experience", "work experience", "professional experience",
        "employment history", "work history", "relevant experience",
    ],
    "education": ["education", "academic background", "education  training"],
    "skills": [
        "skills", "technical skills", "core competencies", "skills and tools",
        "technologies", "technical proficiencies",
    ],
}
_BOUNDARY_ONLY_HEADERS = [
    "projects", "certifications", "certificates", "summary", "objective",
    "professional summary", "awards", "publications", "references",
    "languages", "volunteer experience", "volunteering", "interests",
    "activities", "additional information", "honors", "honors  awards",
    "coursework", "relevant coursework", "professional development",
    "contact", "contact information",
]
_ALL_HEADER_NAMES = {a for aliases in _SECTION_ALIASES.values() for a in aliases} | set(
    _BOUNDARY_ONLY_HEADERS
)


def _find_sections(lines: list[str]) -> dict[str, tuple[int, int]]:
    """Locate known resume sections by their heading line.

    Only lines that exactly match a known heading (after normalizing case and
    punctuation) count — this avoids misreading a Title-Case job title inside
    a section as the start of a new one.
    """
    headers: list[tuple[int, str | None]] = []
    for i, line in enumerate(lines):
        stripped = line.strip().rstrip(":")
        if not stripped:
            continue
        norm = re.sub(r"[^a-z ]", "", stripped.lower()).strip()
        norm = re.sub(r"\s+", " ", norm)
        if norm not in _ALL_HEADER_NAMES:
            continue
        canonical = next(
            (name for name, aliases in _SECTION_ALIASES.items() if norm in aliases), None
        )
        headers.append((i, canonical))

    sections: dict[str, tuple[int, int]] = {}
    for idx, (line_idx, canonical) in enumerate(headers):
        if canonical is None:
            continue
        end = headers[idx + 1][0] if idx + 1 < len(headers) else len(lines)
        sections[canonical] = (line_idx + 1, end)
    return sections


_MONTHS = {
    "jan": "01", "feb": "02", "mar": "03", "apr": "04", "may": "05", "jun": "06",
    "jul": "07", "aug": "08", "sep": "09", "oct": "10", "nov": "11", "dec": "12",
}
_DATE_RANGE_RE = re.compile(
    r"(?P<start_mon>[A-Za-z]{3,9}\.?\s+|\d{1,2}[/\-])?(?P<start_year>\d{4})"
    r"\s*(?:-|–|—|to)\s*"
    r"(?P<end_mon>[A-Za-z]{3,9}\.?\s+|\d{1,2}[/\-])?(?P<end_year>\d{4}|present|current)",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_TITLE_KEYWORDS_RE = re.compile(
    r"\b(engineer|developer|manager|director|analyst|designer|architect|"
    r"consultant|specialist|coordinator|administrator|scientist|intern|"
    r"associate|lead|officer|president|executive|accountant|technician|"
    r"representative|recruiter|strategist|founder|owner)\b",
    re.IGNORECASE,
)
_DEGREE_RE = re.compile(
    r"\b(b\.?s\.?c?\.?|b\.?a\.?|b\.?eng\.?|m\.?s\.?c?\.?|m\.?a\.?|m\.?eng\.?|mba|"
    r"ph\.?d\.?|bachelors?(?:'s)?|masters?(?:'s)?|associates?(?:'s)?|doctorate)"
    r"(?![a-zA-Z])",  # not \b — trailing periods (e.g. "B.S.") are non-word chars too
    re.IGNORECASE,
)
_INSTITUTION_RE = re.compile(
    r"\b(university|college|institute|polytechnic|school of)\b", re.IGNORECASE
)
_HEADER_SPLIT_RE = re.compile(r"\s+[—–|]\s+|\s+-\s+|,\s+|\s+at\s+", re.IGNORECASE)


def _looks_like_school(text: str) -> bool:
    """Institution names, or a bare acronym like "MIT" / "UCLA"."""
    return bool(_INSTITUTION_RE.search(text)) or bool(re.fullmatch(r"[A-Z]{2,6}", text.strip()))


def _normalize_date(month: str | None, year: str) -> str:
    if year.lower() in ("present", "current"):
        return ""
    if month:
        key = month.strip().rstrip("/-").rstrip(".").lower()
        if key[:3] in _MONTHS:
            return f"{year}-{_MONTHS[key[:3]]}"
        if key.isdigit():
            return f"{year}-{int(key):02d}"
    return year


def _split_title_company(header: str) -> tuple[str, str]:
    """Best-effort split of a "Title — Company" (or "Company — Title") line."""
    parts = [p.strip() for p in _HEADER_SPLIT_RE.split(header, maxsplit=1) if p.strip()]
    if len(parts) < 2:
        return header.strip(), ""
    a, b = parts[0], parts[1]
    if _TITLE_KEYWORDS_RE.search(a) and not _TITLE_KEYWORDS_RE.search(b):
        return a, b
    if _TITLE_KEYWORDS_RE.search(b) and not _TITLE_KEYWORDS_RE.search(a):
        return b, a
    return a, b  # default assumption: "Title, Company" order


def _parse_experience_section(lines: list[str]) -> list[Experience]:
    entries: list[Experience] = []
    pending_header: str | None = None
    current: Experience | None = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        m = _DATE_RANGE_RE.search(line)
        if m:
            before = line[: m.start()].strip(" -–—|,")
            header = before if before else (pending_header or "")
            title, company = _split_title_company(header)
            current = Experience(
                company=company,
                title=title,
                startDate=_normalize_date(m.group("start_mon"), m.group("start_year")),
                endDate=_normalize_date(m.group("end_mon"), m.group("end_year")),
                current=m.group("end_year").lower() in ("present", "current"),
                bullets=[],
            )
            entries.append(current)
            pending_header = None
            continue

        if line.startswith(("-", "•", "*", "◦", "‣")):
            if current is not None:
                current.bullets.append(line.lstrip("-•*◦‣ ").strip())
            continue

        # Not a date line, not a bullet — candidate heading for the *next* entry.
        pending_header = line

    return entries


def _build_education_entry(line: str) -> Education:
    year_match = _YEAR_RE.search(line)
    year = year_match.group(0) if year_match else ""
    cleaned = re.sub(r"\bgraduated\b", "", line, flags=re.IGNORECASE)
    cleaned = _YEAR_RE.sub("", cleaned).strip(" ,.–—-")

    parts = [p.strip() for p in _HEADER_SPLIT_RE.split(cleaned, maxsplit=1) if p.strip()]
    degree_part, school_part = cleaned, ""
    if len(parts) >= 2:
        a, b = parts[0], parts[1]
        if _looks_like_school(b) and not _looks_like_school(a):
            degree_part, school_part = a, b
        elif _looks_like_school(a) and not _looks_like_school(b):
            degree_part, school_part = b, a
        # else: neither part reads as an institution name (e.g. "Degree - Major")
        # — keep both in degree_part; the school may be on its own line, picked
        # up by the standalone-institution-line pass in _parse_education_section.

    deg_match = _DEGREE_RE.search(degree_part)
    degree = deg_match.group(0) if deg_match else ""
    major = _DEGREE_RE.sub("", degree_part, count=1).strip(" .-") if deg_match else degree_part
    major = re.sub(r"^(?:of|in)\s+", "", major, flags=re.IGNORECASE).strip(" .-")

    return Education(school=school_part, degree=degree, major=major, gpa=None, year=year)


def _parse_education_section(lines: list[str]) -> list[Education]:
    entries: list[Education] = []
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith(("-", "•", "*", "◦", "‣")):
            continue

        has_degree = bool(_DEGREE_RE.search(line))
        year_match = _YEAR_RE.search(line)

        if has_degree:
            entries.append(_build_education_entry(line))
        elif year_match and entries and not entries[-1].year:
            # Trailing "Graduated 2019"-style line — attach to the prior entry.
            entries[-1].year = year_match.group(0)
        elif entries and not entries[-1].school and _looks_like_school(line):
            # A school name on its own line, following its degree entry.
            entries[-1].school = line.strip(" ,")

    return entries


def _parse_skills_section(lines: list[str]) -> list[str]:
    tokens: list[str] = []
    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r"^[-•*]\s*", "", line)
        line = re.sub(r"^[A-Za-z &/]+:\s*", "", line)  # drop "Languages & Backend:" style prefix
        for part in re.split(r"[,;|/]|\s{2,}", line):
            token = part.strip(" .()")
            if 1 < len(token) <= 40 and token not in tokens:
                tokens.append(token)
    return tokens[:60]


def _estimate_total_years(experiences: list[Experience]) -> int:
    years: list[int] = []
    for exp in experiences:
        for value in (exp.startDate, exp.endDate):
            m = _YEAR_RE.search(value or "")
            if m:
                years.append(int(m.group(0)))
        if exp.current:
            years.append(date.today().year)
    if len(years) < 2:
        return 0
    return max(0, max(years) - min(years))


def _regex_parse(text: str) -> UserProfile:
    """Fast regex/heuristic fallback — no LLM required.

    Extracts the most reliable structured fields (email, phone, social links,
    name) using patterns that rarely produce false positives, and additionally
    attempts section-aware extraction of experience/education/skills for
    resumes with conventional headings and "Title — Company" / date-range
    layouts. Ambiguous or unrecognized layouts are simply left empty for the
    user to fill in, or for a later AI-parse once an API key is configured.
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
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
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

    # Section-aware extraction (experience / education / skills).
    raw_lines = text.splitlines()
    sections = _find_sections(raw_lines)
    if "experience" in sections:
        start, end = sections["experience"]
        profile.experience = _parse_experience_section(raw_lines[start:end])
    if "education" in sections:
        start, end = sections["education"]
        profile.education = _parse_education_section(raw_lines[start:end])
    if "skills" in sections:
        start, end = sections["skills"]
        profile.skills.technical = _parse_skills_section(raw_lines[start:end])
    if profile.experience:
        profile.meta.totalYearsExp = _estimate_total_years(profile.experience)

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
