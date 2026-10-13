-- Short links for long signed URLs sent on WhatsApp (13 Oct 2026, Adrian: "yes" to a short sign-up
-- link — the signed /signup?slotId=…&sig=… address was a wall of code in the chat).
-- /j/<code> on the website forwards to `url`; only our own site can be a target (check below).
-- Service role only (RLS on, no policies). Applied to nempslbewxtlikfzachi on 13 Oct 2026.
create table if not exists public.short_links (
  code        text primary key,
  url         text not null check (url like 'https://www.adrianmathtuition.com/%'),
  purpose     text not null default 'signup',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
alter table public.short_links enable row level security;
