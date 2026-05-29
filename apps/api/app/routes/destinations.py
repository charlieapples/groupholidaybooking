"""Step 4: destination picking.

Three modes (UI lets the admin choose):
1. Questionnaire → algorithm proposes → group votes
2. Manual propose → group votes
3. Random pick ('surprise us')

All modes feed into the same destination_candidates + destination_votes tables.
"""
from __future__ import annotations

import json as _json
import logging
import os
import random
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.destinations import DEST_NAMES, POPULAR_LABELS, label as label_dest, score_destination
from ..core.ai import GEMINI_MODEL
from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user
from .rooms import _assert_member, _get_room_by_slug

router = APIRouter()
log = logging.getLogger("destinations")


def _gemini_suggestions(
    prefs_list: list[dict],
    room: dict,
    top_n: int,
) -> Optional[list[str]]:
    """Ask Gemini to pick the best `top_n` IATA codes for the group.

    Returns a list of IATA codes (subset of DEST_NAMES) or None if Gemini
    isn't available or returned something unusable. Callers should fall back
    to the rule-based scorer.
    """
    if not os.getenv("GEMINI_API_KEY"):
        return None

    try:
        # Imported lazily so the destinations route still works if the SDK
        # isn't installed in a test environment.
        from google import genai
        from google.genai import types as genai_types

        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    except Exception as exc:
        log.warning("Could not create Gemini client: %s", exc)
        return None

    # Build a compact prompt with the group's preferences + the candidate pool.
    catalogue = "\n".join(f"  {iata}  {name}" for iata, name in DEST_NAMES.items())
    prefs_summary = _json.dumps(prefs_list, ensure_ascii=False, indent=2)
    trip_summary = []
    if room.get("agreed_start") and room.get("agreed_end"):
        trip_summary.append(f"Dates: {room['agreed_start']} to {room['agreed_end']}")
    if room.get("min_nights"):
        trip_summary.append(
            f"Length: {room['min_nights']}-{room.get('max_nights', room['min_nights'])} nights"
        )
    if room.get("budget_gbp"):
        trip_summary.append(f"Per-person budget cap: £{room['budget_gbp']:.0f} (incl. flights)")

    # Build hard climate constraints from preferences
    climate_votes: dict[str, int] = {}
    for p in prefs_list:
        c = (p.get("climate") or "").lower()
        if c:
            climate_votes[c] = climate_votes.get(c, 0) + 1
    dominant_climate = max(climate_votes, key=climate_votes.get) if climate_votes else None

    climate_rule = ""
    if dominant_climate in ("cool", "cold", "cool/cold"):
        climate_rule = (
            "\n\nCLIMATE HARD CONSTRAINT (CRITICAL — do not violate):\n"
            "The majority of the group wants COOL or COLD weather. "
            "You MUST NOT suggest warm Mediterranean beach/summer destinations "
            "such as Lisbon, Madrid, Barcelona, Malaga, Alicante, Palma, Ibiza, "
            "Tenerife, Athens, Dubrovnik, Rome, Naples, Marrakech, Dubai, or anywhere "
            "with average summer temperatures above 22°C. "
            "Focus on Northern/Central Europe: Iceland, Scandinavia, Scotland, Ireland, "
            "Faroe Islands, Swiss Alps, Austrian Alps, Iceland, Northern Norway, "
            "Canada, Patagonia, New Zealand winter, etc."
        )
    elif dominant_climate in ("warm", "warm & sunny", "warm_sunny", "hot"):
        climate_rule = (
            "\n\nCLIMATE HARD CONSTRAINT (CRITICAL — do not violate):\n"
            "The majority of the group wants WARM or SUNNY weather. "
            "You MUST NOT suggest Northern European destinations likely to be cold "
            "or rainy (e.g. Iceland, Norway, Scotland, Ireland, Denmark) "
            "unless they happen to have a warm microclimate in the relevant season. "
            "Focus on Mediterranean, Canary Islands, Caribbean, Southeast Asia, "
            "Middle East, or other reliably warm destinations."
        )

    # Collect free text notes from members
    free_texts = [p.get("free_text") for p in prefs_list if p.get("free_text")]
    free_text_section = ""
    if free_texts:
        free_text_section = "\n\nAdditional notes from group members (read carefully):\n" + "\n".join(
            f"  - {t}" for t in free_texts
        )

    prompt = (
        "You're an expert travel planner picking destinations for a group of UK-based "
        "friends. Pick the BEST destinations from the catalogue below that genuinely "
        "match the group's combined preferences.\n\n"
        f"Group preferences (one entry per member):\n{prefs_summary}\n\n"
        f"Trip details:\n" + ("\n".join(trip_summary) or "(no extra constraints)") + "\n\n"
        + climate_rule
        + free_text_section
        + f"\n\nDestination catalogue (IATA code  city):\n{catalogue}\n\n"
        f"Pick the {top_n} destinations that BEST match the group's vibe. Rules:\n"
        "1. Obey the CLIMATE HARD CONSTRAINT above — this is mandatory.\n"
        "2. Respect 'avoid' tags strongly — if someone says 'no beach', don't suggest Mykonos.\n"
        "3. Give diverse picks (don't suggest 5 Spanish cities if the group wants mixed).\n"
        "4. Free-text notes from members take priority over button selections.\n"
        "5. Prefer destinations reachable within the group's budget (lower cost = better if budgets are tight).\n\n"
        "Respond with ONLY a JSON array of IATA codes from the catalogue, in "
        "rank order (best first). No prose, no markdown. Example: "
        '["PRG","BER","CPH","VIE","EDI"]'
    )

    try:
        resp = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                genai_types.Content(role="user", parts=[genai_types.Part(text=prompt)]),
            ],
        )
        text = (resp.text or "").strip()
    except Exception as exc:
        log.warning("Gemini suggestion call failed: %s", exc)
        return None

    # Extract the JSON array — model sometimes wraps in ```json``` despite instructions.
    match = re.search(r"\[[^\]]*\]", text)
    if not match:
        log.warning("Gemini response had no JSON array: %s", text[:200])
        return None
    try:
        codes_raw = _json.loads(match.group(0))
    except Exception as exc:
        log.warning("Failed to parse Gemini JSON: %s | %s", exc, text[:200])
        return None
    if not isinstance(codes_raw, list):
        return None

    # Keep only codes that are actually in our catalogue, preserve order, dedupe.
    seen: set[str] = set()
    out: list[str] = []
    for c in codes_raw:
        if not isinstance(c, str):
            continue
        code = c.strip().upper()
        if code in DEST_NAMES and code not in seen:
            seen.add(code)
            out.append(code)
        if len(out) >= top_n:
            break
    return out or None


