"""AI chatbot — Gemini-backed planning assistant.

Context-aware: the prompt includes the current room state (step, members,
agreed dates, destinations, costs) so the assistant can answer questions
like 'why is Bob's leg so expensive?' or 'suggest a backup destination'.
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    room_slug: Optional[str] = None
    history: list[dict] = []  # [{"role": "user"|"model", "content": "..."}]


class ChatResponse(BaseModel):
    reply: str


@router.post("", response_model=ChatResponse)
def chat(body: ChatRequest):
    """Send a message to Gemini with the room state as context."""
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(503, "GEMINI_API_KEY not configured")
    raise HTTPException(501, "Not implemented — needs Gemini wiring + room context loader")
