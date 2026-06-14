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
import time
from collections import defaultdict, deque
from typing import Optional

from google import genai
from google.genai import types as genai_types
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.supabase import get_client
from ..core.ai import GEMINI_MODEL
from ..deps.auth import UserInfo, current_user

router = APIRouter()

# ── Rate limiting ────────────────────────────────────────────────────────────
# Simple in-memory per-user sliding-window limit. Resets on process restart,
# which is fine for a single-instance Railway service. If we scale horizontally
# we'd move this to Redis or Supabase.

_RATE_LIMIT_WINDOW_SEC = 3600  # 1 hour
_RATE_LIMIT_MAX_REQUESTS = 40  # per user per window
_user_request_log: dict[str, deque[float]] = defaultdict(deque)


def _check_rate_limit(user_id: str) -> None:
    """Raise HTTPException 429 if the user has exceeded their hourly quota."""
    now = time.time()
    window_start = now - _RATE_LIMIT_WINDOW_SEC
    log = _user_request_log[user_id]
    # Drop stale entries from the left of the deque
    while log and log[0] < window_start:
        log.popleft()
    if len(log) >= _RATE_LIMIT_MAX_REQUESTS:
        retry_in = int(log[0] + _RATE_LIMIT_WINDOW_SEC - now)
        raise HTTPException(
            429,
            f"Chat rate limit reached ({_RATE_LIMIT_MAX_REQUESTS}/hour). "
            f"Try again in {max(retry_in, 1)} seconds.",
        )
    log.append(now)

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
            f"Members ({len(members)}): {', '.join(members) or 'none'}",
            f"Target window: {room.get('rough_window') or 'not set'}",
        ]
        if room.get("agreed_start"):
            lines.append(f"Agreed dates: {room['agreed_start']} to {room.get('agreed_end')}")
        if room.get("min_nights"):
            lines.append(f"Trip length: {room['min_nights']}–{room.get('max_nights')} nights")
        if room.get("budget_gbp"):
            lines.append(f"Budget cap: £{room['budget_gbp']:.0f}/person")
        if candidates:
            lines.append(f"Destination candidates: {', '.join(candidates)}")
        if room.get("destination_iata"):
            lines.append(f"Chosen destination: {room['destination_iata']}")

        # Include latest flight results if available
        try:
            flight_res = (
                db.table("flight_results")
                .select("destination_iata, shared_out_date, shared_return_date, total_group_cost_gbp, per_person_results")
                .eq("room_id", room["id"])
                .order("total_group_cost_gbp")
                .limit(5)
                .execute()
            )
            if flight_res.data:
                import json as _json
                def _parse_field(v):
                    if v is None: return []
                    if isinstance(v, (list, dict)): return v if isinstance(v, list) else [v]
                    return _json.loads(v)
                flight_lines = []
                for fr in flight_res.data:
                    people_data = _parse_field(fr.get("per_person_results"))
                    viable = [p for p in people_data if p.get("viable")]
                    people_str = "; ".join(
                        f"{p['person_name']} £{p.get('total_money_gbp', 0):.0f} from {p.get('chosen_airport', '?')}"
                        f"{' ('+str(round(p.get('ground_hours',0),1))+'h ground)' if p.get('ground_hours', 0) > 0.5 else ''}"
                        for p in viable
                    )
                    flight_lines.append(
                        f"  {fr['destination_iata']} ({fr.get('shared_out_date','')} → {fr.get('shared_return_date','')}):"
                        f" group total £{fr.get('total_group_cost_gbp', 0):.0f} — {people_str}"
                    )
                lines.append("Latest flight results:\n" + "\n".join(flight_lines))
        except Exception:
            pass

        # Include availability submission status if in that step
        if room.get("current_step") == "availability":
            try:
                members_res2 = (
                    db.table("room_members")
                    .select("user_id", count="exact")
                    .eq("room_id", room["id"])
                    .execute()
                )
                submitted_res = (
                    db.table("availability_submissions")
                    .select("user_id", count="exact")
                    .eq("room_id", room["id"])
                    .execute()
                )
                total = members_res2.count or 0
                submitted = submitted_res.count or 0
                lines.append(f"Availability: {submitted}/{total} members submitted")
            except Exception:
                pass

        return "\n".join(lines)
    except Exception as exc:
        return f"(Could not load room context: {exc})"


# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are the friendly in-app assistant for "Group Holiday Booking",
a website that helps groups of friends plan a holiday together. You do two jobs:

1. HELP PEOPLE USE THE WEBSITE — explain how it works, what each step does, and what
   to click next. Be a patient guide for non-technical users.
2. HELP WITH THE ACTUAL HOLIDAY — flights from different UK cities, finding dates
   everyone is free, picking destinations, and rough costs.

Be concise and friendly. Give specific, actionable answers and, when relevant, tell
them exactly which button or page to use. When mentioning costs use GBP (£). If you
don't know something or it depends on their data, say so rather than guessing.

NAVIGATION — you can actually move the user between pages. When the user asks to go
to / open / "take me to" a step, end your reply with a directive on its own line:
[[NAV:<step>]] where <step> is one of: availability, duration, budget, destination,
flights, booking, dashboard. The app strips this token and changes the page, so add
one short friendly sentence before it (e.g. "Sure, taking you to Duration now!").
Only include the token when the user actually wants to navigate.

── HOW THE WEBSITE WORKS (use this to answer "how do I…" questions) ──
The plan moves through six steps, shown as a bar at the top of the room page. One
person is the admin (they created the room) and they advance the group to the next
step once everyone's input is in. Anyone can revisit earlier steps by clicking them.

1. Availability — each member marks the dates they're free. It's a "blind reveal":
   nobody sees the overlap until everyone has submitted, so people aren't influenced.
   The group then agrees the actual travel dates.
2. Duration — everyone says how many nights they'd like; the group agrees a range.
3. Budget — everyone gives a rough per-person budget; the group agrees a cap. There's
   also a "value of travel time" box (£/hour) so longer journeys can be costed fairly.
4. Destination — this is the big one (see voting below).
5. Flights — the app searches real flights from each person's nearest airport to the
   chosen destination(s) and shows per-person costs and any ground travel.
6. Booking — everyone books their own flights; accommodation is coordinated together.

── DESTINATION VOTING (two "fairness" modes; the admin picks one) ──
• Ranked (the default, fairest for groups): each person puts forward ONE destination
  (their own idea, or one of the AI suggestions). Then everyone ranks the whole list
  from 1st to last. The winner is the destination with the LOWEST total score (a Borda
  count — like golf, lowest wins). Scores stay hidden until everyone has ranked.
• Open: get AI suggestions and react 👍 / 😐 / 👎 to each. Quicker, but a big group
  can end up with a very long list.
Both modes use a blind reveal so early votes don't sway anyone.

Other things people can do: the questionnaire (climate, setting, must-haves, etc.)
feeds the AI suggestions; "Get AI ideas" gives personalised suggestions; each card
shows rough flight and daily-living cost estimates; there's an invite link to add
friends; and a Feedback button (bottom-left) to send the makers a message.

Current room context:
{context}
"""


# ── Gemini client ─────────────────────────────────────────────────────────────


def _get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(503, "GEMINI_API_KEY not configured on this server.")
    return genai.Client(api_key=api_key)


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.post("", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    user: UserInfo = Depends(current_user),
):
    """Send a message to Gemini with optional room context."""
    _check_rate_limit(user.id)
    client = _get_gemini_client()

    # Build context string
    if body.room_slug:
        context = _load_room_context(body.room_slug)
    else:
        context = "No specific room — answering in general terms."

    system_text = _SYSTEM_PROMPT.format(context=context)

    # Build conversation history
    contents = [
        genai_types.Content(role="user", parts=[genai_types.Part(text=system_text)]),
        genai_types.Content(role="model", parts=[genai_types.Part(text="Understood! I'm ready to help with your group holiday planning.")]),
    ]
    for msg in body.history:
        contents.append(genai_types.Content(
            role=msg.role,
            parts=[genai_types.Part(text=msg.content)],
        ))
    contents.append(genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=body.message)],
    ))

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
        )
        return ChatResponse(reply=response.text)
    except Exception as exc:
        raise HTTPException(502, f"Gemini API error: {exc}") from exc
