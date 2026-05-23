"""AI chatbot — Gemini 2.0 Flash planning assistant.

Context-aware: the system prompt includes the current room state (step,
members, agreed dates, destination candidates, latest costs) so the assistant
can answer questions like:
  - 'Why is Bob's flight so expensive?'
  - 'Suggest a backup destination if Barcelona is too pricey'
  - 'What should we pack for Lanzarote in October?'
"""
from __future__ import annotations

import os
from typing import Optional

import google.generativeai as genai
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user

router = APIRouter()

# ── Schemas ──────────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: str   # "user" | "model"
    content: str


class ChatRequest(BaseModel):
    message: str
    room_slug: Optional[str] = None
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str


# ── Room context loader ───────────────────────────────────────────────────────


def _load_room_context(slug: str) -> str:
    """Return a human-readable room summary to inject into the system prompt."""
    try:
        db = get_client()
        room_res = db.table("rooms").select("*").eq("slug", slug).execute()
        if not room_res.data:
            return f"(Room '{slug}' not found — answering in general terms.)"
        room = room_res.data[0]

        members_res = (
            db.table("room_members")
            .select("home_postcode, profiles(display_name)")
            .eq("room_id", room["id"])
            .execute()
        )
        members = [
            f"{m.get('profiles', {}).get('display_name', 'Unknown')} ({m.get('home_postcode', 'postcode unknown')})"
            for m in members_res.data
        ]

        candidates_res = (
            db.table("destination_candidates")
            .select("iata_code, total_cost_gbp, cost_breakdown")
            .eq("room_id", room["id"])
            .execute()
        )
        candidates = [
            f"{c['iata_code']} — £{c['total_cost_gbp']:.0f}/person"
            if c.get("total_cost_gbp")
            else c["iata_code"]
            for c in candidates_res.data
        ]

        lines = [
            f"Room: {room['name']} (step: {room['current_step']})",
            f"Members: {', '.join(members) or 'none'}",
            f"Time window: {room.get('rough_window') or 'not set'}",
        ]
        if room.get("agreed_start"):
            lines.append(
                f"Agreed dates: {room['agreed_start']} → {room.get('agreed_end')}"
            )
        if room.get("budget_gbp"):
            lines.append(f"Budget cap: £{room['budget_gbp']:.0f}/person")
        if candidates:
            lines.append(f"Destination candidates: {', '.join(candidates)}")
        if room.get("destination_iata"):
            lines.append(f"Chosen destination: {room['destination_iata']}")

        return "\n".join(lines)
    except Exception as exc:
        return f"(Could not load room context: {exc})"


# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a friendly, practical group holiday planning assistant.
You help groups of friends organise holidays together — flights from different UK cities,
finding times when everyone is free, picking destinations, and estimating costs.

Be concise and friendly. Give specific, actionable answers. When mentioning costs,
use GBP (£). When uncertain, say so rather than guessing.

Current room context:
{context}
"""


# ── Gemini client ─────────────────────────────────────────────────────────────


def _get_gemini_model():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(503, "GEMINI_API_KEY not configured on this server.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        model_name="gemini-2.0-flash-exp",
        system_instruction=None,  # injected per-request via history
    )


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.post("", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    user: UserInfo = Depends(current_user),
):
    """Send a message to Gemini with optional room context."""
    model = _get_gemini_model()

    # Build context string
    if body.room_slug:
        context = _load_room_context(body.room_slug)
    else:
        context = "No specific room — answering in general terms."

    system_text = _SYSTEM_PROMPT.format(context=context)

    # Build history for Gemini (inject system prompt as first user/model exchange)
    history = [
        {"role": "user", "parts": [system_text]},
        {"role": "model", "parts": ["Understood! I'm ready to help with your group holiday planning."]},
    ]
    for msg in body.history:
        history.append({"role": msg.role, "parts": [msg.content]})

    chat_session = model.start_chat(history=history)

    try:
        response = chat_session.send_message(body.message)
        return ChatResponse(reply=response.text)
    except Exception as exc:
        raise HTTPException(502, f"Gemini API error: {exc}") from exc
