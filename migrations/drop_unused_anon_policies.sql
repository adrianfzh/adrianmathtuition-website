-- Phase G leak audit remediation (2026-08-14). NOT YET APPLIED — Adrian to approve.
--
-- Audit result: RLS is enabled on every public table, and every student/parent/
-- marking table returns ZERO rows to the anon key (live PostgREST probes,
-- 2026-08-14: paper_marking_runs, parent_digests, portal_invite_tokens,
-- admin_todos, portal_accounts, student_attempts, unit_events, recall_messages,
-- chat_*, kiosk_*, saved_papers, marking_batches, batch_uploads, questions,
-- student_revise_state/question_requests/outcome_ratings — all 0 rows).
--
-- Three tables carry anon policies that NO code path uses (website + bot both
-- reach them with the service key; no local tool uses the anon key on them):
--
--   worksheet_templates  — anon SELECT + INSERT + DELETE (!). Table is empty and
--                          orphaned (no code references it), but the anon key
--                          ships in the browser bundle, so anyone can write to
--                          or clear it today.
--   worksheet_exports    — anon SELECT + INSERT. Exposes worksheet-builder export
--                          logs (titles, question ids, blob URLs). No student PII.
--   prompt_lint_reports  — anon SELECT. Internal prompt-QA reports. No student data.
--
-- Dropping these policies cannot break anything: with RLS enabled and no
-- policy, only the service key (which bypasses RLS) sees the table — which is
-- already the only key any code uses on all three.

drop policy if exists "anon_delete_worksheet_templates" on public.worksheet_templates;
drop policy if exists "anon_insert_worksheet_templates" on public.worksheet_templates;
drop policy if exists "anon_select_worksheet_templates" on public.worksheet_templates;

drop policy if exists "anon_insert_worksheet_exports" on public.worksheet_exports;
drop policy if exists "anon_select_worksheet_exports" on public.worksheet_exports;

drop policy if exists "anon_read" on public.prompt_lint_reports;
