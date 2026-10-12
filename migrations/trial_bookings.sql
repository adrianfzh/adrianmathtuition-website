-- Trial lessons a new parent books and pays for on WhatsApp by themselves (12 Oct 2026, Adrian:
-- "allow parents to book trial lesson on their own … they need to pay for the trial lesson, to be
-- refunded when trial lesson is completed" + "after the trial lesson, ask if student will
-- continue … amount will be used to offset the first invoice. if not continuing, then put
-- request for refund"). One row per booking; SPEC-TRIAL-BOOKING.md.
--
-- status: awaiting_payment → booked → asked → continuing → signed_up (fee taken off the first bill)
--                                         ↘ declined → refunded
--         booked/asked → no_show | cancelled | no_reply (Adrian decides; Refund button)
--         paid but the slot filled meanwhile → slot_full (Adrian picks a time or refunds)
-- Service role only (RLS on, no policies): the bot and the website write it, nobody reads it
-- from a browser.
-- Applied to adrianmathtuition (nempslbewxtlikfzachi) on 12 Oct 2026.
create table if not exists public.trial_bookings (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  phone             text not null,               -- +65…, E.164
  student_name      text not null,
  level             text not null,               -- 'Sec 3', 'JC1', …
  subjects          text not null,               -- 'E Math & A Math', 'H2 Math', 'Math'
  slot_id           text not null,               -- Airtable Slots record id
  slot_label        text,
  trial_date        date not null,               -- SGT calendar date
  amount_cents      integer not null check (amount_cents > 0),
  status            text not null default 'awaiting_payment',
  stripe_session_id text,
  payment_intent    text,
  paid_at           timestamptz,
  lesson_id         text,                        -- Airtable Lessons record (Type Trial)
  asked_at          timestamptz,
  reminded_at       timestamptz,
  flagged_at        timestamptz,
  refund_requested_at timestamptz,
  refunded_at       timestamptz,
  stripe_refund_id  text,
  invoice_id        text,                        -- first invoice the fee was taken off
  note              text
);
create index if not exists trial_bookings_phone_idx  on public.trial_bookings (phone, created_at desc);
create index if not exists trial_bookings_status_idx on public.trial_bookings (status, trial_date);
create unique index if not exists trial_bookings_lesson_idx on public.trial_bookings (lesson_id) where lesson_id is not null;
alter table public.trial_bookings enable row level security;
