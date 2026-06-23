"""AI endpoints: classification, JD extraction, and free-text answer generation."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.answers import AnswerRequest, AnswerResponse, generate
from app.services.classifier import classify_question
from app.services.cover_letter import (
    CoverLetterRequest,
    CoverLetterResponse,
    generate_cover_letter,
)
from app.services.jd import JDExtract, extract_jd
from app.services.llm import get_embeddings, get_llm
from app.services.rag import VectorStore, chunk_resume

router = APIRouter(prefix="/ai", tags=["ai"])


class JDRequest(BaseModel):
    jd_text: str


class ClassifyRequest(BaseModel):
    question: str


class ClassifyResponse(BaseModel):
    category: str


@router.post("/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest) -> ClassifyResponse:
    # Keyword classifier always available; LLM refines when configured.
    return ClassifyResponse(category=classify_question(req.question, get_llm()))


@router.post("/jd", response_model=JDExtract)
async def jd(req: JDRequest) -> JDExtract:
    return await extract_jd(req.jd_text)


@router.post("/answer", response_model=AnswerResponse)
async def answer(req: AnswerRequest) -> AnswerResponse:
    # Build an ephemeral RAG store from the supplied experience when embeddings
    # are available; otherwise generation proceeds without retrieval.
    store: VectorStore | None = None
    embeddings = get_embeddings()
    if embeddings is not None and req.experience:
        store = VectorStore(embeddings=embeddings)
        store.add(chunk_resume(req.experience))
    return generate(req, llm=get_llm(), store=store)


@router.post("/cover-letter", response_model=CoverLetterResponse)
async def cover_letter(req: CoverLetterRequest) -> CoverLetterResponse:
    return generate_cover_letter(req, get_llm())
