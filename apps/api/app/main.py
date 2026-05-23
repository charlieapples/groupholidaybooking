"""FastAPI entry point for the Group Holiday Booking platform.

The Streamlit MVP lives in apps/streamlit-legacy/ and stays deployed at
groupholidaybooking.streamlit.app while this v2 backend is being built.

The v2 platform splits into:
- apps/web (Next.js) — user-facing UI
- apps/api (this) — FastAPI backend, owns business logic + DB writes
- Supabase — Postgres + Auth + Realtime

The FastAPI core/ module is a clean migration of the Streamlit app's
group_holiday/ package: flights, ground, optimiser, destinations.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from .routes import availability, chat, destinations, flights, health, rooms


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup hooks (e.g. warm caches, validate env) go here
    missing = [k for k in (
        "TRAVELPAYOUTS_TOKEN", "GOOGLE_MAPS_API_KEY",
        "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "GEMINI_API_KEY",
    ) if not os.getenv(k)]
    if missing:
        print(f"[WARN] Missing env vars: {', '.join(missing)} — some routes will fail")
    yield
    # Shutdown hooks


app = FastAPI(
    title="Group Holiday Booking API",
    version="0.2.0-alpha",
    description="Backend for the multi-user group holiday planner.",
    lifespan=lifespan,
)

# CORS: allow the Next.js frontend (set in Railway env to your Vercel domain)
allowed_origins = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route registration
app.include_router(health.router, tags=["health"])
app.include_router(rooms.router, prefix="/api/rooms", tags=["rooms"])
app.include_router(availability.router, prefix="/api/rooms/{slug}/availability", tags=["availability"])
app.include_router(destinations.router, prefix="/api/rooms/{slug}/destinations", tags=["destinations"])
app.include_router(flights.router, prefix="/api/rooms/{slug}/flights", tags=["flights"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
