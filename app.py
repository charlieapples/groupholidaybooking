"""Streamlit Cloud entry-point shim.

The Streamlit MVP lives in apps/streamlit-legacy/. Streamlit Cloud is configured
to run /app.py (this file). Rather than make the user update their Streamlit
Cloud main-file setting, this wrapper just runs the real app from its new home.

To remove this shim later: in Streamlit Cloud → Manage app → Settings, set
'Main file path' to `apps/streamlit-legacy/app.py` and delete this file +
the root requirements.txt mirror.
"""
from __future__ import annotations

import os
import runpy
import sys
from pathlib import Path

_LEGACY = Path(__file__).parent / "apps" / "streamlit-legacy"

# Put the legacy app's dir on sys.path so `from group_holiday.x import y` works
sys.path.insert(0, str(_LEGACY))

# Switch CWD so .cache/, .env, .streamlit/ inside the legacy dir resolve
os.chdir(_LEGACY)

# Execute as __main__ so any `if __name__ == "__main__":` blocks fire
runpy.run_path(str(_LEGACY / "app.py"), run_name="__main__")
