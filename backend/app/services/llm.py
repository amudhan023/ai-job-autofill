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


class ToolLLM(Protocol):
    """Providers that can return structured output via native tool use.

    Optional: `call_tool()` below falls back to prompt-and-parse JSON for
    providers that don't implement this.
    """

    def use_tool(
        self, *, system: str, user: str, tool: dict, model: str, max_tokens: int = 2048
    ) -> dict: ...


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

    def use_tool(
        self, *, system: str, user: str, tool: dict, model: str, max_tokens: int = 2048
    ) -> dict:
        """Force a single tool call and return its parsed input.

        `tool_choice` pins the response to this one tool, so the model cannot
        answer in prose — the SDK hands back `block.input` already parsed,
        which is why nothing here does string matching on the reply.
        """
        client = self._ensure()
        msg = client.messages.create(  # type: ignore[attr-defined]
            model=model,
            max_tokens=max_tokens,
            system=system,
            tools=[tool],
            tool_choice={"type": "tool", "name": tool["name"]},
            messages=[{"role": "user", "content": user}],
        )
        for block in msg.content:
            if getattr(block, "type", "") == "tool_use":
                return dict(block.input)
        return {}


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


class GeminiEmbeddings:
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self._client = None

    def _ensure(self) -> object:
        if self._client is None:
            from google import genai  # lazy

            self._client = genai.Client(api_key=self._api_key)
        return self._client

    def embed(self, texts: list[str]) -> list[list[float]]:
        client = self._ensure()
        response = client.models.embed_content(  # type: ignore[attr-defined]
            model=self._model,
            contents=texts,
        )
        return [emb.values for emb in response.embeddings]


# --------------------------------------------------------------------------- #
# Factories — return None when not configured (services then use fallbacks).
# --------------------------------------------------------------------------- #


def get_llm() -> LLM | None:
    if settings.use_fake_ai:
        from app.services.fakes import make_server_fake_llm  # lazy to avoid cycles

        return make_server_fake_llm()

    provider = settings.llm_provider.lower() if settings.llm_provider else None

    if provider == "anthropic" and settings.anthropic_api_key:
        return AnthropicLLM(settings.anthropic_api_key)
    if provider == "gemini" and settings.gemini_api_key:
        return GeminiLLM(settings.gemini_api_key, settings.gemini_model)

    # Fallback/auto-detect
    if settings.anthropic_api_key:
        return AnthropicLLM(settings.anthropic_api_key)
    if settings.gemini_api_key:
        return GeminiLLM(settings.gemini_api_key, settings.gemini_model)
    return None


def get_embeddings() -> Embeddings | None:
    if settings.use_fake_ai:
        from app.services.fakes import FakeEmbeddings

        return FakeEmbeddings()

    provider = settings.embeddings_provider.lower() if settings.embeddings_provider else None

    if provider == "voyage" and settings.voyage_api_key:
        return VoyageEmbeddings(settings.voyage_api_key, settings.embedding_model)
    if provider == "gemini" and settings.gemini_api_key:
        return GeminiEmbeddings(settings.gemini_api_key, settings.gemini_embedding_model)

    # Fallback/auto-detect
    if settings.voyage_api_key:
        return VoyageEmbeddings(settings.voyage_api_key, settings.embedding_model)
    if settings.gemini_api_key:
        return GeminiEmbeddings(settings.gemini_api_key, settings.gemini_embedding_model)
    return None


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def call_tool(
    llm: LLM,
    *,
    system: str,
    user: str,
    tool: dict,
    model: str,
    max_tokens: int = 2048,
) -> dict:
    """Structured output from any provider, as the tool's input dict.

    Anthropic gets real tool use (schema enforced server-side). Anything else
    — Gemini, the test fakes — is asked for the same schema as JSON text and
    parsed. Returns {} when the model answered with something unparseable;
    callers treat that as "no suggestions", never as an error.
    """
    use_tool = getattr(llm, "use_tool", None)
    if callable(use_tool):
        return use_tool(system=system, user=user, tool=tool, model=model, max_tokens=max_tokens)

    schema = json.dumps(tool["input_schema"])
    try:
        return extract_json(
            llm.complete(
                system=f"{system}\n\nReply with ONLY a JSON object matching this schema:\n{schema}",
                user=user,
                model=model,
                max_tokens=max_tokens,
            )
        )
    except (ValueError, TypeError):
        return {}


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM response (tolerates code fences)."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    raw = fenced.group(1) if fenced else None
    if raw is None:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        raw = brace.group(0) if brace else text
    return json.loads(raw)
