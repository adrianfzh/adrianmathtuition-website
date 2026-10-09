-- 📥 The staff inbox (9 Oct 2026): routine messages to Adrian, filed for the morning brief.
-- One row per message a job sent (or, once its family is switched off, would have sent). The
-- brief lists it in one line; a 📖 button returns `body` with its own buttons (`reply_markup`).
-- Applied to the math project on 9 Oct 2026. RLS on, no policies: service role only.
create table if not exists public.staff_inbox (
  id bigint generated always as identity primary key,
  family text not null,              -- 'followups', 'weekly-cost', 'waitlist-slot:<slot>' …
  label text not null,               -- the plain name the brief shows
  gist text,                         -- one line for the brief
  body text not null,                -- the whole message
  parse_mode text,                   -- 'HTML' | 'Markdown' | null
  reply_markup jsonb,                -- the message's own buttons
  dm_only boolean not null default false,   -- its buttons only work in the direct chat
  source text,                       -- 'website' | 'bot'
  sent_also boolean not null default true,  -- false once the family is switched off
  created_at timestamptz not null default now()
);
create index if not exists staff_inbox_created on public.staff_inbox (created_at desc);
alter table public.staff_inbox enable row level security;
