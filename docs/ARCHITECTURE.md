# Architecture

## What this is

A multi-user group holiday planning platform. Friends from different cities
collaborate to pick a time window, destination, flights, accommodation —
optimised for total group cost.

The Streamlit MVP (apps/streamlit-legacy/) is the single-user prototype.
The v2 platform (apps/web + apps/api) is a proper collaborative web app.

## Stack

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/web        Next.js 15 (App Router, React 19, Tailwind 4) │
│                  → Vercel                                       │
└────────────────┬────────────────────────────────────────────────┘
                 │ HTTPS (REST, JSON)
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  apps/api        FastAPI (Python 3.11+)                         │
│                  Business logic from group_holiday/ package      │
│                  → Railway                                       │
└─────────┬───────────────────────────────────┬───────────────────┘
          │                                   │
          ▼                                   ▼
┌──────────────────────┐         ┌───────────────────────────────┐
│  Supabase            │         │  External APIs                │
│  • Postgres (data)   │         │  • Travelpayouts (flights)    │
│  • Auth (Google SSO) │         │  • Google Maps (ground)       │
│  • Realtime (live   │          │  • Booking.com (hotels)       │
│    counters, votes)  │         │  • Awin/Trainline (trains)    │
│  • Storage (avatars) │         │  • Google Calendar (avail)    │
└──────────────────────┘         │  • Gemini (AI chatbot)        │
                                  └───────────────────────────────┘
```

## Why this stack

| Concern | Choice | Why |
|---------|--------|-----|
| Frontend | Next.js 15 | SSR for SEO (Google indexes /destinations/barcelona etc.), mobile-friendly, mature React ecosystem |
| Backend | FastAPI | Keeps every line of Python from the MVP usable; OpenAPI docs auto-generated; fast |
| DB + Auth | Supabase | Postgres (proper SQL), built-in Google OAuth, Realtime subscriptions for live collab, all free tier |
| AI | Gemini 2.5 Flash | Generous free tier; ~10× cheaper than Claude for the chatbot job |
| Frontend deploy | Vercel | Native Next.js, free tier, ~30s deploys |
| Backend deploy | Railway | Easy Python deploys, free tier, auto-deploys from GitHub |

## The planning flow (user spec)

The room's `step_order` array is reorderable per room. Default:

1. **Availability** — Each member submits busy dates inside a rough window (e.g. "Sept 2026"). Blind reveal: nothing is shown until everyone submits. API ranks free windows by size, ties broken by soonest.
2. **Duration** — Each member submits min/max nights. Aggregated to a group range.
3. **Budget** — Each member submits a per-person cap. Group uses the lowest (so everyone can afford).
4. **Destination** — Three flavours, room admin picks one:
   - **Hybrid**: questionnaire → algorithm proposes 5-10 → ranked by total cost → vote
   - **Propose-and-vote**: members nominate, others vote
   - **Random pick**: surprise pick from group's known-liked shortlist
5. **Flights** — Run optimiser for the chosen destination. Shared-dates mode (same out/return for whole group).
6. **Accommodation** — Booking.com search, group-sized rooms, cheapest with free cancellation.
7. **(Optional) Activities** — Out of scope for v0.

Total trip cost (per person, per destination):
```
flight + ground transport + (hotel cost ÷ group size) + (daily living × nights)
```

## Database schema

See `infra/supabase/migrations/`. Key tables:

| Table | Purpose |
|-------|---------|
| `profiles` | User profile, extends `auth.users` |
| `rooms` | One per planning session, tracks current step + agreed params |
| `room_members` | Join table; tracks home postcode per room (can differ from default) |
| `availability_blocks` | Per-user busy dates inside the rough window |
| `availability_submissions` | "Has user X finished submitting?" — needed for blind reveal |
| `trip_preferences` | Per-user duration/budget/destination Q&A answers |
| `destination_candidates` | Algorithm-proposed or user-proposed destinations, with cached cost |
| `destination_votes` | Voting tally |
| `flight_results` | Cached optimiser output per room+destination |
| `accommodation_results` | Cached hotel + COL data per room+destination |

Row-Level Security: members can only see data for rooms they're in. The FastAPI backend uses the service_role key to bypass RLS for aggregations (e.g. computing the blind-reveal results).

## Repo layout (monorepo)

```
groupholidaybooking/
├── apps/
│   ├── streamlit-legacy/        Current MVP (kept running during rebuild)
│   ├── api/                     FastAPI v2 backend
│   └── web/                     Next.js v2 frontend
├── infra/
│   └── supabase/
│       ├── README.md
│       └── migrations/          SQL migrations in numbered order
├── docs/
│   ├── ARCHITECTURE.md          this file
│   └── ROADMAP.md               phased build plan
├── packages/
│   └── shared/                  shared TS types (later)
├── README.md
├── LICENSE
└── .gitignore
```

## Auth flow

1. User clicks "Sign in with Google" on the Next.js app
2. Supabase Auth handles the OAuth dance (with Google Calendar scope)
3. Supabase returns a JWT to the Next.js client
4. Next.js client sends the JWT as `Authorization: Bearer <jwt>` to FastAPI
5. FastAPI dependency verifies the JWT (via Supabase JWKS) and extracts `user_id`
6. FastAPI uses the service_role key for DB queries, scoped to that user

The provider token (Google's access token) is stored by Supabase and accessible via `auth.users.identities` — that's what we use to import calendar events.

## Caching

| Layer | TTL | Purpose |
|-------|-----|---------|
| diskcache (FastAPI process) | 1h flights / 24h ground | Avoid re-hitting Travelpayouts/Google Maps for the same query |
| `flight_results` table | per-room manual refresh | Persistent cache across restarts |
| Next.js ISR / RSC cache | per-page | Static parts of the UI |

Note: Railway's filesystem is also ephemeral. For persistence across restarts the `flight_results` Postgres table is the source of truth — diskcache is just an optimisation.
