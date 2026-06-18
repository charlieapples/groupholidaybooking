"""Feedback endpoint — stores ratings + comments, with a triage scaffold.

Triage pipeline (AI not wired yet — `classify_feedback` is a rule-based stub):
each piece of feedback is auto-categorised on submit so the app owner can sort
bugs from feature requests from praise. The owner views everything via the
admin endpoints below. Swap the stub for Claude/Gemini later — same interface.
"""
from __future__ import annotations

import os
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


# ── Triage (rule-based stub — swap for AI later) ──────────────────────────────

_BUG_KW = ["bug", "error", "broken", "doesn't work", "does not work", "doesnt work",
           "crash", "fail", "wrong", "glitch", "can't", "cannot", "404", "not found",
           "stuck", "freeze", "froze", "isn't working", "not working"]
_FEATURE_KW = ["could you", "please add", "it would be", "i wish", "feature", "would like",
               "suggestion", "suggest", "prefer", "instead", "can you make", "add a", "allow"]
_PRAISE_KW = ["love", "great", "awesome", "amazing", "thank", "nice", "good job", "brilliant", "perfect"]


def classify_feedback(comment: Optional[str], rating: Optional[int]) -> str:
    """Best-effort category: 'bug' | 'feature_request' | 'praise' | 'other'.

    PLACEHOLDER — deliberately simple keyword rules. Replace the body with a
    Claude/Gemini call when ready; callers only depend on the return value.
    """
    text = (comment or "").lower()
    if any(k in text for k in _BUG_KW):
        return "bug"
    if rating is not None and rating <= 2:
        return "bug"
    if any(k in text for k in _FEATURE_KW):
        return "feature_request"
    if any(k in text for k in _PRAISE_KW):
        return "praise"
    if rating is not None and rating >= 4:
        return "praise"
    return "other"


def _is_owner(user: UserInfo) -> bool:
    """True if this user is an app owner (can see all feedback).

    Configure ADMIN_EMAILS (comma-separated) in the API env. Defaults to the
    project owner so it works out of the box.
    """
    allow = os.getenv("ADMIN_EMAILS", "appleyardcharles@gmail.com")
    allowed = {e.strip().lower() for e in allow.split(",") if e.strip()}
    return bool(user.email and user.email.lower() in allowed)


@router.post("", status_code=204)
def submit_feedback(body: FeedbackIn, user: UserInfo = Depends(current_user)):
    """Store a piece of user feedback (rating and/or comment) + auto-triage it."""
    if body.rating is None and not (body.comment or "").strip():
        raise HTTPException(422, "Please include a comment or a rating.")
    db = get_client()
    db.table("feedback").insert({
        "user_id": user.id,
        "rating": body.rating,
        "comment": (body.comment or "").strip() or None,
        "page": body.page or None,
        "room_slug": body.room_slug or None,
        "triage_category": classify_feedback(body.comment, body.rating),
        "triage_status": "new",
    }).execute()
    return None


# ── Owner-only triage views ───────────────────────────────────────────────────


class FeedbackItem(BaseModel):
    id: str
    rating: Optional[int] = None
    comment: Optional[str] = None
    page: Optional[str] = None
    room_slug: Optional[str] = None
    created_at: Optional[str] = None
    triage_category: Optional[str] = None
    triage_status: str = "new"
    user_email: Optional[str] = None


@router.get("/all", response_model=list[FeedbackItem])
def list_all_feedback(user: UserInfo = Depends(current_user)):
    """App owner only: every piece of feedback, newest first, with category."""
    if not _is_owner(user):
        raise HTTPException(403, "Owner only.")
    db = get_client()
    res = (
        db.table("feedback")
        .select("id, user_id, rating, comment, page, room_slug, created_at, triage_category, triage_status")
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    rows = res.data or []
    # feedback.user_id → auth.users (NOT profiles), so look emails up separately.
    user_ids = list({r["user_id"] for r in rows if r.get("user_id")})
    email_by_id: dict[str, str] = {}
    if user_ids:
        try:
            profs = db.table("profiles").select("id, email").in_("id", user_ids).execute()
            email_by_id = {p["id"]: p.get("email") for p in (profs.data or [])}
        except Exception:
            pass
    out: list[FeedbackItem] = []
    for r in rows:
        out.append(FeedbackItem(
            id=str(r["id"]),
            rating=r.get("rating"),
            comment=r.get("comment"),
            page=r.get("page"),
            room_slug=r.get("room_slug"),
            created_at=str(r.get("created_at") or ""),
            triage_category=r.get("triage_category"),
            triage_status=r.get("triage_status") or "new",
            user_email=email_by_id.get(r.get("user_id")),
        ))
    return out


class TriageUpdate(BaseModel):
    triage_status: Optional[str] = None       # new | in_progress | resolved | wontfix
    triage_category: Optional[str] = None
    triage_notes: Optional[str] = None


@router.patch("/{feedback_id}", status_code=204)
def update_triage(feedback_id: str, body: TriageUpdate, user: UserInfo = Depends(current_user)):
    """App owner only: update a feedback item's triage status/category/notes."""
    if not _is_owner(user):
        raise HTTPException(403, "Owner only.")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return None
    db = get_client()
    db.table("feedback").update(updates).eq("id", feedback_id).execute()
    return None
