"""AI fill for fields the deterministic rule engine could not answer.

The extension's rule engine handles everything it has a rule for. What's left
over on a real application is usually job-specific free text ("Why do you want
to work here?", "How many years with Kubernetes?", "When can you start?") — no
rule can cover those, so they used to come back unfilled with an advisory
badge. This service asks Claude for actual values for exactly those fields.

Three gates keep it inside the project's inviolable rules:

1. Category denylist (`is_llm_fillable`) — identity, work-auth, demographic,
   and salary questions are dropped before the prompt is even built.
2. Echo check — a suggestion whose `field_id` wasn't in the request is dropped,
   so a confused model can't write into a field we never offered.
3. Closed-set check — for a select/radio field the value must be one of the
   options actually on the page, matched case-insensitively.

Nothing here submits anything; the extension writes the values for review.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.core.config import settings
from app.services.classifier import classify_keyword, is_llm_fillable
from app.services.llm import LLM, call_tool, get_llm

# One bounded request per page — the extension already caps its own selection,
# this is the server-side backstop against a hostile or broken caller.
MAX_FIELDS = 20


class FillField(BaseModel):
    field_id: str
    label: str
    type: str = "text"
    """Choices for select/radio/checkbox controls; empty for free text."""
    options: list[str] = []
    max_length: int | None = None


class FillRequest(BaseModel):
    fields: list[FillField]
    profile_summary: str = ""
    jd_summary: str = ""


class FillSuggestion(BaseModel):
    field_id: str
    value: str
    confidence: float
    category: str


class FillResponse(BaseModel):
    suggestions: list[FillSuggestion] = []
    model: str = ""
    """True when no LLM is configured — the extension then stays deterministic."""
    stubbed: bool = False


FILL_SYSTEM = """You are filling in a job application on behalf of a candidate.

Rules:
- Answer ONLY from the candidate profile given to you. Never invent an
  employer, a metric, a date, a degree, or a skill the profile does not state.
- If a field cannot be answered from the profile, leave it out of your
  response entirely. An omitted field is correct; a guessed field is not.
- For a field that lists options, return one of those options verbatim.
- For short-answer fields, answer in one sentence. For essay fields, stay
  under 150 words and write in the candidate's own first-person voice.
- confidence: 0.9 when the profile states the answer directly, 0.7 when you
  inferred it reliably from the profile, below 0.5 when you are unsure."""


FILL_TOOL = {
    "name": "fill_fields",
    "description": (
        "Record the value to type into each form field you can answer from the "
        "candidate's profile. Omit fields you cannot answer."
    ),
    # Strict mode: the API validates the model's arguments against this schema
    # before returning them, so the parsing below only has to defend against
    # semantics (wrong field, wrong option), not against malformed shapes.
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "fills": {
                "type": "array",
                "description": "One entry per field you can answer. May be empty.",
                "items": {
                    "type": "object",
                    "properties": {
                        "field_id": {
                            "type": "string",
                            "description": "The exact id of the field, copied from the list.",
                        },
                        "value": {
                            "type": "string",
                            "description": "The exact text to type into the field.",
                        },
                        "confidence": {
                            "type": "number",
                            "description": "0.0-1.0 — how well the profile supports this answer.",
                        },
                    },
                    "required": ["field_id", "value", "confidence"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["fills"],
        "additionalProperties": False,
    },
}


def _build_prompt(req: FillRequest, fields: list[FillField]) -> str:
    lines = []
    for f in fields:
        parts = [f"- id: {f.field_id}", f"  question: {f.label}", f"  control: {f.type}"]
        if f.options:
            parts.append(f"  must be one of: {', '.join(f.options)}")
        if f.max_length:
            parts.append(f"  max characters: {f.max_length}")
        lines.append("\n".join(parts))
    jd = f"\n\nThe role they are applying for:\n{req.jd_summary}" if req.jd_summary else ""
    return (
        f"Candidate profile:\n{req.profile_summary or '(no profile provided)'}"
        f"{jd}\n\nFields still unanswered on the form:\n" + "\n".join(lines)
    )


def suggest_fills(req: FillRequest, llm: LLM | None = None) -> FillResponse:
    client = llm if llm is not None else get_llm()

    allowed: list[FillField] = []
    categories: dict[str, str] = {}
    for field in req.fields[:MAX_FIELDS]:
        if not field.label.strip():
            continue
        category = classify_keyword(field.label)
        if not is_llm_fillable(category):
            continue  # gate 1 — never reaches the model
        allowed.append(field)
        categories[field.field_id] = category

    if client is None or not allowed:
        return FillResponse(model=settings.fill_model, stubbed=client is None)

    raw = call_tool(
        client,
        system=FILL_SYSTEM,
        user=_build_prompt(req, allowed),
        tool=FILL_TOOL,
        model=settings.fill_model,
    )

    by_id = {f.field_id: f for f in allowed}
    suggestions: list[FillSuggestion] = []
    for item in raw.get("fills") or []:
        if not isinstance(item, dict):
            continue
        field = by_id.get(str(item.get("field_id", "")))  # gate 2 — echo check
        value = str(item.get("value", "") or "").strip()
        if field is None or not value:
            continue
        if field.options:  # gate 3 — closed set
            match = next((o for o in field.options if o.strip().lower() == value.lower()), None)
            if match is None:
                continue
            value = match
        if field.max_length and len(value) > field.max_length:
            continue
        try:
            confidence = float(item.get("confidence", 0) or 0)
        except (TypeError, ValueError):
            confidence = 0.0
        suggestions.append(
            FillSuggestion(
                field_id=field.field_id,
                value=value,
                confidence=max(0.0, min(1.0, confidence)),
                category=categories[field.field_id],
            )
        )

    return FillResponse(suggestions=suggestions, model=settings.fill_model)
