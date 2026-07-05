"""Persistence tests for app/services/db.py — a tmp file (not :memory:) so
these specifically exercise the durable-across-instances path that the
profile API's SQLite swap depends on."""
from __future__ import annotations

import pytest

from app.models.profile import UserProfile
from app.services.db import ProfileStore, RagChunkStore, make_engine
from app.services.fakes import FakeEmbeddings
from app.services.rag import VectorStore


@pytest.fixture
def db_url(tmp_path):
    return f"sqlite:///{tmp_path}/test.db"


def _engine(db_url):
    """A fresh engine against `db_url`, disposed at test teardown."""
    eng = make_engine(db_url)
    yield eng
    eng.dispose()


engine = pytest.fixture(_engine)


def test_profile_store_persists_across_instances(db_url, engine) -> None:
    profile = UserProfile(**{"personal": {"firstName": "Ada", "lastName": "Lovelace"}})
    ProfileStore(engine).put("u1", profile)

    # A fresh engine/store against the same file simulates a process restart.
    other_engine = make_engine(db_url)
    try:
        reloaded = ProfileStore(other_engine).get("u1")
    finally:
        other_engine.dispose()
    assert reloaded is not None
    assert reloaded.personal.firstName == "Ada"
    assert reloaded.personal.lastName == "Lovelace"


def test_profile_store_missing_user_returns_none(engine) -> None:
    assert ProfileStore(engine).get("does-not-exist") is None


def test_profile_store_put_overwrites(engine) -> None:
    store = ProfileStore(engine)
    store.put("u1", UserProfile(**{"personal": {"firstName": "Ada"}}))
    store.put("u1", UserProfile(**{"personal": {"firstName": "Grace"}}))
    assert store.get("u1").personal.firstName == "Grace"


def test_rag_chunk_store_round_trips_vectors(engine) -> None:
    store = RagChunkStore(engine)
    store.save("u1", ["chunk one", "chunk two"], [[0.1, 0.2, 0.3], [-1.5, 0.0, 2.25]])

    texts, vecs = store.load("u1")
    assert texts == ["chunk one", "chunk two"]
    assert vecs == [[0.1, 0.2, 0.3], [-1.5, 0.0, 2.25]]


def test_rag_chunk_store_scoped_by_user(engine) -> None:
    store = RagChunkStore(engine)
    store.save("u1", ["mine"], [[1.0]])
    store.save("u2", ["theirs"], [[2.0]])

    texts, _ = store.load("u1")
    assert texts == ["mine"]


# ---- VectorStore's opt-in persistence (via the app-wide db singleton) ----- #


def test_vector_store_without_user_id_is_purely_in_memory() -> None:
    """Default behavior (every existing call site) must stay unaffected: no
    user_id means no persistence, matching pre-T4 behavior exactly."""
    store = VectorStore(embeddings=FakeEmbeddings())
    store.add(["a chunk"])
    # A second, unrelated store must not see anything — nothing was persisted.
    other = VectorStore(embeddings=FakeEmbeddings())
    assert len(other) == 0


def test_vector_store_with_user_id_persists_and_reloads() -> None:
    store = VectorStore(embeddings=FakeEmbeddings(), user_id="vs-persist-test")
    store.add(["persisted chunk one", "persisted chunk two"])
    assert len(store) == 2

    reloaded = VectorStore(embeddings=FakeEmbeddings(), user_id="vs-persist-test")
    assert len(reloaded) == 2
    results = reloaded.retrieve("persisted chunk one", k=1)
    assert results[0][0] == "persisted chunk one"
