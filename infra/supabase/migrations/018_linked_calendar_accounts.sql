-- Migration 018: permanently linked calendar accounts.
--
-- Lets a user link any number of Google / Microsoft accounts ONCE, then pull
-- their busy days into every future Holiday without re-granting permission.
--
-- We store the OAuth *refresh token* (encrypted) so the API can mint a fresh
-- access token on demand. RLS is enabled with NO policies: the browser (anon /
-- authenticated keys) can never read these rows — only the API's service-role
-- key (which bypasses RLS) touches them. Refresh tokens never reach the client.

create table if not exists public.linked_calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  account_email text,                 -- which account this is (for display)
  account_label text,                 -- optional friendly label
  refresh_token_enc text not null,    -- Fernet-encrypted OAuth refresh token
  scopes text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, provider, account_email)
);

create index if not exists linked_cal_user_idx
  on public.linked_calendar_accounts (user_id);

alter table public.linked_calendar_accounts enable row level security;
-- Intentionally no policies: service-role only. The browser must never read tokens.
