"""SQLAlchemy-backed persistence: profile store (default, zero-infra SQLite)
and RAG chunk persistence for `VectorStore` (app/services/rag.py) plus the
persisted knowledge-base corpus (app/services/rag.py: search_persisted /
replace_documents).

Postgres/pgvector is opt-in via `DATABASE_URL` (postgresql+psycopg://...):
`RagChunkRecord.vector` becomes a real `vector` column and similarity search
runs as a SQL query using pgvector's `<=>` cosine-distance operator. On
SQLite (the zero-infra default, and what tests use) the same column stores a
packed-float blob and search falls back to a Python cosine loop.
"""

from __future__ import annotations

import struct
from pathlib import Path

from sqlalchemy import Engine, LargeBinary, String, Text, create_engine, delete, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator

from app.core.config import settings
from app.models.profile import UserProfile


class PortableVector(TypeDecorator):
    """`vector(embedding_dim)` on Postgres; a packed-float blob on SQLite.

    Lets the same `RagChunkRecord.vector` column support real pgvector SQL
    search in production while tests keep running against SQLite without
    the `pgvector` package installed.
    """

    impl = LargeBinary
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector  # lazy: only needed for real Postgres

            return dialect.type_descriptor(Vector(settings.embedding_dim))
        return dialect.type_descriptor(LargeBinary())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return _encode_vector(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return [float(x) for x in value]
        return _decode_vector(value)


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
    vector: Mapped[list[float]] = mapped_column(PortableVector, nullable=False)


def make_engine(database_url: str) -> Engine:
    """Build (and migrate) an engine for `database_url`. For a file-based
    SQLite URL, ensures the parent directory exists first; for the in-memory
    SQLite URL (tests), uses a StaticPool so every session shares the same
    connection — plain pooling hands out a fresh, empty `:memory:` database
    per connection, which would silently drop everything between sessions."""
    is_sqlite = database_url.startswith("sqlite")
    is_sqlite_memory = database_url in ("sqlite:///:memory:", "sqlite://")
    is_postgres = database_url.startswith("postgresql")

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
    if is_postgres:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
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
    """Durable backing for RAG chunks — persists (text, embedding) pairs per
    user_id. Backs both the ephemeral-per-request VectorStore (rag.py) when
    constructed with a user_id, and the persisted knowledge-base corpus fed
    via search_persisted/replace_documents."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        self._Session: sessionmaker[Session] = sessionmaker(bind=engine)

    def load(self, user_id: str) -> tuple[list[str], list[list[float]]]:
        with self._Session() as session:
            rows = session.scalars(
                select(RagChunkRecord)
                .where(RagChunkRecord.user_id == user_id)
                .order_by(RagChunkRecord.id)
            ).all()
        return [r.text for r in rows], [r.vector for r in rows]

    def save(self, user_id: str, texts: list[str], vecs: list[list[float]]) -> None:
        with self._Session() as session:
            session.add_all(
                RagChunkRecord(user_id=user_id, text=t, vector=v)
                for t, v in zip(texts, vecs, strict=True)
            )
            session.commit()

    def replace(self, user_id: str, texts: list[str], vecs: list[list[float]]) -> None:
        """Delete-then-insert the full corpus for user_id (the options-page
        'paste and save whole corpus' UX, not incremental add)."""
        with self._Session() as session:
            session.execute(delete(RagChunkRecord).where(RagChunkRecord.user_id == user_id))
            session.add_all(
                RagChunkRecord(user_id=user_id, text=t, vector=v)
                for t, v in zip(texts, vecs, strict=True)
            )
            session.commit()

    def search(self, user_id: str, query_vec: list[float], k: int = 3) -> list[tuple[str, float]]:
        if self._engine.dialect.name == "postgresql":
            vec_literal = "[" + ",".join(repr(x) for x in query_vec) + "]"
            with self._Session() as session:
                rows = session.execute(
                    text(
                        "SELECT text, vector <=> CAST(:qvec AS vector) AS distance "
                        "FROM rag_chunks WHERE user_id = :user_id "
                        "ORDER BY distance ASC LIMIT :k"
                    ),
                    {"qvec": vec_literal, "user_id": user_id, "k": k},
                ).all()
            return [(row.text, 1 - row.distance) for row in rows]

        # SQLite fallback: no server-side ANN operator, so score in Python.
        from app.services.rag import cosine  # local import avoids a module cycle

        texts, vecs = self.load(user_id)
        if not texts:
            return []
        scored = [(t, cosine(query_vec, v)) for t, v in zip(texts, vecs, strict=True)]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]


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
