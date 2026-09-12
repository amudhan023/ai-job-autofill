"""Application settings. Loaded from environment / .env (see .env.example)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    # Regex of allowed CORS origins. Must be a regex (not literal) so the
    # extension's dynamic origin `chrome-extension://<id>` actually matches.
    cors_origin_regex: str = (
        r"chrome-extension://.*|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?"
    )

    # AI keys (optional; AI endpoints are stubbed until set).
    anthropic_api_key: str = ""
    voyage_api_key: str = ""
    gemini_api_key: str = ""

    # Default Gemini model used for all tasks when Gemini is the active provider.
    gemini_model: str = "gemini-2.0-flash"
    gemini_embedding_model: str = "models/gemini-embedding-001"

    llm_provider: str = ""
    embeddings_provider: str = ""

    # Deterministic fake-AI mode for integration tests / local dev without keys.
    use_fake_ai: bool = False

    # Model IDs. Never date-suffixed — these are the current aliases.
    resume_model: str = "claude-sonnet-5"
    jd_model: str = "claude-haiku-4-5"
    qa_model: str = "claude-sonnet-5"
    cover_letter_model: str = "claude-opus-5"
    classifier_model: str = "claude-haiku-4-5"
    # Filling unmatched form fields: needs tool use + careful "omit if unsure"
    # judgment, so not haiku; sonnet is accurate enough and far cheaper than opus.
    fill_model: str = "claude-sonnet-5"
    embedding_model: str = "voyage-3.5-lite"

    # Zero-infra default: a local SQLite file. Postgres/pgvector is opt-in —
    # point this at a postgresql+psycopg:// URL (and install a Postgres driver).
    database_url: str = "sqlite:///./data/app.db"
    redis_url: str = "redis://localhost:6379/0"

    # pgvector column width — must match the active embeddings provider's
    # output dimension. Changing provider/model later requires dropping and
    # recreating the rag_chunks table.
    embedding_dim: int = 3072

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key) or bool(self.gemini_api_key) or self.use_fake_ai


settings = Settings()