# ── Schemas ──────────────────────────────────────────────────────────────────


class DurationBudgetPreferences(BaseModel):
    """Step 2 + 3: each member's preferred trip duration and budget."""
    min_nights: Optional[int] = None
    max_nights: Optional[int] = None
    budget_gbp: Optional[float] = None


class DestinationPreferences(BaseModel):
    """Answers to the per-user destination questionnaire."""
    climate: Optional[str] = None          # 'warm' | 'cold' | 'temperate'
    setting: Optional[str] = None          # 'beach' | 'city' | 'mountains' | 'mixed'
    activity_level: Optional[str] = None   # 'relaxed' | 'active' | 'mixed'
    must_have: list[str] = []              # e.g. ['nightlife', 'culture']
    avoid: list[str] = []                  # e.g. ['long flights']
    max_total_per_person_gbp: Optional[float] = None
    free_text: Optional[str] = None        # plain-text open preference from the user


class DestinationCandidate(BaseModel):
    id: str
    iata_code: str
    name: str
    proposed_by: Optional[str] = None      # None = algorithm, else user display name
    total_cost_gbp: Optional[float] = None
    cost_breakdown: dict = {}
    vote_count: int = 0
    my_vote: int = 0                        # caller's current vote value


# ── Helpers ───────────────────────────────────────────────────────────────────


