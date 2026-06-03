-- Migration 011: destination voting "fairness style".
--
--   'ranked' (NEW DEFAULT): each member proposes exactly ONE destination, then
--      everyone ranks all candidates 1st→last. Winner = lowest total rank
--      points (Borda count).
--   'open'  (the original): free AI suggestions + 👍/😐/👎 voting.
--
-- In ranked mode the destination_votes.vote_value column holds the RANK
-- (1 = first choice); in open mode it holds the +1/0/-1 vote. Meaning is
-- decided by the room's voting_style.

alter table public.rooms
  add column if not exists voting_style text not null default 'ranked'
    check (voting_style in ('ranked', 'open'));
