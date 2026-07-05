"""SQLAlchemy-backed persistence: profile store (default, zero-infra SQLite)
and optional RAG chunk persistence for `VectorStore` (app/services/rag.py).

Postgres/pgvector is opt-in via `DATABASE_URL` — same engine, no interface
changes; just install a Postgres driver alongside it.
"""

from __future__ import annotations

import struct
from pathlib import Path

from sqlalchemy import Engine, LargeBinary, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.models.profile import UserProfile


class Base(DeclarativeBase):
    pass


class ProfileRecord(Base):
    __tablename__ = "profiles"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    profile_json: Mapped[str] = mapped_column(Text, nullable=False)


class RagChunkRecord(Base):
    __tablename__ = "rag_chunks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    vector: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


def make_engine(database_url: str) -> Engine:
    """Build (and migrate) an engine for `database_url`. For a file-based
    SQLite URL, ensures the parent directory exists first; for the in-memory
    SQLite URL (tests), uses a StaticPool so every session shares the same
    connection — plain pooling hands out a fresh, empty `:memory:` database
    per connection, which would silently drop everything between sessions."""
    is_sqlite = database_url.startswith("sqlite")
    is_sqlite_memory = database_url in ("sqlite:///:memory:", "sqlite://")

    if is_sqlite and not is_sqlite_memory:
        db_path = database_url.removeprefix("sqlite:///")
        if db_path:
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    kwargs: dict = {}
    if is_sqlite:
        # busy_timeout: SQLite allows one writer at a time; without this,
        # a second concurrent write fails immediately with "database is
        # locked" instead of waiting briefly for the first to finish.
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    if is_sqlite_memory:
        kwargs["poolclass"] = StaticPool

    engine = create_engine(database_url, **kwargs)
    Base.metadata.create_all(engine)
    return engine


class ProfileStore:
    """Key-value profile persistence, keyed by user_id — same shape the
    in-memory dict it replaces had (get/put), just durable."""

    def __init__(self, engine: Engine) -> None:
        self._Session: sessionmaker[Session] = sessionmaker(bind=engine)

    def get(self, user_id: str) -> UserProfile | None:
        with self._Session() as session:
            record = session.get(ProfileRecord, user_id)
            if record is None:
                return None
            return UserProfile.model_validate_json(record.profile_json)

    def put(self, user_id: str, profile: UserProfile) -> UserProfile:
        payload = profile.model_dump_json()
        with self._Session() as session:
            record = session.get(ProfileRecord, user_id)
            if record is None:
                session.add(ProfileRecord(user_id=user_id, profile_json=payload))
            else:
                record.profile_json = payload
            session.commit()
        return profile


class RagChunkStore:
    """Optional durable backing for VectorStore — persists (text, embedding)
    pairs per user_id so a RAG index survives across requests/processes.
    Not wired into any endpoint by default (see rag.py: VectorStore only
    persists when constructed with a user_id)."""

    def __init__(self, engine: Engine) -> None:
        self._Session: sessionmaker[Session] = sessionmaker(bind=engine)

    def load(self, user_id: str) -> tuple[list[str], list[list[float]]]:
        with self._Session() as session:
            rows = session.scalars(
                select(RagChunkRecord)
                .where(RagChunkRecord.user_id == user_id)
                .order_by(RagChunkRecord.id)
            ).all()
        texts = [r.text for r in rows]
        vecs = [_decode_vector(r.vector) for r in rows]
        return texts, vecs

    def save(self, user_id: str, texts: list[str], vecs: list[list[float]]) -> None:
        with self._Session() as session:
            session.add_all(
                RagChunkRecord(user_id=user_id, text=t, vector=_encode_vector(v))
                for t, v in zip(texts, vecs, strict=True)
            )
            session.commit()


def _encode_vector(vec: list[float]) -> bytes:
    return struct.pack(f"<{len(vec)}d", *vec)


def _decode_vector(blob: bytes) -> list[float]:
    count = len(blob) // 8
    return list(struct.unpack(f"<{count}d", blob))


_engine: Engine | None = None
_profile_store: ProfileStore | None = None
_rag_chunk_store: RagChunkStore | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = make_engine(settings.database_url)
    return _engine


def get_profile_store() -> ProfileStore:
    global _profile_store
    if _profile_store is None:
        _profile_store = ProfileStore(get_engine())
    return _profile_store


def get_rag_chunk_store() -> RagChunkStore:
    global _rag_chunk_store
    if _rag_chunk_store is None:
        _rag_chunk_store = RagChunkStore(get_engine())
    return _rag_chunk_store
