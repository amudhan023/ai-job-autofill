"""Resume parsing endpoint."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models.profile import UserProfile
from app.services.resume import ResumeExtractionError, parse_resume

router = APIRouter(prefix="/resume", tags=["resume"])


@router.post("/parse", response_model=UserProfile)
async def parse(file: UploadFile = File(...)) -> UserProfile:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="empty file")
    try:
        return await parse_resume(file.filename or "resume", content)
    except ResumeExtractionError as exc:
        # Bad/unsupported upload is a client error, not a 500.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
