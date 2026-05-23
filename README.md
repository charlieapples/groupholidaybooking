# Group Holiday Booking

Multi-user platform for planning a group holiday end-to-end: when everyone's
free, where to go, how to get there, where to stay — optimised for total group cost.

**Live MVP:** [groupholidaybooking.streamlit.app](https://groupholidaybooking.streamlit.app) (single-user, flights only)
**v2 (in build):** multi-user collaborative platform — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ROADMAP.md](docs/ROADMAP.md)

## What it does

When 4–12 friends from different parts of the UK want to plan a holiday together, every part of it is messy: when are we all free? Where? How does each person get there cheaply? Where do we stay?

This platform walks the group through the whole flow:

1. **Availability** — calendar import or manual block-out, blind submission, ranked free windows
2. **Duration + budget** — agreed by the group
3. **Destination** — questionnaire-driven suggestions, propose-and-vote, or random pick
4. **Flights** — cheapest combo from everyone's nearest airport, same dates for the whole group
5. **Accommodation** — Booking.com search, group-sized
6. **Total cost** — flights + ground + hotels + daily living per destination

## Repository layout (monorepo)

```
apps/
├── streamlit-legacy/   The current MVP (Streamlit, single-user) — stays deployed
├── api/                v2 backend (FastAPI + Supabase + diskcache)
└── web/                v2 frontend (Next.js 15 + Tailwind + Supabase client) — coming soon
infra/
└── supabase/           Database schema migrations
docs/
├── ARCHITECTURE.md     System design
└── ROADMAP.md          Phased build plan
```

## Quick start

### Streamlit MVP (works today)

```bash
cd apps/streamlit-legacy
pip install -r requirements.txt
cp ../../.env.example .env       # add TRAVELPAYOUTS_TOKEN + GOOGLE_MAPS_API_KEY
streamlit run app.py
```

### FastAPI backend (v2, in progress)

```bash
cd apps/api
pip install -r requirements.txt
cp .env.example .env             # add Supabase URL + service key + Gemini key
uvicorn app.main:app --reload
```

API docs auto-generated at http://localhost:8000/docs.

### Next.js frontend (v2)

Not scaffolded yet — see [ROADMAP.md](docs/ROADMAP.md) Phase 1.

## Stack

| | MVP | v2 |
|---|---|---|
| Frontend | Streamlit | Next.js 15 (Vercel) |
| Backend | (Streamlit serves) | FastAPI (Railway) |
| DB / Auth | (none) | Supabase (Postgres + Google OAuth + Realtime) |
| AI | (none) | Gemini 2.5 Flash |
| Flights | Travelpayouts/Aviasales | same |
| Ground | Google Maps Directions | same + Trainline (via Awin) |
| Hotels | — | Booking.com Affiliate API |

## Revenue model

Affiliate commissions, no fees to users:
- Flights → Travelpayouts/Aviasales (already live)
- Hotels → Booking.com (coming)
- Trains → Trainline via Awin (coming)

## Licence

MIT — see [LICENSE](LICENSE).
