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


class ServerFakeLLM:
    """Deterministic fake used when running the service in `USE_FAKE_AI` mode.

    Branches on the system prompt so each endpoint gets a well-formed response:
    extraction prompts (resume / JD) get valid JSON; classification gets a label;
    everything else gets STAR-style prose. This lets integration tests exercise
    the real request/response path rather than the empty-stub path.
    """

    RESUME_JSON = (
        '{"personal":{"firstName":"Test","lastName":"Candidate",'
        '"email":"test@example.com"},"experience":[{"company":"Acme",'
        '"title":"Staff Engineer","bullets":["Led a migration"]}],'
        '"meta":{"totalYearsExp":5}}'
    )
    JD_JSON = (
        '{"requiredSkills":["Python","FastAPI"],"niceToHaveSkills":["Docker"],'
        '"yearsExp":5,"domain":"backend","seniorityLevel":"Staff",'
        '"sponsorshipOffered":null,"remotePolicy":"remote"}'
    )
    PROSE = (
        "Situation: In my most recent role I led a critical migration. "
        "Task: I owned delivery across three teams. Action: I drove a phased "
        "rollout with clear ownership. Result: we shipped on time with zero downtime."
    )

    def __init__(self) -> None:
        self.calls: list[dict[str, str]] = []

    def complete(self, *, system: str, user: str, model: str, max_tokens: int = 1024) -> str:
        self.calls.append({"system": system, "user": user, "model": model})
        s = system.lower()
        if "resume" in s and "json" in s:
            return self.RESUME_JSON
        if "job description" in s and "json" in s:
            return self.JD_JSON
        if "classifier" in s or "respond with exactly one of" in s:
            return ""  # let the keyword classifier decide
        return self.PROSE


def make_server_fake_llm() -> ServerFakeLLM:
    return ServerFakeLLM()


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
