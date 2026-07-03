"""LLM + embeddings provider abstraction.

Services depend on the `LLM` / `Embeddings` protocols, never on a vendor SDK
directly. Real implementations lazily import the Anthropic / Voyage SDKs so the
app boots (and tests run) without them installed or keys configured. Tests inject
`FakeLLM` / `FakeEmbeddings`.
"""
from __future__ import annotations

import json
import re
from typing import Protocol

from app.core.config import settings


class LLM(Protocol):
    def complete(self, *, system: str, user: str, model: str, max_tokens: int = 1024) -> str: ...


class Embeddings(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


# --------------------------------------------------------------------------- #
# Real implementations (lazy SDK import; only used when keys are configured).
# --------------------------------------------------------------------------- #


class AnthropicLLM:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._client = None

    def _ensure(self) -> object:
        if self._client is None:
            import anthropic  # lazy

            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def complete(self, *, system: str, user: str, model: str, max_tokens: int = 1024) -> str:
        client = self._ensure()
        msg = client.messages.create(  # type: ignore[attr-defined]
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        # Concatenate text blocks.
        parts = [getattr(b, "text", "") for b in msg.content]
        return "".join(parts)


class GeminiLLM:
    """Google Gemini via the google-genai SDK.

    The `model` argument passed by callers contains Claude model IDs
    (e.g. "claude-sonnet-4-6"). GeminiLLM ignores it and always uses the
    configured `gemini_model` so call-sites don't need to be changed.
    """

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self._client = None

    def _ensure(self) -> object:
        if self._client is None:
            from google import genai  # lazy

            self._client = genai.Client(api_key=self._api_key)
        return self._client

    def complete(self, *, system: str, user: str, model: str, max_tokens: int = 1024) -> str:
        client = self._ensure()
        from google.genai import types  # lazy

        response = client.models.generate_content(  # type: ignore[attr-defined]
            model=self._model,
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=max_tokens,
            ),
        )
        return response.text or ""


class VoyageEmbeddings:
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self._client = None

    def _ensure(self) -> object:
        if self._client is None:
            import voyageai  # lazy

            self._client = voyageai.Client(api_key=self._api_key)
        return self._client

    def embed(self, texts: list[str]) -> list[list[float]]:
        client = self._ensure()
        result = client.embed(texts, model=self._model)  # type: ignore[attr-defined]
        return list(result.embeddings)


# --------------------------------------------------------------------------- #
# Factories — return None when not configured (services then use fallbacks).
# --------------------------------------------------------------------------- #


def get_llm() -> LLM | None:
    if settings.use_fake_ai:
        from app.services.fakes import make_server_fake_llm  # lazy to avoid cycles

        return make_server_fake_llm()
    if settings.anthropic_api_key:
        return AnthropicLLM(settings.anthropic_api_key)
    if settings.gemini_api_key:
        return GeminiLLM(settings.gemini_api_key, settings.gemini_model)
    return None


def get_embeddings() -> Embeddings | None:
    if settings.use_fake_ai:
        from app.services.fakes import FakeEmbeddings

        return FakeEmbeddings()
    if not settings.voyage_api_key:
        return None
    return VoyageEmbeddings(settings.voyage_api_key, settings.embedding_model)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM response (tolerates code fences)."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    raw = fenced.group(1) if fenced else None
    if raw is None:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        raw = brace.group(0) if brace else text
    return json.loads(raw)