def _candidate_to_dto(c: dict, my_user_id: str, votes: list[dict]) -> DestinationCandidate:
    vote_count = sum(v["vote_value"] for v in votes if v["candidate_id"] == c["id"])
    my_vote = next(
        (v["vote_value"] for v in votes if v["candidate_id"] == c["id"] and v["user_id"] == my_user_id),
        0,
    )
    return DestinationCandidate(
        id=c["id"],
        iata_code=c["iata_code"],
        name=label_dest(c["iata_code"], "name"),
        proposed_by=c.get("proposed_by"),
        total_cost_gbp=c.get("total_cost_gbp"),
        cost_breakdown=c.get("cost_breakdown") or {},
        vote_count=vote_count,
        my_vote=my_vote,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/duration-budget")
def submit_duration_budget(
    slug: str,
    body: DurationBudgetPreferences,
    user: UserInfo = Depends(current_user),
):
    """Step 2 + 3: Save this member's preferred duration and budget.

    Also returns aggregated stats across all members so the UI can show
    the group median min/max nights and average budget.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    update: dict = {}
    if body.min_nights is not None:
        update["pref_min_nights"] = body.min_nights
    if body.max_nights is not None:
        update["pref_max_nights"] = body.max_nights
    if body.budget_gbp is not None:
        update["pref_budget_gbp"] = body.budget_gbp

    if update:
        update["room_id"] = room["id"]
        update["user_id"] = user.id
        db.table("trip_preferences").upsert(update, on_conflict="room_id,user_id").execute()

    # Aggregate across members
    all_prefs = (
        db.table("trip_preferences")
        .select("pref_min_nights, pref_max_nights, pref_budget_gbp")
        .eq("room_id", room["id"])
        .execute()
    )
    min_nights_vals = [r["pref_min_nights"] for r in all_prefs.data if r.get("pref_min_nights")]
    max_nights_vals = [r["pref_max_nights"] for r in all_prefs.data if r.get("pref_max_nights")]
    budget_vals = [r["pref_budget_gbp"] for r in all_prefs.data if r.get("pref_budget_gbp")]

    return {
        "ok": True,
        "aggregate": {
            "median_min_nights": sorted(min_nights_vals)[len(min_nights_vals) // 2] if min_nights_vals else None,
            "median_max_nights": sorted(max_nights_vals)[len(max_nights_vals) // 2] if max_nights_vals else None,
            "avg_budget_gbp": round(sum(budget_vals) / len(budget_vals), 0) if budget_vals else None,
            "min_budget_gbp": min(budget_vals) if budget_vals else None,
            "responses": len(all_prefs.data),
        },
    }


@router.get("/duration-budget")
def get_duration_budget(slug: str, user: UserInfo = Depends(current_user)):
    """Return all members' duration + budget preferences for this room."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    prefs = (
        db.table("trip_preferences")
        .select("user_id, pref_min_nights, pref_max_nights, pref_budget_gbp, profiles(display_name)")
        .eq("room_id", room["id"])
        .execute()
    )

    members_count = (
        db.table("room_members")
        .select("*", count="exact")
        .eq("room_id", room["id"])
        .execute()
    ).count or 0

    rows = []
    for r in prefs.data:
        if r.get("pref_min_nights") or r.get("pref_max_nights") or r.get("pref_budget_gbp"):
            rows.append({
                "user_id": r["user_id"],
                "display_name": (r.get("profiles") or {}).get("display_name"),
                "min_nights": r.get("pref_min_nights"),
                "max_nights": r.get("pref_max_nights"),
                "budget_gbp": r.get("pref_budget_gbp"),
            })

    return {"members_total": members_count, "responses": rows}


@router.get("/preferences", response_model=DestinationPreferences)
def get_my_preferences(slug: str, user: UserInfo = Depends(current_user)):
    """Return the calling user's saved destination questionnaire answers.

    Used to pre-fill the questionnaire when the user revisits the page.
    Returns an empty DestinationPreferences object if nothing's been saved.
    """
    import json as _json

    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    res = (
        db.table("trip_preferences")
        .select("pref_destination_answers, pref_budget_gbp")
        .eq("room_id", room["id"])
        .eq("user_id", user.id)
        .execute()
    )
    if not res.data:
        return DestinationPreferences()

    row = res.data[0]
    raw = row.get("pref_destination_answers")
    if isinstance(raw, str):
        try:
            raw = _json.loads(raw)
        except Exception:
            raw = {}
    raw = raw or {}

    return DestinationPreferences(
        climate=raw.get("climate"),
        setting=raw.get("setting"),
        activity_level=raw.get("activity_level"),
        must_have=raw.get("must_have") or [],
        avoid=raw.get("avoid") or [],
        free_text=raw.get("free_text"),
        max_total_per_person_gbp=row.get("pref_budget_gbp"),
    )


