-- alert_notices (4 Nov 2026) — the Telegram alerts to Adrian that are still "open".
-- Adrian, 4 Nov 2026: "if it's okay, why not just delete the message?" → "Yes, as a rule".
-- An alert about a state that can end by itself (down, stuck, waiting, full, failing) keeps
-- the sent message's id here under one key per state; when the state ends, the sender
-- deletes every open message for that key (Telegram allows 48 h) or, when one is too old
-- or its id was not kept, sends ONE short "… again" line. Then the rows are marked cleared.
-- Written by the bot (lib/alert-notices.js, scripts/notify-adrian.js --alert-key /
-- --clear-alert, so the Fly worker shell too) and the website (src/lib/alert-notices.ts).
create table if not exists public.alert_notices (
  id          bigserial primary key,
  key         text not null,
  chat_id     text,
  message_id  bigint,
  thread_id   bigint,
  text        text,
  sent_at     timestamptz not null default now(),
  cleared_at  timestamptz
);
create index if not exists alert_notices_open_key on public.alert_notices (key) where cleared_at is null;

alter table public.alert_notices enable row level security;
grant select, insert, update, delete on table public.alert_notices to service_role;
grant usage, select on sequence public.alert_notices_id_seq to service_role;
