"""FastAPI entrypoint for AI Job Autofill backend.

Phase 1 skeleton: profile CRUD (in-memory), resume parse + AI endpoints stubbed.
Boots without any API keys so the service is runnable and testable immediately.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai, jobs, profile, resume
from app.core.config import settings

app = FastAPI(
    title="AI Job Autofill API",
    version="0.1.0",
    description="Profile sync, resume parsing, and AI orchestration for the extension.",
)

app.add_middleware(
    CORSMiddleware,
    # Regex match — required because the extension origin `chrome-extension://<id>`
    # is dynamic and cannot be enumerated as a literal allow_origins entry.
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profile.router)
app.include_router(resume.router)
app.include_router(ai.router)
app.include_router(jobs.router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "env": settings.env,
        "ai_enabled": settings.ai_enabled,
        "models": {
            "resume": settings.resume_model,
            "jd": settings.jd_model,
            "qa": settings.qa_model,
            "cover_letter": settings.cover_letter_model,
            "classifier": settings.classifier_model,
            "embedding": settings.embedding_model,
        },
    }