@router.post("/preferences")
def submit_preferences(
    slug: str,
    body: DestinationPreferences,
    user: UserInfo = Depends(current_user),
):
    """Save one user's destination questionnaire answers."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    import json as _json

    db.table("trip_preferences").upsert(
        {
            "room_id": room["id"],
            "user_id": user.id,
            "pref_budget_gbp": body.max_total_per_person_gbp,
            # Store full questionnaire answers in the JSONB column
            "pref_destination_answers": _json.dumps({
                "climate": body.climate,
                "setting": body.setting,
                "activity_level": body.activity_level,
                "must_have": body.must_have,
                "avoid": body.avoid,
                "free_text": body.free_text,
            }),
        },
        on_conflict="room_id,user_id",
    ).execute()

    return {"ok": True}


@router.get("", response_model=list[DestinationCandidate])
def list_candidates(slug: str, user: UserInfo = Depends(current_user)):
    """List all destination candidates for the room with vote counts."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    candidates_res = (
        db.table("destination_candidates")
        .select("*")
        .eq("room_id", room["id"])
        .execute()
    )
    # Skip the votes query entirely when there are no candidates — calling
    # .in_("candidate_id", ["none"]) sends a non-UUID value to Supabase
    # which errors out and breaks the whole page on a fresh Holiday.
    candidate_ids = [c["id"] for c in candidates_res.data]
    votes_data: list[dict] = []
    if candidate_ids:
        votes_res = (
            db.table("destination_votes")
            .select("candidate_id, user_id, vote_value")
            .in_("candidate_id", candidate_ids)
            .execute()
        )
        votes_data = votes_res.data

    results = [
        _candidate_to_dto(c, user.id, votes_data)
        for c in candidates_res.data
    ]
    results.sort(key=lambda x: -x.vote_count)
    return results


@router.post("/propose", response_model=DestinationCandidate)
def propose_destination(
    slug: str,
    iata_code: str,
    user: UserInfo = Depends(current_user),
):
    """User manually proposes a destination."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    iata_upper = iata_code.upper()

    # Upsert (in case it was already algorithm-proposed)
    res = (
        db.table("destination_candidates")
        .upsert(
            {
                "room_id": room["id"],
                "iata_code": iata_upper,
                "proposed_by": user.id,
            },
            on_conflict="room_id,iata_code",
        )
        .execute()
    )
    c = res.data[0]
    return _candidate_to_dto(c, user.id, [])


@router.delete("/{candidate_id}", status_code=204)
def delete_candidate(
    slug: str,
    candidate_id: str,
    user: UserInfo = Depends(current_user),
):
    """Remove a destination candidate from the Holiday.

    Admin can delete any. Non-admins can only delete candidates THEY proposed.
    Algorithm-proposed candidates (proposed_by IS NULL) are admin-only.
    Cascades to delete votes via FK.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    membership = _assert_member(db, room["id"], user.id)

    cand_res = (
        db.table("destination_candidates")
        .select("id, room_id, proposed_by")
        .eq("id", candidate_id)
        .eq("room_id", room["id"])
        .execute()
    )
    if not cand_res.data:
        raise HTTPException(404, "Candidate not found in this Holiday.")
    cand = cand_res.data[0]

    is_admin = bool(membership.get("is_admin"))
    is_owner = cand.get("proposed_by") == user.id
    if not (is_admin or is_owner):
        raise HTTPException(403, "Only the admin or the proposer can delete a candidate.")

    db.table("destination_candidates").delete().eq("id", candidate_id).execute()
    return None


