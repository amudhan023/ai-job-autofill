"""Resume understanding pipeline (Phase 3).

Currently a stub: it validates upload handling and returns an empty profile so
the endpoint is exercisable end-to-end without AI keys. The real pipeline:
  PDF/DOCX -> text (pdfminer.six / python-docx) -> Claude structured extraction
  -> Pydantic validation -> Voyage embeddings -> pgvector.
"""
from __future__ import annotations

from app.core.config import settings
from app.models.profile import UserProfile


async def parse_resume(filename: str, content: bytes) -> UserProfile:
    if not settings.ai_enabled:
        # Stub path — no AI key configured.
        return UserProfile()

    # TODO(Phase 3): extract text, call settings.resume_model for structured JSON,
    # validate into UserProfile, embed with settings.embedding_model.
    raise NotImplementedError("Resume parsing pipeline lands in Phase 3.")
