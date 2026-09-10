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

**Calibrate their own marking — the harness (Adrian, 11 Sep 2026: "able to let
tutors calibrate their own marking? build them the harness").** Adrian's standard is
the default; a tutor's own marking becomes THEIR truth the same way his does today:

- *What exists:* `calibration_results` (one row per script — AI marks vs a trusted
  human marking, per question), the ±2 gate + 10-paper minimum on `/admin/calibration`,
  the eval harness (`scripts/eval-mark-model.js --truth --save`), the desk's Override
  as the truth channel after release, the science "Your teacher's mark" box.
- *The harness for a tutor:* a **Calibration tab on their desk**. Step 1 — they hand in
  five to ten scripts they have ALREADY marked, with their marks per question typed in
  a short form (or their mark scheme + totals). Step 2 — the marker marks the same
  scripts blind. Step 3 — the tab shows the agreement per question and per script, the
  gate (within ±2 on 90 % of papers), and where the marker is stricter or kinder than
  they are. Step 4 — every override they make after release adds to their row. All of
  it per tutor: their rows, their gate, their trend.
- *How the model extracts a tutor's marks — three doors, best first (Adrian, 11 Sep
  2026: "allowing tutors to annotate over the marked copy of the marker, then uploading
  it again, then model extracts the marking style — isn't that better?" Yes):*
  1. **Annotate the marked copy.** The tutor opens the marker's marked PDF (Preview on an
     iPad, any PDF annotator, or the ✏️ Annotate overlay), writes over it the way they
     mark by hand — crosses out a tick, changes a mark, writes "no units, −1" — and
     hands it back. The pages are rasterised with the ink and a vision pass reads them
     WITH the original marking as context (it already knows every part, its box, the
     mark awarded, the comment), so it reads only what changed: `{part, original,
     tutor's mark, what they wrote}`. A one-screen summary ("you changed 7 of 33 parts")
     is confirmed by the tutor before anything becomes truth — the checkpoint. This is
     the natural workflow (they mark by hand anyway) and it captures the WHY, not just
     the number. Convention printed on the cover: write the new mark beside the box,
     cross out what you disagree with, one line why.
  2. **Agree / Override on the desk** — in-app, no paper, already built for Adrian.
  3. **The typed form** — marks per question for scripts marked before the tool
     existed; fallback only.
  The style comes from the notes, not the numbers: recurring reasons ("no marks for a
  bare answer", "units every time") are extracted as candidate rules into the tutor's
  marking profile, shown as a list they approve — never applied silently.
- *What is missing to make it change behaviour:* today overrides are a record, not a
  dial. A tutor **marking profile** — leniency per error kind, scheme strictness,
  method-mark rules — derived from their calibration rows and read by the marker's
  prompt, is the piece that turns "measured" into "marks like me". Phase 0 ships the
  measurement (the tab); the profile follows once one tutor's rows exist.

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

**Payment collection — later, specced now (Adrian, 11 Sep 2026).** Two shapes, in order:

1. **Direct to the tutor** (first): each invoice carries the tutor's own PayNow QR
   and a Stripe payment link on the tutor's own Stripe account; parents pay the tutor,
   never us. We reconcile — HitPay/Stripe webhooks mark the invoice paid, a bank-statement
   upload matches PayNow references — and send the reminders and receipts. No money
   passes through AdrianMath, so no payment-services licensing question, no payouts,
   no float. Priced inside the admin plan.
2. **Collect on their behalf** (only if tutors ask): Stripe Connect, we collect and pay
   out weekly, a percentage fee. This is where MAS payment-services rules and chargeback
   liability begin; not before a tutor has asked for it twice.

What exists for both: the invoice engine, PayNow + Stripe rails, the payment reminder
and receipt crons, the arrears cycle. What is missing: a rail configuration per tutor
and the reconciliation UI a tutor can trust without Adrian in the loop.

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

## 6. Tuition centres — sell the standard, not the operations

Adrian, 11 Sep 2026: "those admin operations seem more work than what's worth (the
revenue that you can collect)". Agreed — a centre's rooms, class timetables, teacher
payroll and fee collection at scale are a different product with thin margins and
long sales cycles, and the incumbents already sell it. Not ours.

What a centre WILL pay for, and what we already have most of:

- **Consistency across teachers.** Ten tutors mark and teach ten ways; the centre's
  promise to parents is one standard. The marking line plus per-teacher calibration
  (§2.1) is that standard as a product: every teacher's marking measured against the
  centre's, a management view of who marks generously and who deviates from the scheme,
  and one bank of materials. The bridge from the solo product to the centre product is
  the calibration tab turned into a table of teachers.
- **Retention.** Parents leave after an exam when they cannot see progress. Per-student
  progress reports a manager sends in bulk, and an early-warning list (attendance
  dropping, marks dropping, no hand-ins) — the digest and the activity signals exist
  for one teacher already.

The rest — operations at scale, staff onboarding, compliance paperwork — stays out of
scope unless a centre pays for the two above first.
