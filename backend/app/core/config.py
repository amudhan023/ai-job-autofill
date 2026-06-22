"""Application settings. Loaded from environment / .env (see .env.example)."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    cors_origins: str = "chrome-extension://*"

    # AI keys (optional; AI endpoints are stubbed until set).
    anthropic_api_key: str = ""
    voyage_api_key: str = ""

    # Model IDs — defaults match PLAN.md §3 (corrected: opus-4-8, voyage embeddings).
    resume_model: str = "claude-sonnet-4-6"
    jd_model: str = "claude-haiku-4-5"
    qa_model: str = "claude-sonnet-4-6"
    cover_letter_model: str = "claude-opus-4-8"
    classifier_model: str = "claude-haiku-4-5"
    embedding_model: str = "voyage-3.5-lite"

    database_url: str = "postgresql://localhost:5432/jobautofill"
    redis_url: str = "redis://localhost:6379/0"

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


settings = Settings()
