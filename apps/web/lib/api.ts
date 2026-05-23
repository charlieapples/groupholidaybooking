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
  return res.json() as Promise<T>;
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
}

export function listDestinations(token: string, slug: string) {
  return apiFetch<DestinationCandidate[]>(`/rooms/${slug}/destinations`, token);
}

export function proposeDestination(token: string, slug: string, iata_code: string) {
  return apiFetch<DestinationCandidate>(
    `/rooms/${slug}/destinations/propose?iata_code=${iata_code}`,
    token,
    { method: "POST" }
  );
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

// ── Flights ───────────────────────────────────────────────────────────────────

export interface FlightResult {
  destination: string;
  destination_name: string;
  is_fully_viable: boolean;
  viable_count: number;
  total_group_cost: number;
  avg_individual_cost: number;
  max_individual_cost: number;
  shared_out_date: string | null;
  shared_return_date: string | null;
  people: PersonResult[];
}

export interface PersonResult {
  person_name: string;
  viable: boolean;
  chosen_airport: string | null;
  outbound_cost_gbp: number;
  inbound_cost_gbp: number;
  ground_cost_gbp: number;
  total_money_gbp: number;
  booking_link: string | null;
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
