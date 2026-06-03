"""Feedback endpoint — stores star ratings + comments from users."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps.auth import UserInfo, current_user
from ..db.supabase import get_client

router = APIRouter()


class FeedbackIn(BaseModel):
    rating: Optional[int] = Field(default=None, ge=1, le=5)   # optional now
    comment: Optional[str] = None
    page: Optional[str] = None      # e.g. 'dashboard', 'flights'
    room_slug: Optional[str] = None


@router.post("", status_code=204)
def submit_feedback(
    body: FeedbackIn,
    user: UserInfo = Depends(current_user),
):
    """Store a piece of user feedback. Returns 204 No Content.

    Either a star rating or a comment (or both) is required — but a rating is
    no longer mandatory, so text-only feedback is accepted.
    """
    if body.rating is None and not (body.comment or "").strip():
        raise HTTPException(422, "Please include a comment or a rating.")
    db = get_client()
    db.table("feedback").insert({
        "user_id": user.id,
        "rating": body.rating,
        "comment": (body.comment or "").strip() or None,
        "page": body.page or None,
        "room_slug": body.room_slug or None,
    }).execute()
    return None
