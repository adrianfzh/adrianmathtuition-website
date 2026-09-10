-- Applied 11 Sep 2026 via the Supabase MCP (migration name portal_assignments_kind_page).
-- Send a page (SPEC-NOTEBOOK-V2 §12): a read-only page Adrian pushes to many
-- students at once is a fourth assignment kind — nothing to hand in, never
-- "to do" (website lib/assignments isPage). The old CHECK allowed only
-- question | worksheet | generated and the first send failed on it.
alter table public.portal_assignments drop constraint if exists portal_assignments_kind_check;
alter table public.portal_assignments add constraint portal_assignments_kind_check
  check (kind in ('question', 'worksheet', 'generated', 'page'));
