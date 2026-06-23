"""Test doubles for the LLM / Embeddings protocols.

Importable from tests (and usable in local dev) so AI service logic can be
exercised deterministically without network or keys.
"""
from __future__ import annotations

import hashlib


class FakeLLM:
    """Returns canned responses. `responses` maps a substring of the user prompt
    to the response to return; falls back to `default`."""

    def __init__(self, responses: dict[str, str] | None = None, default: str = "") -> None:
        self.responses = responses or {}
        self.default = default
        self.calls: list[dict[str, str]] = []

    def complete(self, *, system: str, user: str, model: str, max_tokens: int = 1024) -> str:
        self.calls.append({"system": system, "user": user, "model": model})
        for needle, response in self.responses.items():
            if needle in user:
                return response
        return self.default


class FakeEmbeddings:
    """Deterministic pseudo-embeddings derived from text hashes — stable and
    good enough to verify cosine ranking in tests."""

    def __init__(self, dim: int = 16) -> None:
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def _vec(self, text: str) -> list[float]:
        out: list[float] = []
        for i in range(self.dim):
            h = hashlib.sha256(f"{i}:{text.lower()}".encode()).digest()
            out.append((h[0] / 255.0) * 2 - 1)
        return out
