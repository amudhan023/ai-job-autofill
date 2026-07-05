"""RAG over resume chunks — in-memory cosine store, with an opt-in SQLite
persistence layer (app/services/db.py) so an index can survive across
requests/processes for a given user_id.

Retrieval logic (cosine ranking) is always in-memory and identical either
way; persistence is a storage concern layered underneath via `user_id`.
Existing callers that don't pass `user_id` (e.g. app/api/ai.py's per-request
ephemeral store) are unaffected — nothing is persisted unless a user_id is
given.
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
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@dataclass
class VectorStore:
    embeddings: Embeddings
    user_id: str | None = None
    _texts: list[str] = field(default_factory=list)
    _vecs: list[list[float]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.user_id is not None:
            from app.services.db import get_rag_chunk_store

            texts, vecs = get_rag_chunk_store().load(self.user_id)
            self._texts.extend(texts)
            self._vecs.extend(vecs)

    def add(self, texts: list[str]) -> None:
        if not texts:
            return
        vecs = self.embeddings.embed(texts)
        self._texts.extend(texts)
        self._vecs.extend(vecs)
        if self.user_id is not None:
            from app.services.db import get_rag_chunk_store

            get_rag_chunk_store().save(self.user_id, texts, vecs)

    def retrieve(self, query: str, k: int = 3) -> list[tuple[str, float]]:
        if not self._texts:
            return []
        qvec = self.embeddings.embed([query])[0]
        scored = [(t, cosine(qvec, v)) for t, v in zip(self._texts, self._vecs, strict=True)]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]

    def __len__(self) -> int:
        return len(self._texts)
