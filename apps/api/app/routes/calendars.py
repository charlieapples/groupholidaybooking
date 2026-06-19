"""Permanently-linked calendar accounts.

A user links a Google / Microsoft account ONCE here. We run the server-side
OAuth *authorization-code* flow (not the browser popup used for one-off import)
so the provider returns a long-lived **refresh token**. That token is encrypted
and stored, letting the user pull their busy days into every future Holiday with
a single click — no re-granting each time.

Flow:
  1. Browser (authenticated) GETs /{provider}/start → we return a provider
     authorize URL carrying an encrypted `state` (holds the user id).
  2. Browser navigates there, user consents, provider redirects to
     /{provider}/callback?code=…&state=… (a top-level redirect, no JWT).
  3. We exchange the code for tokens, store the encrypted refresh token, and
     redirect back to the app.
  4. GET /busy aggregates busy days across all of the user's linked accounts.

Security: the table is service-role-only (RLS, no policies) so refresh tokens
never reach the browser. `state` is encrypted so the callback can trust the user
id without a JWT and can't be forged. The whole feature is gated on
CALENDAR_TOKEN_KEY + the provider OAuth secrets — absent those it reports
`configured: false` and the UI stays hidden.
"""
from __future__ import annotations

import logging
import os
from datetime import date
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ..core import crypto, calendar_sync
from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user

log = logging.getLogger("calendars")
router = APIRouter()


def _api_base() -> str:
    return (os.getenv("API_PUBLIC_URL", "") or "http://localhost:8000").rstrip("/")


def _web_base() -> str:
    return (os.getenv("APP_URL", "") or "http://localhost:3000").rstrip("/")


def _redirect_uri(provider: str) -> str:
    return f"{_api_base()}/api/calendars/{provider}/callback"


def _provider_configured(provider: str) -> bool:
    if not crypto.is_configured():
        return False
    if provider == "google":
        return bool(os.getenv("GOOGLE_OAUTH_CLIENT_ID") and os.getenv("GOOGLE_OAUTH_CLIENT_SECRET"))
    if provider == "microsoft":
        return bool(os.getenv("MS_OAUTH_CLIENT_ID") and os.getenv("MS_OAUTH_CLIENT_SECRET"))
    return False


def _safe_return_to(return_to: Optional[str]) -> str:
    """Only allow redirects back to our own app (avoid open-redirect)."""
    web = _web_base()
    if return_to and (return_to.startswith(web) or return_to.startswith("http://localhost:3000")):
        return return_to
    return f"{web}/dashboard"


# ── Status & account management ───────────────────────────────────────────────


class CalendarStatus(BaseModel):
    configured: bool
    google: bool
    microsoft: bool


@router.get("/status", response_model=CalendarStatus)
def status(user: UserInfo = Depends(current_user)):
    """Whether permanent linking is switched on (per provider)."""
    return CalendarStatus(
        configured=crypto.is_configured(),
        google=_provider_configured("google"),
        microsoft=_provider_configured("microsoft"),
    )


class LinkedAccount(BaseModel):
    id: str
    provider: str
    account_email: Optional[str] = None
    created_at: Optional[str] = None
    last_used_at: Optional[str] = None


@router.get("/accounts", response_model=list[LinkedAccount])
def list_accounts(user: UserInfo = Depends(current_user)):
    """The user's linked calendar accounts (never returns tokens)."""
    db = get_client()
    res = (
        db.table("linked_calendar_accounts")
        .select("id, provider, account_email, created_at, last_used_at")
        .eq("user_id", user.id)
        .order("created_at")
        .execute()
    )
    return [LinkedAccount(**{**r, "id": str(r["id"])}) for r in (res.data or [])]


@router.delete("/accounts/{account_id}", status_code=204)
def unlink_account(account_id: str, user: UserInfo = Depends(current_user)):
    """Remove a linked account (must belong to the caller)."""
    db = get_client()
    db.table("linked_calendar_accounts").delete().eq("id", account_id).eq("user_id", user.id).execute()
    return None


# ── OAuth start ───────────────────────────────────────────────────────────────


class StartResponse(BaseModel):
    url: str


@router.get("/{provider}/start", response_model=StartResponse)
def oauth_start(
    provider: str,
    return_to: Optional[str] = Query(default=None),
    user: UserInfo = Depends(current_user),
):
    """Return the provider authorize URL to send the user to."""
    if provider not in ("google", "microsoft"):
        raise HTTPException(404, "Unknown provider")
    if not _provider_configured(provider):
        raise HTTPException(503, f"{provider} calendar linking isn't configured yet.")
    state = crypto.encrypt_state({"uid": user.id, "rt": _safe_return_to(return_to), "p": provider})
    if provider == "google":
        params = {
            "client_id": os.getenv("GOOGLE_OAUTH_CLIENT_ID", ""),
            "redirect_uri": _redirect_uri("google"),
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/calendar.readonly email",
            "access_type": "offline",       # ask for a refresh token
            "prompt": "consent",            # force refresh token even on re-link
            "include_granted_scopes": "true",
            "state": state,
        }
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    else:
        params = {
            "client_id": os.getenv("MS_OAUTH_CLIENT_ID", ""),
            "redirect_uri": _redirect_uri("microsoft"),
            "response_type": "code",
            "response_mode": "query",
            "scope": "offline_access Calendars.Read User.Read",
            "prompt": "select_account",
            "state": state,
        }
        url = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" + urlencode(params)
    return StartResponse(url=url)


