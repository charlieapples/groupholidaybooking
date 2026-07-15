"""Liveness / readiness endpoints for Railway and uptime monitors."""
from fastapi import APIRouter

from ..db.supabase import get_client

router = APIRouter()


@router.get("/")
def root():
    return {"name": "group-holiday-api", "version": "0.2.0-alpha"}


@router.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/healthz/db")
def healthz_db():
    """DB liveness — runs a tiny query so an uptime monitor (e.g. UptimeRobot)
    pinging this endpoint counts as Supabase activity and stops the free-tier
    project auto-pausing after 7 days of inactivity.
    """
    try:
        get_client().table("rooms").select("id").limit(1).execute()
        return {"status": "ok", "db": "up"}
    except Exception as e:  # never 500 the monitor — report degraded instead
        return {"status": "degraded", "db": "down", "detail": str(e)[:200]}
