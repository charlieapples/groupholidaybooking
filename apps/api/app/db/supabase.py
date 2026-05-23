"""Supabase client singleton.

Uses the service-role key so it can bypass RLS for admin operations
(aggregations, blind-reveal counts, etc.). Individual user access control
is enforced manually in each route (membership checks before any mutation).
"""
from __future__ import annotations

import os
from functools import lru_cache

from supabase import Client, create_client


@lru_cache(maxsize=1)
def get_client() -> Client:
    """Return a lazily-created, cached Supabase admin client."""
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set. "
            "Copy apps/api/.env.example → .env and fill in the values."
        )
    return create_client(url, key)
