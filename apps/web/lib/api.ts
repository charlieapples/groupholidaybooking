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
}

export function getMyProfile(token: string) {
  return apiFetch<Profile>("/profile", token);
}

export function updateMyProfile(
  token: string,
  body: { default_home_postcode?: string; display_name?: string }
) {
  return apiFetch<Profile>("/profile", token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
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
}

export function createRoom(
  token: string,
  body: { name: string; rough_window?: string; home_postcode?: string }
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

export function deleteRoom(token: string, slug: string) {
  return apiFetch<void>(`/rooms/${slug}`, token, { method: "DELETE" });
}

export function leaveRoom(token: string, slug: string) {
  return apiFetch<void>(`/rooms/${slug}/leave`, token, { method: "DELETE" });
}

export function kickMember(token: string, slug: string, memberUserId: string) {
  return apiFetch<void>(`/rooms/${slug}/members/${memberUserId}`, token, { method: "DELETE" });
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
  is_admin: boolean;
  joined_at: string;
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

export interface DestinationPreferences {
  climate?: string | null;
  setting?: string | null;
  activity_level?: string | null;
  must_have?: string[];
  avoid?: string[];
  max_total_per_person_gbp?: number | null;
  free_text?: string | null;
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
  }[];
}

export function submitDurationBudget(
  token: string,
  slug: string,
  body: { min_nights?: number; max_nights?: number; budget_gbp?: number }
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
  chosen_airport: string | null;
  outbound_cost_gbp: number;
  inbound_cost_gbp: number;
  baggage_cost_gbp: number;
  ground_cost_gbp: number;
  ground_hours: number;
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
  params: { origin: string; destination: string; depart: string; return_date: string }
) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch<LivePrice>(`/flights/live-price?${qs}`, token);
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