@router.post("/{candidate_id}/vote")
def vote(
    slug: str,
    candidate_id: str,
    vote_value: int = 1,
    user: UserInfo = Depends(current_user),
):
    """Cast or update a vote on a destination candidate.

    vote_value=0 removes the vote. Positive integers for upvotes.
    Future: 1-5 ranked voting.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    # Verify candidate belongs to this room
    cand_res = (
        db.table("destination_candidates")
        .select("id, room_id")
        .eq("id", candidate_id)
        .eq("room_id", room["id"])
        .execute()
    )
    if not cand_res.data:
        raise HTTPException(404, "Destination candidate not found in this room.")

    if vote_value == 0:
        db.table("destination_votes").delete().eq("candidate_id", candidate_id).eq(
            "user_id", user.id
        ).execute()
        return {"ok": True, "vote": 0}

    db.table("destination_votes").upsert(
        {
            "candidate_id": candidate_id,
            "user_id": user.id,
            "vote_value": vote_value,
        },
        on_conflict="candidate_id,user_id",
    ).execute()
    return {"ok": True, "vote": vote_value}


@router.get("/suggest", response_model=list[DestinationCandidate])
def suggest_destinations(
    slug: str,
    top_n: int = 5,
    user: UserInfo = Depends(current_user),
):
    """Pick destinations for the group, preferring Gemini suggestions if
    available, falling back to the rule-based scorer, then to popular defaults.

    Reads pref_destination_answers from trip_preferences for all room members.
    Returns the updated candidate list (sorted by vote count).
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    # Load all trip preferences for this room
    prefs_res = (
        db.table("trip_preferences")
        .select("pref_destination_answers")
        .eq("room_id", room["id"])
        .execute()
    )

    prefs_list: list[dict] = []
    for row in prefs_res.data:
        raw = row.get("pref_destination_answers")
        if not raw:
            continue
        if isinstance(raw, str):
            try:
                prefs_list.append(_json.loads(raw))
            except Exception:
                pass
        elif isinstance(raw, dict):
            prefs_list.append(raw)

    top: list[str] = []

    # Path 1: Gemini (requires GEMINI_API_KEY + at least one preference set)
    if prefs_list:
        gemini_picks = _gemini_suggestions(prefs_list, room, top_n)
        if gemini_picks:
            top = gemini_picks
            log.info("Gemini suggested %d destinations for room %s", len(top), slug)

    # Path 2: rule-based scorer fallback
    if not top and prefs_list:
        scored = [
            (iata, score_destination(iata, prefs_list))
            for iata in DEST_NAMES
        ]
        scored.sort(key=lambda x: -x[1])
        top = [iata for iata, s in scored if s > 0][:top_n]

    # Path 3: popular defaults (no preferences submitted, or both above empty)
    if not top:
        top = list(POPULAR_LABELS.values())[:top_n]

    # Wipe previous algorithm-proposed candidates so a fresh suggestion run
    # actually REPLACES the old list (otherwise re-running just accumulates
    # forever). Keep human-proposed ones (proposed_by IS NOT NULL) and any
    # candidates with votes — those are real picks, not stale suggestions.
    existing = (
        db.table("destination_candidates")
        .select("id, proposed_by, iata_code")
        .eq("room_id", room["id"])
        .execute()
    )
    voted_candidate_ids: set[str] = set()
    if existing.data:
        ids = [c["id"] for c in existing.data]
        votes_res = (
            db.table("destination_votes")
            .select("candidate_id")
            .in_("candidate_id", ids)
            .execute()
        )
        voted_candidate_ids = {v["candidate_id"] for v in (votes_res.data or [])}
    for c in (existing.data or []):
        if c.get("proposed_by") is None and c["id"] not in voted_candidate_ids:
            db.table("destination_candidates").delete().eq("id", c["id"]).execute()

    # Insert new algorithm suggestions (proposed_by = null marks them as such)
    for iata in top:
        db.table("destination_candidates").upsert(
            {"room_id": room["id"], "iata_code": iata},
            on_conflict="room_id,iata_code",
        ).execute()

    # Return the full updated candidate list (same empty-list guard as list_candidates)
    candidates_res = (
        db.table("destination_candidates")
        .select("*")
        .eq("room_id", room["id"])
        .execute()
    )
    candidate_ids = [c["id"] for c in candidates_res.data]
    votes_data: list[dict] = []
    if candidate_ids:
        votes_res = (
            db.table("destination_votes")
            .select("candidate_id, user_id, vote_value")
            .in_("candidate_id", candidate_ids)
            .execute()
        )
        votes_data = votes_res.data

    results = [
        _candidate_to_dto(c, user.id, votes_data)
        for c in candidates_res.data
    ]
    results.sort(key=lambda x: -x.vote_count)
    return results


@router.get("/pick-random")
def pick_random(slug: str, user: UserInfo = Depends(current_user)):
    """'Surprise us' — pick a random destination from the room's candidates.

    If there are candidates with votes, weights toward higher vote counts.
    Falls back to unweighted random if no votes exist.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    candidates_res = (
        db.table("destination_candidates")
        .select("*")
        .eq("room_id", room["id"])
        .execute()
    )
    if not candidates_res.data:
        raise HTTPException(
            404,
            "No destination candidates in this room yet. "
            "Add some via /propose or /suggest first.",
        )

    votes_res = (
        db.table("destination_votes")
        .select("candidate_id, vote_value")
        .in_("candidate_id", [c["id"] for c in candidates_res.data])
        .execute()
    )

    # Weight by vote count (minimum weight 1 so unvoted candidates still eligible)
    vote_totals: dict[str, int] = {}
    for v in votes_res.data:
        vote_totals[v["candidate_id"]] = vote_totals.get(v["candidate_id"], 0) + v["vote_value"]

    candidates = candidates_res.data
    weights = [max(vote_totals.get(c["id"], 0), 1) for c in candidates]
    chosen = random.choices(candidates, weights=weights, k=1)[0]

    return {
        "iata_code": chosen["iata_code"],
        "name": label_dest(chosen["iata_code"], "name"),
        "total_cost_gbp": chosen.get("total_cost_gbp"),
    }
