/**
 * Typed helpers for calling the FastAPI backend.
 *
 * All requests go through Next.js rewrites (/api/* → FastAPI) so the
 * same code works in dev (localhost:8000) and production (Railway URL).
 *
 * Each helper requires a Supabase access_token so FastAPI can verify the user.
 */

const BASE = "/api";

async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  // 204 No Content responses (e.g. DELETE) have no body to parse
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  default_home_postcode: string | null;
  currency?: string;
  // Remembered trip preferences, pre-filled on future holidays.
  default_min_nights?: number | null;
  default_max_nights?: number | null;
  default_budget_gbp?: number | null;
  remember_trip_prefs?: boolean;
}

export function getMyProfile(token: string) {
  return apiFetch<Profile>("/profile", token);
}

export function updateMyProfile(
  token: string,
  body: {
    default_home_postcode?: string; display_name?: string; currency?: string;
    default_min_nights?: number; default_max_nights?: number;
    default_budget_gbp?: number; remember_trip_prefs?: boolean;
  }
) {
  return apiFetch<Profile>("/profile", token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ── Linked calendars (permanent — link once, reuse every Holiday) ─────────────

export interface CalendarStatus {
  configured: boolean;
  google: boolean;
  microsoft: boolean;
}

export interface LinkedAccount {
  id: string;
  provider: "google" | "microsoft";
  account_email: string | null;
  created_at: string | null;
  last_used_at: string | null;
}

export interface LinkedBusy {
  busy: string[];
  accounts: { email: string | null; provider: string; ok: boolean }[];
}

/** Whether permanent calendar linking is switched on (per provider). */
export function getCalendarStatus(token: string) {
  return apiFetch<CalendarStatus>("/calendars/status", token);
}

/** The user's permanently linked calendar accounts (no tokens). */
export function getLinkedAccounts(token: string) {
  return apiFetch<LinkedAccount[]>("/calendars/accounts", token);
}

/** Get the provider authorize URL to redirect the user to, to link an account. */
export function startCalendarLink(
  token: string,
  provider: "google" | "microsoft",
  returnTo: string
) {
  const q = `?return_to=${encodeURIComponent(returnTo)}`;
  return apiFetch<{ url: string }>(`/calendars/${provider}/start${q}`, token);
}

/** Unlink a permanently-linked calendar account. */
export function unlinkCalendarAccount(token: string, accountId: string) {
  return apiFetch<void>(`/calendars/accounts/${accountId}`, token, { method: "DELETE" });
}

export interface LinkedCalendar {
  account_id: string;
  account_email: string | null;
  provider: "google" | "microsoft";
  id: string;
  summary: string;
}

/** List the individual calendars inside every linked account (to pick from). */
export function listLinkedCalendars(token: string) {
  return apiFetch<LinkedCalendar[]>("/calendars/list-calendars", token);
}

/** Merged busy days across linked accounts for a window. Optionally restrict to
 *  specific calendar ids (comma-joined); omit for ALL. */
export function getLinkedBusy(token: string, start: string, end: string, calendarIds?: string[]) {
  const q = calendarIds && calendarIds.length
    ? `&calendar_ids=${encodeURIComponent(calendarIds.join(","))}`
    : "";
  return apiFetch<LinkedBusy>(`/calendars/busy?start=${start}&end=${end}${q}`, token);
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

export interface Room {
  id: string;
  slug: string;
  name: string;
  current_step: string;
  rough_window: string | null;
  member_count: number;
  is_admin: boolean;
  // 'holiday' (full flow) or 'meetup' (lighter local get-together).
  trip_type?: "holiday" | "meetup";
  // Optional room settings (populated after later steps)
  search_start?: string | null;
  search_end?: string | null;
  agreed_start?: string | null;
  agreed_end?: string | null;
  min_nights?: number | null;
  max_nights?: number | null;
  budget_gbp?: number | null;
  destination_iata?: string | null;
  time_value_per_hour?: number | null;
  // 'ranked' (default) = each member proposes one + ranks all (Borda).
  // 'open' = AI suggestions + 👍/😐/👎 voting.
  voting_style?: "ranked" | "open";
  // Multiple candidate windows for the flight search.
  search_windows?: { start_date: string; end_date: string }[];
  multi_window_search?: boolean;
  // True = whole group departs the same airport; false = each their own cheapest.
  same_airport?: boolean;
}

export function createRoom(
  token: string,
  body: { name: string; rough_window?: string; home_postcode?: string; trip_type?: "holiday" | "meetup" }
) {
  return apiFetch<Room>("/rooms", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listRooms(token: string) {
  return apiFetch<Room[]>("/rooms", token);
}

export function getRoom(token: string, slug: string) {
  return apiFetch<Room>(`/rooms/${slug}`, token);
}

export function joinRoom(token: string, slug: string, home_postcode?: string) {
  const qs = home_postcode ? `?home_postcode=${encodeURIComponent(home_postcode)}` : "";
  return apiFetch<Room>(`/rooms/${slug}/join${qs}`, token, { method: "POST" });
}

export function listMembers(token: string, slug: string) {
  return apiFetch<Member[]>(`/rooms/${slug}/members`, token);
}

export function updateRoom(
  token: string,
  slug: string,
  body: {
    name?: string;
    rough_window?: string;
    search_start?: string;
    search_end?: string;
    agreed_start?: string;
    agreed_end?: string;
    min_nights?: number;
    max_nights?: number;
    budget_gbp?: number;
    destination_iata?: string;
    time_value_per_hour?: number;
    voting_style?: "ranked" | "open";
    search_windows?: { start_date: string; end_date: string }[];
    multi_window_search?: boolean;
    same_airport?: boolean;
  }
) {
  return apiFetch<Room>(`/rooms/${slug}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function advanceStep(token: string, slug: string) {
  return apiFetch<Room>(`/rooms/${slug}/advance`, token, { method: "POST" });
}

/** Admin only: move the room back one planning step (no data deleted). */
export function goBackStep(token: string, slug: string) {
  return apiFetch<Room>(`/rooms/${slug}/go-back`, token, { method: "POST" });
}

/** Admin only: reset the Holiday back to a step, clearing work from there on. */
export function resetRoom(token: string, slug: string, target_step: string) {
  return apiFetch<Room>(`/rooms/${slug}/reset`, token, {
    method: "POST",
    body: JSON.stringify({ target_step }),
  });
}

export function deleteRoom(token: string, slug: string) {
  return apiFetch<void>(`/rooms/${slug}`, token, { method: "DELETE" });
}

export function leaveRoom(token: string, slug: string) {
  return apiFetch<void>(`/rooms/${slug}/leave`, token, { method: "DELETE" });
}

export function kickMember(token: string, slug: string, memberUserId: string) {
  return apiFetch<void>(`/rooms/${slug}/members/${memberUserId}`, token, { method: "DELETE" });
}

/** Admin: grant or revoke admin rights for another member (multiple admins allowed). */
export function setMemberAdmin(token: string, slug: string, memberUserId: string, isAdmin: boolean) {
  return apiFetch<void>(`/rooms/${slug}/members/${memberUserId}/admin`, token, {
    method: "PATCH",
    body: JSON.stringify({ is_admin: isAdmin }),
  });
}

export function updateMyPostcode(token: string, slug: string, home_postcode: string) {
  return apiFetch<{ ok: boolean }>(
    `/rooms/${slug}/join?home_postcode=${encodeURIComponent(home_postcode)}`,
    token,
    { method: "PATCH" }
  );
}

export interface Member {
  user_id: string;
  display_name: string | null;
  home_postcode: string | null;
  trip_origin_postcode?: string | null;
  is_admin: boolean;
  joined_at: string;
}

/** Set (or clear with "") the caller's per-trip departure postcode for this room. */
export function setTripOrigin(token: string, slug: string, trip_origin_postcode: string) {
  return apiFetch<{ ok: boolean; trip_origin_postcode: string | null }>(
    `/rooms/${slug}/trip-origin?trip_origin_postcode=${encodeURIComponent(trip_origin_postcode)}`,
    token,
    { method: "PATCH" }
  );
}

// ── Availability ──────────────────────────────────────────────────────────────

export interface FreeWindow {
  start_date: string;
  end_date: string;
  days: number;
  members_free: number;
}

export interface SubmissionStatus {
  submitted: number;
  total: number;
  members_pending: string[];
  all_submitted: boolean;
  user_submitted: boolean;   // whether the calling user has already submitted
}

export function submitAvailability(
  token: string,
  slug: string,
  blocks: { block_date: string; is_busy: boolean; source?: string }[],
  mark_submitted = true
) {
  return apiFetch(`/rooms/${slug}/availability`, token, {
    method: "POST",
    body: JSON.stringify({ blocks, mark_submitted }),
  });
}

export function getSubmissionStatus(token: string, slug: string) {
  return apiFetch<SubmissionStatus>(`/rooms/${slug}/availability/status`, token);
}

export function getFreeWindows(token: string, slug: string, min_days = 4) {
  return apiFetch<FreeWindow[]>(`/rooms/${slug}/availability/windows?min_days=${min_days}`, token);
}

/** Return the calling user's currently-saved busy dates (ISO strings).
 *  Used to pre-populate the availability calendar on revisit. */
export function getMyAvailability(token: string, slug: string) {
  return apiFetch<string[]>(`/rooms/${slug}/availability/my`, token);
}

export function remindPendingMembers(token: string, slug: string) {
  return apiFetch<{ ok: boolean; reminders_sent: number }>(
    `/rooms/${slug}/availability/remind`,
    token,
    { method: "POST" }
  );
}

// ── Destinations ──────────────────────────────────────────────────────────────

export interface DestinationCandidate {
  id: string;
  iata_code: string;
  name: string;
  proposed_by: string | null;
  proposer_count?: number;
  total_cost_gbp: number | null;
  cost_breakdown: Record<string, number>;
  vote_count: number;
  my_vote: number;
  // Ranked (Borda) mode:
  borda_points?: number | null;   // sum of ranks (lower = better); null until reveal
  my_rank?: number | null;        // caller's rank for this candidate (1 = first choice)
  // Rough cost guidance (region-level estimates):
  est_daily_living_gbp?: number | null;
  est_daily_living_low_gbp?: number | null;
  est_daily_living_high_gbp?: number | null;
  est_flight_return_gbp?: number | null;
  est_flight_low_gbp?: number | null;
  est_flight_high_gbp?: number | null;
}

export function listDestinations(token: string, slug: string) {
  return apiFetch<DestinationCandidate[]>(`/rooms/${slug}/destinations`, token);
}

export interface DestinationIdea {
  iata_code: string;
  name: string;
  est_daily_living_gbp?: number | null;
  est_flight_return_gbp?: number | null;
}

export interface IdeasResponse {
  ideas: DestinationIdea[];
  reasoning?: string | null;   // Gemini's rationale for these picks
}

/** Ranked mode: AI ideas for one member to pick from (does NOT add candidates). */
export function getDestinationIdeas(token: string, slug: string, top_n = 6) {
  return apiFetch<IdeasResponse>(
    `/rooms/${slug}/destinations/ideas?top_n=${top_n}`,
    token
  );
}

export interface FlightEstimate {
  flight_min_gbp: number;   // cheapest return fare found for the dates
  flight_max_gbp: number;   // dearest return fare found for the dates
  is_live: boolean;
}

/** Live rough return-flight prices per candidate IATA (from London, for the
 *  agreed window). Empty object when dates aren't set or the API is unavailable. */
export function getFlightEstimates(token: string, slug: string) {
  return apiFetch<Record<string, FlightEstimate>>(
    `/rooms/${slug}/destinations/flight-estimates`,
    token
  );
}

export interface GroupRecommendation {
  iata_code: string | null;
  name: string | null;
  reasoning: string | null;
  members_responded: number;
  members_total: number;
  est_daily_living_gbp?: number | null;
  est_flight_return_gbp?: number | null;
}

/** ONE AI pick for the whole group, weighing everyone's preferences. */
export function getGroupRecommendation(token: string, slug: string) {
  return apiFetch<GroupRecommendation>(`/rooms/${slug}/destinations/recommend`, token);
}

/** Ranked mode: submit a full 1..N ranking of all candidates and lock in. */
export function submitRanking(
  token: string,
  slug: string,
  rankings: { candidate_id: string; rank: number }[]
) {
  return apiFetch<VoteStatus>(`/rooms/${slug}/destinations/rank`, token, {
    method: "POST",
    body: JSON.stringify({ rankings }),
  });
}

export interface SuggestResponse {
  candidates: DestinationCandidate[];
  reasoning?: string | null;   // Gemini's rationale for these picks
}

export function suggestDestinations(token: string, slug: string, top_n = 5) {
  return apiFetch<SuggestResponse>(
    `/rooms/${slug}/destinations/suggest?top_n=${top_n}`,
    token
  );
}

export function proposeDestination(token: string, slug: string, iata_code: string) {
  return apiFetch<DestinationCandidate>(
    `/rooms/${slug}/destinations/propose?iata_code=${encodeURIComponent(iata_code.toUpperCase())}`,
    token,
    { method: "POST" }
  );
}

export function deleteDestinationCandidate(
  token: string,
  slug: string,
  candidate_id: string
) {
  return apiFetch<void>(`/rooms/${slug}/destinations/${candidate_id}`, token, {
    method: "DELETE",
  });
}

export function voteDestination(
  token: string,
  slug: string,
  candidate_id: string,
  vote_value: number
) {
  return apiFetch(
    `/rooms/${slug}/destinations/${candidate_id}/vote?vote_value=${vote_value}`,
    token,
    { method: "POST" }
  );
}

export interface VoteStatus {
  votes_revealed: boolean;
  voters_done: number;
  voters_total: number;
  i_submitted: boolean;
  // How many members have filled in their destination preferences (questionnaire).
  prefs_submitted: number;
}

export function getVoteStatus(token: string, slug: string) {
  return apiFetch<VoteStatus>(`/rooms/${slug}/destinations/vote-status`, token);
}

export function lockVotes(token: string, slug: string) {
  return apiFetch<VoteStatus>(`/rooms/${slug}/destinations/lock-votes`, token, {
    method: "POST",
  });
}

export function unlockVotes(token: string, slug: string) {
  return apiFetch<VoteStatus>(`/rooms/${slug}/destinations/unlock-votes`, token, {
    method: "POST",
  });
}

// ── Meet-up (by-the-minute) availability ──────────────────────────────────────
export interface MeetupSlot {
  start_min: number;   // minutes from midnight, inclusive
  end_min: number;     // exclusive
}
export interface MeetupMemberSlots {
  user_id: string;
  display_name: string | null;
  slots: MeetupSlot[];
}
export interface MeetupAvailability {
  meet_date: string | null;
  members_total: number;
  members_responded: number;
  per_member: MeetupMemberSlots[];
  overlap: MeetupSlot[];        // when EVERYONE who responded is free
  best_effort: MeetupSlot[];    // most-people-free fallback
  best_effort_free: number;
}
export function getMeetupAvailability(token: string, slug: string) {
  return apiFetch<MeetupAvailability>(`/rooms/${slug}/meetup`, token);
}
export function setMeetupSlots(
  token: string,
  slug: string,
  meet_date: string,
  slots: MeetupSlot[]
) {
  return apiFetch(`/rooms/${slug}/meetup`, token, {
    method: "POST",
    body: JSON.stringify({ meet_date, slots }),
  });
}

export interface DestinationPreferences {
  climate?: string | null;
  setting?: string | null;
  activity_level?: string | null;
  must_have?: string[];
  avoid?: string[];
  max_total_per_person_gbp?: number | null;
  free_text?: string | null;
  no_preference?: boolean;   // "I don't mind where we go — decide for me"
}

/** Mark (or clear) "I don't have a destination preference" for the caller. */
export function setDestinationNoPreference(
  token: string,
  slug: string,
  no_preference: boolean
) {
  return apiFetch(`/rooms/${slug}/destinations/no-preference`, token, {
    method: "POST",
    body: JSON.stringify({ no_preference }),
  });
}

export interface RandomPickResult {
  iata_code: string;
  name: string;
  total_cost_gbp: number | null;
}

/** 'Surprise us' — pick a random destination from the current candidates
 *  (weighted by vote count). Falls back to unweighted random if no votes. */
export function pickRandomDestination(token: string, slug: string) {
  return apiFetch<RandomPickResult>(`/rooms/${slug}/destinations/pick-random`, token);
}

export function submitDestinationPreferences(
  token: string,
  slug: string,
  body: DestinationPreferences
) {
  return apiFetch(`/rooms/${slug}/destinations/preferences`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Fetch the calling user's saved questionnaire answers (for pre-filling on revisit). */
export function getMyDestinationPreferences(token: string, slug: string) {
  return apiFetch<DestinationPreferences>(
    `/rooms/${slug}/destinations/preferences`,
    token
  );
}

export interface DurationBudgetAggregate {
  members_total: number;
  responses: {
    user_id: string;
    display_name: string | null;
    min_nights: number | null;
    max_nights: number | null;
    budget_gbp: number | null;
    flight_earliest?: string | null;
    flight_latest?: string | null;
    time_value_per_hour?: number | null;
  }[];
}

export function submitDurationBudget(
  token: string,
  slug: string,
  body: {
    min_nights?: number; max_nights?: number; budget_gbp?: number;
    flight_earliest?: string | null; flight_latest?: string | null; time_value_per_hour?: number | null;
  }
) {
  return apiFetch(`/rooms/${slug}/destinations/duration-budget`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getDurationBudget(token: string, slug: string) {
  return apiFetch<DurationBudgetAggregate>(
    `/rooms/${slug}/destinations/duration-budget`,
    token
  );
}

// ── Flights ───────────────────────────────────────────────────────────────────

export interface FlightResult {
  destination: string;
  destination_name: string;
  is_fully_viable: boolean;
  est_daily_living_gbp?: number | null;
  est_daily_living_low_gbp?: number | null;
  est_daily_living_high_gbp?: number | null;
  viable_count: number;
  total_group_money_cost: number;
  total_group_cost: number;
  avg_individual_cost: number;
  max_individual_cost: number;
  fairness_ratio: number;
  shared_out_date: string | null;
  shared_return_date: string | null;
  date_spread_days: number;
  note: string;
  computed_at?: string | null;
  people: PersonResult[];
}

export interface PersonResult {
  person_name: string;
  viable: boolean;
  over_budget?: boolean;
  chosen_airport: string | null;
  outbound_cost_gbp: number;
  inbound_cost_gbp: number;
  baggage_cost_gbp: number;
  ground_cost_gbp: number;
  ground_hours: number;
  ground_source?: string | null;   // "google_maps" | "estimate"
  ground_mode?: string | null;     // "transit" | "driving"
  outbound_date: string | null;
  inbound_date: string | null;
  total_money_gbp: number;
  total_inc_time_gbp: number;
  booking_link: string | null;
  note: string;
}

export function runFlightOptimiser(token: string, slug: string) {
  return apiFetch<FlightResult[]>(`/rooms/${slug}/flights/optimise`, token, {
    method: "POST",
  });
}

export function getFlightResults(token: string, slug: string) {
  return apiFetch<FlightResult[]>(`/rooms/${slug}/flights/results`, token);
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export function sendChatMessage(
  token: string,
  message: string,
  room_slug?: string,
  history: { role: string; content: string }[] = []
) {
  return apiFetch<{ reply: string }>("/chat", token, {
    method: "POST",
    body: JSON.stringify({ message, room_slug, history }),
  });
}

// ── Public room summary (no auth) ─────────────────────────────────────────────

export interface PublicRoomSummary {
  name: string;
  destination_iata: string | null;
  agreed_start: string | null;
  agreed_end: string | null;
  member_count: number;
  avg_cost_pp: number | null;
  destination_name: string | null;
}

export async function getPublicRoomSummary(slug: string): Promise<PublicRoomSummary> {
  const res = await fetch(`/api/rooms/${slug}/summary`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ── Live price ────────────────────────────────────────────────────────────────

export interface LivePrice {
  price_gbp: number;
  airline?: string | null;
  found_at?: string | null;
  deep_link: string;
}

/** On-demand fresh price for a specific person's route + exact dates. */
export function getLivePrice(
  token: string,
  slug: string,
  params: { origin: string; destination: string; depart: string; return_date: string }
) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch<LivePrice>(`/rooms/${slug}/flights/live-price?${qs}`, token);
}

/** Log a predicted-vs-actual fare (best-effort, for accuracy tracking). */
export function logPriceCheck(
  token: string,
  slug: string,
  body: { destination: string; origin: string; predicted_gbp: number; actual_gbp: number }
) {
  return apiFetch<void>(`/rooms/${slug}/flights/price-check-log`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface PriceAccuracy {
  count: number;
  avg_abs_pct_error?: number | null;
  avg_signed_pct_error?: number | null;
  calibration_active?: boolean;
  calibration_adjust_pct?: number | null;
}

/** App-wide accuracy of our flight predictions vs live fares. */
export function getPriceAccuracy(token: string, slug: string) {
  return apiFetch<PriceAccuracy>(`/rooms/${slug}/flights/price-accuracy`, token);
}

/** Diagnostic: run the LIVE Travelpayouts Search API for one route to verify it. */
export function testLiveSearch(
  token: string,
  slug: string,
  params: { origin: string; destination: string; depart: string; return_date: string }
) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch<{ ok: boolean; note?: string; price?: number; airline?: string; booking_url?: string }>(
    `/rooms/${slug}/flights/live-search-test?${qs}`,
    token
  );
}

// ── Feedback ──────────────────────────────────────────────────────────────────

export function submitFeedback(
  token: string,
  body: { rating?: number; comment?: string; page?: string; room_slug?: string }
) {
  return apiFetch<void>("/feedback", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface FeedbackItem {
  id: string;
  rating?: number | null;
  comment?: string | null;
  page?: string | null;
  room_slug?: string | null;
  created_at?: string | null;
  triage_category?: string | null;
  triage_status: string;
  user_email?: string | null;
}

/** App owner only: list all feedback (403 if not an owner). */
export function listAllFeedback(token: string) {
  return apiFetch<FeedbackItem[]>("/feedback/all", token);
}

/** App owner only: update a feedback item's triage. */
export function updateFeedbackTriage(
  token: string,
  id: string,
  body: { triage_status?: string; triage_category?: string; triage_notes?: string }
) {
  return apiFetch<void>(`/feedback/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
