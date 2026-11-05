-- 🧑‍🏫 A note to the parent after a shared-board lesson (SPEC-TUTOR-TOOLS §8; Adrian, 6 Nov 2026: "summary would
-- be a good thing to send to parents" → "yes"). The TUTOR makes it, edits it and sends it from their own
-- WhatsApp; the parent opens /p/<parent_key>, read-only. We never hold the parent's number.
alter table public.shared_boards add column if not exists parent_note jsonb;
alter table public.shared_boards add column if not exists parent_key text unique;
