-- 🎬 Short-video links (5 Nov 2026, SPEC-CLIP-PIPELINE.md §10): one row per visit to
-- adrianmathtuition.com/s/<code>, so Adrian can see which "common trap" Short brought people in.
-- No personal data: the code, the time, the site the visit came from (host only) and whether the
-- visitor looked like a robot. No IP, no user agent, no cookie value.
create table if not exists public.short_link_clicks (
  id          bigint generated always as identity primary key,
  code        text not null,
  clicked_at  timestamptz not null default now(),
  from_host   text,
  likely_bot  boolean not null default false
);
create index if not exists short_link_clicks_code_at on public.short_link_clicks (code, clicked_at desc);
alter table public.short_link_clicks enable row level security;
grant select, insert, update, delete on table public.short_link_clicks to service_role;
