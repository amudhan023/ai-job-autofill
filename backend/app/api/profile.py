"""Profile CRUD, backed by SQLite (or Postgres via DATABASE_URL) — app/services/db.py."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.profile import UserProfile
from app.services.db import get_profile_store

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/{user_id}", response_model=UserProfile)
async def get_profile(user_id: str) -> UserProfile:
    profile = get_profile_store().get(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")
    return profile


@router.put("/{user_id}", response_model=UserProfile)
async def put_profile(user_id: str, profile: UserProfile) -> UserProfile:
    return get_profile_store().put(user_id, profile)
