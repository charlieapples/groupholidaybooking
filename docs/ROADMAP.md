# Roadmap

Phased build plan for the v2 platform. Each phase is independently shippable.

## Phase 0 — Foundation (current) ✅

- [x] Monorepo restructure (apps/streamlit-legacy + apps/api + apps/web + infra)
- [x] FastAPI skeleton with all route stubs
- [x] Supabase schema migrations drafted (001–006)
- [x] Architecture doc
- [ ] User: create Supabase project
- [ ] User: create Vercel + Railway accounts
- [ ] User: create Google Cloud OAuth client
- [ ] User: get Gemini API key

## Phase 1 — Auth + Rooms (~3 days work after accounts ready)

- [ ] Apply Supabase migrations
- [ ] Wire Supabase client in apps/api/app/db/
- [ ] Auth dependency (verify JWT)
- [ ] Implement rooms CRUD endpoints (real, not 501s)
- [ ] Scaffold Next.js app (App Router, Tailwind, Supabase client)
- [ ] Landing page → "Create a holiday" button
- [ ] Google sign-in flow
- [ ] /room/[slug] dashboard (shows room state, members, current step)
- [ ] Shareable invite link

**Deliverable**: User can create a room, share the link, friends join via Google login, everyone sees the room dashboard.

## Phase 2 — Availability + Time Windows (~1 week)

- [ ] Migrate group_holiday/ logic into apps/api/app/core/
- [ ] Calendar grid UI for marking busy/free days
- [ ] Google Calendar import button (uses Supabase provider token)
- [ ] Blind submission: "X/N members have submitted" live counter via Realtime
- [ ] Free window ranking algorithm
- [ ] Reveal UI once all submitted
- [ ] Lock in the agreed window

**Deliverable**: Group of friends can each submit availability and see the ranked free windows.

## Phase 3 — Duration + Budget (~2 days)

- [ ] Min/max nights input per user, aggregated
- [ ] Budget input per user, group uses lowest
- [ ] Save to room

**Deliverable**: Room has agreed dates, duration, budget.

## Phase 4 — Destination Picking (~1 week)

- [ ] Questionnaire UI (5 questions: climate, setting, activity, must-haves, avoid)
- [ ] Aggregate preferences across group
- [ ] Algorithm proposes 5-10 destinations matching prefs + budget
- [ ] Total cost per destination shown (flights + ground)
- [ ] Manual propose-and-vote flow
- [ ] "Pick random" flow
- [ ] Voting UI with live tallies

**Deliverable**: Group picks a destination via their preferred mechanism.

## Phase 5 — Flights (~3 days)

- [ ] Port shared-dates optimiser to FastAPI
- [ ] Run optimiser on demand for chosen destination
- [ ] Cache results in `flight_results` table
- [ ] Display per-person breakdown
- [ ] Affiliate deep-links per person

**Deliverable**: Same functionality as the current Streamlit MVP, but inside a room.

## Phase 6 — Accommodation + Cost of Living (~1 week)

- [ ] Booking.com Affiliate API integration
- [ ] Hotel search per destination, group-sized rooms
- [ ] Static cost-of-living dataset (World Bank or Numbeo free export)
- [ ] Total trip cost calculation: flights + ground + accom + daily × nights
- [ ] Update destination rankings to use total trip cost (not just flights)

**Deliverable**: Total trip cost per destination, with hotel options.

## Phase 7 — AI Chatbot (~3 days)

- [ ] Gemini API integration
- [ ] Sidebar chat UI
- [ ] Room context injection (current step, members, agreed params)
- [ ] Suggested prompts ("Why is X expensive?", "What's the weather like in Y?")

**Deliverable**: Users can chat with an AI about their plan.

## Phase 8 — Polish + Launch (~1 week)

- [ ] Mobile UI tuning
- [ ] Onboarding flow for first-time users
- [ ] Email notifications (via Supabase + Resend) when room state changes
- [ ] Domain + DNS
- [ ] SEO meta tags, sitemap, OG images
- [ ] Privacy policy + cookie banner
- [ ] Sunset Streamlit MVP, redirect groupholidaybooking.streamlit.app to new domain

**Deliverable**: Public launch.

## Phase 9+ — Post-launch

- Trainline live prices via direct partnership (once we have booking volume)
- Activities (GetYourGuide, Viator affiliate)
- Multi-currency support
- Luxury tier (not just cheapest)
- Mobile app (React Native / Expo)

## Time/cost estimate

If user does all account setup in ~1 day, then 4-6 weeks of focused build work to reach Phase 8 (public launch).
Estimated infra cost during build: £0 (all free tiers).
Estimated infra cost at 1000 active users: £0-£20/month.
Estimated infra cost at 10,000 active users: £50-£200/month (Vercel Pro + Railway Pro + Supabase Pro).
