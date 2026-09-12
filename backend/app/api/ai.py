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
from app.services.field_fill import FillRequest, FillResponse, suggest_fills
from app.services.jd import JDExtract, extract_jd
from app.services.llm import get_embeddings, get_llm
from app.services.rag import (
    DEFAULT_USER_ID,
    VectorStore,
    chunk_resume,
    replace_documents,
    search_persisted,
)

router = APIRouter(prefix="/ai", tags=["ai"])


class JDRequest(BaseModel):
    jd_text: str


class ClassifyRequest(BaseModel):
    question: str


class ClassifyResponse(BaseModel):
    category: str


class ClassifyBatchRequest(BaseModel):
    questions: list[str]


class ClassifyBatchResponse(BaseModel):
    categories: list[str]


class DocumentsRequest(BaseModel):
    text: str


class DocumentsResponse(BaseModel):
    chunks: list[str]


@router.post("/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest) -> ClassifyResponse:
    # Keyword classifier always available; LLM refines when configured.
    return ClassifyResponse(category=classify_question(req.question, get_llm()))


@router.post("/classify-batch", response_model=ClassifyBatchResponse)
async def classify_batch(req: ClassifyBatchRequest) -> ClassifyBatchResponse:
    """Classify a page's worth of unmatched fields in one request (M5).

    The extension batches every unknown field of a fill pass here instead of
    issuing one call per field. Capped to keep a single request bounded.
    """
    llm = get_llm()
    questions = req.questions[:25]
    return ClassifyBatchResponse(categories=[classify_question(q, llm) for q in questions])


@router.post("/jd", response_model=JDExtract)
async def jd(req: JDRequest) -> JDExtract:
    return await extract_jd(req.jd_text)


@router.post("/answer", response_model=AnswerResponse)
async def answer(req: AnswerRequest) -> AnswerResponse:
    # Build an ephemeral RAG store from the supplied experience when embeddings
    # are available; otherwise generation proceeds without retrieval.
    store: VectorStore | None = None
    doc_chunks: list[str] = []
    embeddings = get_embeddings()
    if embeddings is not None:
        if req.experience:
            store = VectorStore(embeddings=embeddings)
            store.add(chunk_resume(req.experience))
        doc_chunks = [t for t, _ in search_persisted(DEFAULT_USER_ID, embeddings, req.question)]
    return generate(req, llm=get_llm(), store=store, doc_chunks=doc_chunks)


@router.get("/documents", response_model=DocumentsResponse)
async def get_documents() -> DocumentsResponse:
    from app.services.db import get_rag_chunk_store

    texts, _ = get_rag_chunk_store().load(DEFAULT_USER_ID)
    return DocumentsResponse(chunks=texts)


@router.put("/documents", response_model=DocumentsResponse)
async def put_documents(req: DocumentsRequest) -> DocumentsResponse:
    embeddings = get_embeddings()
    if embeddings is None:
        return DocumentsResponse(chunks=[])
    chunks = replace_documents(DEFAULT_USER_ID, embeddings, req.text)
    return DocumentsResponse(chunks=chunks)


@router.post("/cover-letter", response_model=CoverLetterResponse)
async def cover_letter(req: CoverLetterRequest) -> CoverLetterResponse:
    return generate_cover_letter(req, get_llm())


@router.post("/fill", response_model=FillResponse)
async def fill(req: FillRequest) -> FillResponse:
    """Propose values for fields the extension's rule engine left unanswered.

    Advisory by design: the extension decides what to write, and identity /
    work-auth / demographic / salary questions are stripped server-side before
    the model ever sees them (see services/field_fill.py).
    """
    return suggest_fills(req, get_llm())
