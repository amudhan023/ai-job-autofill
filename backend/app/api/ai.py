"""AI endpoints: JD extraction and free-text answer generation (stubbed)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.ai_orchestration import (
    AnswerRequest,
    AnswerResponse,
    JDExtract,
    extract_jd,
    generate_answer,
)

router = APIRouter(prefix="/ai", tags=["ai"])


class JDRequest(BaseModel):
    jd_text: str


@router.post("/jd", response_model=JDExtract)
async def jd(req: JDRequest) -> JDExtract:
    return await extract_jd(req.jd_text)


@router.post("/answer", response_model=AnswerResponse)
async def answer(req: AnswerRequest) -> AnswerResponse:
    return await generate_answer(req)
