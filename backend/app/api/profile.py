"""Profile CRUD. In-memory store for the skeleton; swap for Postgres in Phase 2."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.profile import UserProfile

router = APIRouter(prefix="/profile", tags=["profile"])

# Skeleton store keyed by user id. Replace with Postgres (RDS) in Phase 2.
_STORE: dict[str, UserProfile] = {}


@router.get("/{user_id}", response_model=UserProfile)
async def get_profile(user_id: str) -> UserProfile:
    profile = _STORE.get(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")
    return profile


@router.put("/{user_id}", response_model=UserProfile)
async def put_profile(user_id: str, profile: UserProfile) -> UserProfile:
    _STORE[user_id] = profile
    return profile
