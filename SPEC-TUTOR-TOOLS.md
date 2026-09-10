# SPEC — Tools for tuition teachers

*Drafted 11 Sep 2026 at Adrian's request ("let's target solo tuition teachers first,
then later institutional — marking is already one of them"). A product spec, not a
build plan: what we sell, to whom, in what order, and what has to change in the code
for a second teacher to use it. Everything in the AdrianMath repos today is
single-tenant — built by Adrian for Adrian — and that is both the proof and the gap.*

## 1. Who, and why now

**First customer: the solo tuition teacher in Singapore** — one person, 15–60 students,
O-Level / A-Level maths first (because that is what the bank, the marker and the
calibration know). They teach in the evenings and do everything else at night. **Later:
the tuition centre** (§6) — the same jobs at scale plus the jobs that only exist when
there is more than one teacher.

The evidence for the order is Adrian's own build history: he built the marker first,
then the schedule, invoices and reminders, then the bank and generators. A tutor who
builds for himself builds what hurts most, in the order it hurts.

## 2. The three pain points, and the product for each

### 2.1 Marking and feedback — **Product 1, exists**

The pain: hours every week marking papers by hand, feedback that is a score and a few
ticks, and parents who never see any of it.

What we have: the whole marking line — hand-in from a phone or Telegram, the Mac /
Batch marker with the red pen in Adrian's voice, the cover page ("Where your marks
went"), auto-release, the student app to read it, Practice Again on request, the
calibration gate. For the teacher: the desk, overrides, the re-mark door.

What "sold to another tutor" needs (the multi-tenant delta, §4): the tutor's own students
and hand-in door, **their name on the cover and in the pen's voice**, their own
calibration row (the ±2 gate is per teacher — their marking is the truth for their
students), their own desk, their own daily cap and billing. The marking standard stays
Adrian's until a tutor's overrides say otherwise; that is a feature, not a gap.

### 2.2 The admin tail — **Product 2, exists for one tutor**

The pain: scheduling and rescheduling, make-up lessons, attendance, invoices and
receipts, chasing payment, year-end billing, and the WhatsApp traffic with parents that
wraps all of it. It is the part of the job nobody went into teaching for, and a solo
tutor does it at 11 pm.

What we have: the weekly schedule with capacity rules, reschedule chains and the
student's own Change door, attendance and end-of-day logging, monthly invoices with
PayNow and Stripe, payment reminders, receipts, the arrears cycle, the parent digest,
the Telegram bot as the parent channel, the health checks and the ops logbook.

What it needs: a tutor account that owns a schedule, students and rates; the Airtable
base per tutor (or a Postgres mirror — §4 decides); their own bot identity or a shared
bot that routes by tutor; PayNow QR per tutor; their own invoice template with their
name and bank. The reschedule and billing rules are already pure, tested library code
(`billing-math`, `reschedule-chain`, `year-end-billing`) and carry over unchanged.

### 2.3 Materials and "what next" — **Product 3, exists as Adrian's bank**

The pain: finding good questions by topic and level, assembling a worksheet or a paper
with an answer key, and — the harder half — knowing what to give *this* student after
*this* paper.

What we have: the question bank with sub-skill filing, the kiosk and bot worksheets, the
print-a-paper presets and GCE-format generation, the self-study sheet from a marked
paper, the find-a-question tiers, the teaching-knowledge layer.

What it needs: the bank served to other tutors under licence rules (originating-school
metadata never leaks — the kiosk gate already enforces that), a tutor's own uploads
filed alongside, and Practice Again in the tutor's name.

**The fourth pain, deliberately not a product:** getting students. Tutors would pay the
most for it, but it is marketing, not software. The referral loop and the SEO work stay
Adrian's own.

## 3. Packaging and price (a first shape — Adrian decides)

- **Marking** — per paper. Credits: a pack of marked papers; a tutor tops up. This is the
  shape already chosen for non-tuition students (a marked submission is the unit, never
  generation). A monthly plan with a paper allowance is the same thing with a floor.
- **Admin** — per month, per active student, flat. Cheap enough that "I'll keep my
  spreadsheet" loses.
- **Materials** — bundled with marking (Practice Again is marking's second half) and a
  print quota; the bank alone is not the product, the "what next" is.
- Everything the tutor's students see carries the tutor's name; AdrianMath is the
  engine, not the brand on the student's phone.

## 4. What must change in the code — the multi-tenant delta

This is the honest cost. Every table, route and job assumes one teacher.

- **Identity.** A `tutors` table and a tutor session; every student, run, invoice, slot,
  assignment and notebook row gains `tutor_id`; every admin route checks it; RLS by
  tutor on the tables students read.
- **Data home.** Airtable is Adrian's base. A second tutor either gets a base of their
  own (fast, fragile, one API key each) or the schedule/students/invoices move to
  Postgres with Airtable kept as Adrian's view. The second is the right one and the
  larger job; it is also the one that makes the admin product sellable.
- **Voice and name.** The pen, the cover, the Telegram messages, the invoice, the app
  shell: every "Adrian" becomes the tutor's name from their profile.
- **Marking standard.** Calibration rows per tutor; the auto-release switch and the
  Monday report per tutor; overrides become each tutor's own truth channel.
- **Channels.** One Telegram bot routing by tutor, or one bot per tutor (their own
  token, our code). Web hand-in and the student app are already per-account.
- **Billing.** Stripe customer per tutor; credits ledger; the per-paper meter.
- **Ops.** The health check, `job_runs` and alarms become per tenant, or at least name
  the tenant in every line.

Phase 0 is the cheapest real test: **one other tutor's students on Adrian's marking**,
by hand — a second "teacher" record, their students tagged to them, their name on the
cover, their own desk filter. No new data home, no billing code; a bank transfer for
the credits. It proves whether a tutor pays before the multi-tenant work is done.

## 5. Order

1. Phase 0 marking for one external tutor (weeks, not months).
2. Marking as a product: tutor accounts, credits, their name everywhere, calibration
   per tutor.
3. The admin tail on Postgres, tutor-owned, PayNow and Stripe per tutor.
4. Materials: the bank under licence, Practice Again in their name.
5. Then §6.

## 6. Tuition centres — the pain points that only exist at scale

A centre has every pain a solo tutor has, multiplied, plus three of its own:

- **Consistency across teachers.** Ten tutors mark ten ways and teach ten ways; the
  centre's promise to parents is one standard. This is exactly what a shared marking
  standard with per-teacher calibration and a central bank solves — the bridge from the
  solo product to the centre product is the calibration gate turned into a management
  view: who marks generously, who deviates from the scheme, which teacher's students
  improve.
- **Operations at scale.** Rooms, class timetables and teacher timetables that must
  agree, make-ups across classes, attendance for hundreds, fees with GST and receipts,
  arrears, teacher payroll from hours taught, parent messages that must go out the same
  way every time. The admin tail times two hundred students is a different product in
  scope, not in kind.
- **Retention.** Parents leave after an exam if they cannot see progress. Per-student
  progress reports that a centre manager can send in bulk, and an early-warning list
  (attendance dropping, marks dropping, no hand-ins) are what a centre will pay for.

Two more, smaller: staff churn (onboarding a new tutor onto the centre's materials and
standard in a day, not a month) and compliance (MOE registration paperwork, PDPA over
student data — a reason the private-notes rule in SPEC-NOTEBOOK-V2 §8 matters).
