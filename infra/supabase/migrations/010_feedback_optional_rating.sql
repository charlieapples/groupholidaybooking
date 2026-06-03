-- Migration 010: make the feedback star rating optional.
--
-- Users should be able to send plain-text feedback without picking a star
-- rating first. The existing CHECK (rating between 1 and 5) still holds for
-- non-null values (NULL passes a BETWEEN check), so we only drop NOT NULL.

alter table public.feedback alter column rating drop not null;
