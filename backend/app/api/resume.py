"""Resume parsing endpoint. Stubbed until Phase 3 (see services/resume.py)."""
from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from app.models.profile import UserProfile
from app.services.resume import parse_resume

router = APIRouter(prefix="/resume", tags=["resume"])


@router.post("/parse", response_model=UserProfile)
async def parse(file: UploadFile = File(...)) -> UserProfile:
    content = await file.read()
    return await parse_resume(file.filename or "resume", content)
