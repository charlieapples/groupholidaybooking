"""Shared Gemini configuration.

Centralises the model name so it's set in ONE place. Google retires model
versions on a schedule (e.g. gemini-2.0-flash shuts down 2026-06-01), so the
name is read from an env var with a current-default fallback. To migrate to a
new model, set GEMINI_MODEL in Railway — no code change needed.

See: https://ai.google.dev/gemini-api/docs/deprecations
"""
from __future__ import annotations

import os

# Default to gemini-2.5-flash (current as of 2026; gemini-2.0-flash is
# retired 2026-06-01). Override via env var for future migrations.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
