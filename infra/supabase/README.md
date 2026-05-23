# Supabase setup

Database schema for the v2 platform. Supabase handles auth + realtime out of the box.

## Initial setup (one-time)

1. Create a new project at supabase.com (free tier is plenty for now)
2. Note the **Project URL** and **service_role key** (from Project Settings → API)
3. Add them to `apps/api/.env` as `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
4. In the Supabase dashboard, go to **Authentication → Providers** and enable
   **Google** — paste in the OAuth Client ID + Secret from Google Cloud Console.
   Scope: `https://www.googleapis.com/auth/calendar.readonly` (extra scope for
   calendar import — Supabase exposes the provider token to the backend).
5. Run the migrations below in order via the Supabase **SQL Editor**, or
   install the Supabase CLI and run `supabase db push`.

## Migrations

Apply in numbered order:

| File | Purpose |
|------|---------|
| `001_init.sql` | `profiles`, `rooms`, `room_members` |
| `002_availability.sql` | `availability_blocks`, `availability_submissions` |
| `003_preferences.sql` | `trip_preferences` (duration / budget / dest Q&A per user) |
| `004_destinations.sql` | `destination_candidates`, `destination_votes` |
| `005_results.sql` | `flight_results` cache |
| `006_rls.sql` | Row Level Security policies (members can only see their own room) |

## Realtime

Enable Realtime on these tables (Database → Replication → toggle):
- `availability_submissions` (for the "X/N people submitted" counter)
- `room_members` (for live member list)
- `destination_votes` (for live vote tallies)
- `flight_results` (for "results ready" notification)
