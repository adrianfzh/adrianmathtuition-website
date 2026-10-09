-- Worksheet picker: one-step undo for the saved state (9 Oct 2026 — a reset wiped
-- Adrian's worksheet column). Every state write keeps the previous value in prev_state,
-- and a write that would EMPTY the worksheet column while the previous state had picks
-- is kept only in prev_state (the page re-reads it on open). Applied 9 Oct 2026.
alter table public.worksheet_picks add column if not exists prev_state jsonb;
