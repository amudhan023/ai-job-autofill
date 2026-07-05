"""Session-wide test env. Runs before any test module import (pytest loads
conftest.py first), so an in-memory DB is in place before app.core.config's
settings singleton or app.services.db's engine singleton are ever created —
tests never write a database file to disk."""
import os

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")


@pytest.fixture(scope="session", autouse=True)
def _dispose_db_engine_at_session_end():
    yield
    from app.services import db

    if db._engine is not None:
        db._engine.dispose()
