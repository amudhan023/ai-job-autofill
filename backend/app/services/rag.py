"""In-memory RAG over resume chunks.

The plan targets pgvector for persistence at scale; for the service skeleton we
use an in-memory cosine store, which keeps the retrieval logic identical and
fully unit-testable. Swapping in pgvector later is a storage concern only.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.services.llm import Embeddings


def chunk_resume(profile_experience: list[dict]) -> list[str]:
    """Turn structured experience into retrievable chunks (one per bullet, plus
    a header line per role for context)."""
    chunks: list[str] = []
    for exp in profile_experience:
        header = f"{exp.get('title', '')} at {exp.get('company', '')}".strip()
        for bullet in exp.get("bullets", []) or []:
            text = f"{header}: {bullet}".strip(": ").strip()
            if text:
                chunks.append(text)
        if not exp.get("bullets") and header:
            chunks.append(header)
    return chunks


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@dataclass
class VectorStore:
    embeddings: Embeddings
    _texts: list[str] = field(default_factory=list)
    _vecs: list[list[float]] = field(default_factory=list)

    def add(self, texts: list[str]) -> None:
        if not texts:
            return
        vecs = self.embeddings.embed(texts)
        self._texts.extend(texts)
        self._vecs.extend(vecs)

    def retrieve(self, query: str, k: int = 3) -> list[tuple[str, float]]:
        if not self._texts:
            return []
        qvec = self.embeddings.embed([query])[0]
        scored = [(t, cosine(qvec, v)) for t, v in zip(self._texts, self._vecs)]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]

    def __len__(self) -> int:
        return len(self._texts)