# ── OAuth callback ────────────────────────────────────────────────────────────


def _store_account(uid: str, provider: str, email: Optional[str], refresh_token: str, scopes: str):
    db = get_client()
    db.table("linked_calendar_accounts").upsert(
        {
            "user_id": uid,
            "provider": provider,
            "account_email": email,
            "refresh_token_enc": crypto.encrypt(refresh_token),
            "scopes": scopes,
        },
        on_conflict="user_id,provider,account_email",
    ).execute()


@router.get("/google/callback")
def google_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    return _handle_callback("google", code, state, error)


@router.get("/microsoft/callback")
def microsoft_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    return _handle_callback("microsoft", code, state, error)


def _handle_callback(provider: str, code: Optional[str], state: Optional[str], error: Optional[str]):
    # Recover where to send the user back to, even on error.
    return_to = f"{_web_base()}/dashboard"
    try:
        st = crypto.decrypt_state(state or "")
        return_to = st.get("rt") or return_to
        uid = st["uid"]
    except Exception:
        log.warning("%s callback: bad/forged state", provider)
        return RedirectResponse(f"{_web_base()}/dashboard?calendar_error=state")
    if error or not code:
        # Provider sent us back an error (e.g. access_denied) or no code.
        log.warning("%s callback: provider error=%r (no code=%s)", provider, error, not code)
        return RedirectResponse(f"{return_to}?calendar_error={error or 'cancelled'}")
    try:
        if provider == "google":
            email, refresh_token, scopes = _exchange_google(code)
        else:
            email, refresh_token, scopes = _exchange_microsoft(code)
        if not refresh_token:
            # No refresh token (e.g. user previously consented) — can't link permanently.
            log.warning("%s callback: token exchange returned no refresh_token (email=%r)", provider, email)
            return RedirectResponse(f"{return_to}?calendar_error=no_refresh_token")
        _store_account(uid, provider, email, refresh_token, scopes)
        log.info("%s calendar linked for user %s (%s)", provider, uid, email)
        return RedirectResponse(f"{return_to}?calendar_linked={provider}")
    except Exception:
        log.exception("%s callback: exchange/store failed", provider)
        return RedirectResponse(f"{return_to}?calendar_error=exchange_failed")


def _exchange_google(code: str) -> tuple[Optional[str], Optional[str], str]:
    with httpx.Client(timeout=20) as c:
        tok = c.post("https://oauth2.googleapis.com/token", data={
            "client_id": os.getenv("GOOGLE_OAUTH_CLIENT_ID", ""),
            "client_secret": os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", ""),
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": _redirect_uri("google"),
        })
        if not tok.is_success:
            log.warning("google token exchange HTTP %s: %s", tok.status_code, tok.text[:400])
            tok.raise_for_status()
        data = tok.json()
        access_token = data.get("access_token")
        email = None
        if access_token:
            ui = c.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if ui.is_success:
                email = ui.json().get("email")
    return email, data.get("refresh_token"), data.get("scope", "")


def _exchange_microsoft(code: str) -> tuple[Optional[str], Optional[str], str]:
    with httpx.Client(timeout=20) as c:
        tok = c.post("https://login.microsoftonline.com/common/oauth2/v2.0/token", data={
            "client_id": os.getenv("MS_OAUTH_CLIENT_ID", ""),
            "client_secret": os.getenv("MS_OAUTH_CLIENT_SECRET", ""),
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": _redirect_uri("microsoft"),
            "scope": "offline_access Calendars.Read User.Read",
        })
        if not tok.is_success:
            log.warning("microsoft token exchange HTTP %s: %s", tok.status_code, tok.text[:400])
            tok.raise_for_status()
        data = tok.json()
        access_token = data.get("access_token")
        email = None
        if access_token:
            me = c.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if me.is_success:
                j = me.json()
                email = j.get("mail") or j.get("userPrincipalName")
    return email, data.get("refresh_token"), data.get("scope", "")


# ── Aggregate busy days ───────────────────────────────────────────────────────


class BusyResponse(BaseModel):
    busy: list[str]
    accounts: list[dict]    # [{email, provider, ok}]


@router.get("/busy", response_model=BusyResponse)
def busy(
    start: str = Query(...),
    end: str = Query(...),
    user: UserInfo = Depends(current_user),
):
    """Merged busy days across every linked account, for [start, end]."""
    try:
        ws, we = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        raise HTTPException(422, "start and end must be YYYY-MM-DD")
    db = get_client()
    rows = (
        db.table("linked_calendar_accounts")
        .select("id, provider, account_email, refresh_token_enc")
        .eq("user_id", user.id)
        .execute()
    ).data or []
    all_busy: set[str] = set()
    accounts: list[dict] = []
    for r in rows:
        ok = False
        try:
            refresh = crypto.decrypt(r["refresh_token_enc"])
            if r["provider"] == "google":
                at = calendar_sync.google_refresh_access_token(refresh)
                days = calendar_sync.google_busy_days(at, ws, we) if at else []
            else:
                at = calendar_sync.ms_refresh_access_token(refresh)
                days = calendar_sync.ms_busy_days(at, ws, we) if at else []
            all_busy.update(days)
            ok = at is not None
            if ok:
                db.table("linked_calendar_accounts").update(
                    {"last_used_at": "now()"}
                ).eq("id", r["id"]).execute()
        except Exception:
            ok = False
        accounts.append({"email": r.get("account_email"), "provider": r["provider"], "ok": ok})
    return BusyResponse(busy=sorted(all_busy), accounts=accounts)
