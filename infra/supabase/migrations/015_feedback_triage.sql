-- Migration 015: feedback triage fields.
--
-- Lays the groundwork for AI-assisted feedback sorting: a category (bug /
-- feature_request / praise / other), a workflow status, and free-text notes.
-- The classifier that fills triage_category is currently a simple rule-based
-- stub (no AI wired yet) — swap it for Claude/Gemini later without schema change.

alter table public.feedback
  add column if not exists triage_category text,
  add column if not exists triage_status text not null default 'new',
  add column if not exists triage_notes text;
