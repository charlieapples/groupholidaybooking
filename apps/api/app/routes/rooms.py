"""Holiday room CRUD and membership.

A 'room' is a shared planning session. Anyone with the room slug can join.
The creator becomes admin. Members submit availability, preferences, and votes.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()


class CreateRoomRequest(BaseModel):
    name: str
    rough_window: Optional[str] = None  # e.g. "September 2026"


class RoomResponse(BaseModel):
    slug: str
    name: str
    current_step: str
    rough_window: Optional[str] = None
    member_count: int = 0


# ── Endpoints (stubs — Supabase wiring lands once SUPABASE_URL is configured) ──


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
def create_room(body: CreateRoomRequest):
    """Create a new holiday planning room. Returns a shareable slug."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")


@router.get("/{slug}", response_model=RoomResponse)
def get_room(slug: str):
    """Fetch room state. Members only."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")


@router.post("/{slug}/join", response_model=RoomResponse)
def join_room(slug: str):
    """Add the authenticated user to the room."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")


@router.get("/{slug}/members")
def list_members(slug: str):
    """List room members and their home postcodes."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")
