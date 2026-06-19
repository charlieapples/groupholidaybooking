"""Symmetric encryption for secrets at rest (OAuth refresh tokens, OAuth state).

We store calendar refresh tokens in Postgres. They're long-lived credentials, so
they're encrypted with Fernet (AES-128-CBC + HMAC) using a key kept only in the
API environment (`CALENDAR_TOKEN_KEY`). The database never holds plaintext, and
the browser never sees these values at all (service-role-only table).

Generate a key once with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
and set it as CALENDAR_TOKEN_KEY in the API environment (Railway).
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


class CryptoNotConfigured(RuntimeError):
    """Raised when CALENDAR_TOKEN_KEY is missing — feature is off until set."""


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    key = os.getenv("CALENDAR_TOKEN_KEY", "").strip()
    if not key:
        raise CryptoNotConfigured(
            "CALENDAR_TOKEN_KEY is not set — calendar linking is disabled. "
            "Generate one with Fernet.generate_key() and set it in the API env."
        )
    return Fernet(key.encode())


def is_configured() -> bool:
    """True if the encryption key is present (so the feature can run)."""
    return bool(os.getenv("CALENDAR_TOKEN_KEY", "").strip())


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()


def encrypt_state(data: dict[str, Any]) -> str:
    """Encrypt a small JSON dict for use as an OAuth `state` parameter.

    The OAuth callback is a top-level browser redirect, so it can't carry the
    Supabase JWT. We instead stash the user id (and a return URL) in `state`,
    encrypted so only this server can read or forge it.
    """
    return encrypt(json.dumps(data, separators=(",", ":")))


def decrypt_state(token: str) -> dict[str, Any]:
    try:
        return json.loads(decrypt(token))
    except (InvalidToken, ValueError) as exc:
        raise ValueError("Invalid OAuth state") from exc
