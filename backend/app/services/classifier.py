"""Question classification.

Routes a form question to a category that decides deterministic-vs-AI handling.
When an LLM is configured it's used for nuanced cases; a deterministic keyword
classifier is always available as a fast, free, offline fallback (and is what
runs in tests and without keys).
"""
from __future__ import annotations

import re

from app.core.config import settings
from app.services.llm import LLM

CATEGORIES = [
    "PERSONAL",
    "EMPLOYMENT",
    "EDUCATION",
    "VISA_WORK_AUTH",
    "SALARY",
    "DIVERSITY",
    "BEHAVIORAL",
    "MOTIVATION",
    "TECHNICAL_SKILL",
    "COVER_LETTER",
]

# Ordered: first match wins. Sensitive/legal categories are matched early.
_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("VISA_WORK_AUTH", re.compile(r"authoriz|visa|sponsor|work permit|right to work", re.I)),
    ("DIVERSITY", re.compile(r"race|ethnic|gender|disab|veteran|orientation|pronoun", re.I)),
    ("SALARY", re.compile(r"salary|compensation|expected pay|ctc|desired pay", re.I)),
    ("COVER_LETTER", re.compile(r"cover letter", re.I)),
    (
        "BEHAVIORAL",
        re.compile(r"describe a time|tell me about a time|give an example|situation where", re.I),
    ),
    (
        "MOTIVATION",
        re.compile(r"why (do you|are you|this|our|us)|what (interests|motivates)|why join", re.I),
    ),
    ("EDUCATION", re.compile(r"degree|university|college|gpa|major|graduat", re.I)),
    (
        "TECHNICAL_SKILL",
        re.compile(r"years.*(experience|exp).*(with|in)|proficien|familiar with|rate your", re.I),
    ),
    (
        "EMPLOYMENT",
        re.compile(r"current (company|employer|role|title)|present employer|notice period", re.I),
    ),
    ("PERSONAL", re.compile(r"name|email|phone|address|city|state|zip|linkedin|github", re.I)),
]


def classify_keyword(question: str) -> str:
    for category, pattern in _RULES:
        if pattern.search(question):
            return category
    return "MOTIVATION"  # safest default: treat unknown free-text as motivation


def classify_question(question: str, llm: LLM | None = None) -> str:
    """Classify a question. Uses the keyword classifier unless an LLM is provided
    and the keyword classifier is unsure (no strong match)."""
    keyword = classify_keyword(question)
    if llm is None:
        return keyword

    system = (
        "You are a strict classifier. Given a job-application form question, "
        f"respond with exactly one of: {', '.join(CATEGORIES)}. No other text."
    )
    raw = llm.complete(system=system, user=question, model=settings.classifier_model, max_tokens=8)
    candidate = raw.strip().upper()
    return candidate if candidate in CATEGORIES else keyword


def is_ai_category(category: str) -> bool:
    """Categories that warrant AI free-text generation (never the sensitive ones)."""
    return category in {"BEHAVIORAL", "MOTIVATION", "COVER_LETTER"}
