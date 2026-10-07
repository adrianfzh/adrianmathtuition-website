# Privacy page — parent-facing draft (item 15, 7 Sep 2026)

> The SHORT version below is the one on `/privacy` since 11 Sep 2026 (Adrian: "can you
> don't reveal the stack?" / "use the tuition address"): enough to meet the PDPA (purposes,
> consent, access/correction, retention, protection, overseas transfer, DPO contact, breach
> notice) without naming any service. `POLICY_VERSION` is `v2-2026-09`; the contact address
> is adrianmathtuition@gmail.com; the protection paragraph was cut to two sentences. The
> named-processor list at the bottom is internal reference only — it is NOT published.

> **VERSION 3 — 7 Oct 2026 (`POLICY_VERSION = 'v3-2026-10'`).** Adrian: "let's fix that sentence" · "can we
> not mention training of data?" · "the privacy page … says 'we may update this page from time to time' >
> let's do that too" · "add a short data clause to the terms the parent already ticks at registration > yes".
> What changed on `/privacy`: (1) the purpose line now reads "We use it only for tuition, and to improve our
> teaching and marking"; (2) the AI sentence is about the OUTSIDE services only — "not permitted to use your
> child's work for their own purposes" (the old "these tools are not permitted to train on your child's work"
> read as a promise that no model is ever trained on the work, which is no longer true: Adrian is building his
> own page reader from marked pages, names removed); (3) a "what changed" box at the top (`#changed`) and a
> "Changes to this page" section. Told to existing accounts by the app's one-time card
> (`lib/portal-announcement.ts`, id `2026-10-privacy-v3`, until 7 Nov 2026) and a 🔒 Privacy page row in
> Settings. `/terms` gained "Your Child's Information", so the PARENT agrees to the data use at registration.
> Basis as understood (not legal advice): PDPC's 2024 AI guidelines — the business-improvement exception
> covers using data already held to develop or improve one's own systems. STILL OPEN: the page says accounts
> are opened "only with a parent's or guardian's consent" while every `consent_record` says
> `consented_by: 'student'`; and no per-student "leave my pages out" mark exists yet.
> The draft text below is version 2 as written in September.

---

**Privacy at AdrianMath** · Version 2 · September 2026 · Adrian's Math Tuition, Singapore

This page explains what the AdrianMath app keeps about your child, why, how long, and what
you can ask us to do. Accounts are opened only with a parent's or guardian's consent, given
through the invite sent to the parent's email.

**What we keep and why**

- Contact and account details: your child's name and school level, the email used to sign
  in, and your contact details as the parent, so we know whose work is whose and can
  reach you.
- Your child's schoolwork and our feedback on it: the work handed in, our marking and
  comments, practice done in the app, and questions asked, so we can mark the work,
  return it, and choose what to practise next.
- Tuition records: lessons, attendance and invoices, which Adrian already keeps as your
  tutor.
- App usage: when the app was last used and which parts, so we can keep it working and
  notice who needs a nudge.

We do not sell your child's data, show advertising, or use it for anything other than
tuition. Marking and feedback are produced with the help of AI tools that Adrian checks;
these tools are not permitted to train on your child's work.

**Who else handles it**

We use a small number of trusted service providers for hosting, storage, email and AI
processing, under contracts that limit them to our purposes. Some of them process data
outside Singapore; we only use providers that protect data to a standard comparable to
Singapore's Personal Data Protection Act. Work is sent for AI processing without your
child's name attached.

**How long we keep it**

While your child is a student with Adrian, and for up to 12 months after the account goes
quiet. Marked papers are Adrian's teaching record and are kept for as long as that record
is needed. If you ask us to remove anything earlier, we will, unless we must keep it for a
legal or accounting reason.

**Your choices**

- In the app's Settings you can download everything the app holds about your child, or
  delete the account.
- You can ask Adrian at any time to see, correct or delete data, or to withdraw consent.
  Withdrawing consent closes the account.
- Notifications and the messaging helper are optional.

**How it is protected**

Each account can only ever see its own records. Connections are encrypted, access is
limited to what each part of the system needs, and student work is never written into
logs. If we ever learn of a data breach affecting your child, we will tell you, and the
Personal Data Protection Commission where the law requires it.

**Contact**

Adrian Fong is the tutor and the data protection officer. Message him directly or email
adrianmathtuition@gmail.com for questions, corrections or complaints.

---

## Internal reference only — the actual processors (do not publish)

Anthropic (marking, feedback, Ask; part of marking runs on Adrian's Mac) · Google Gemini
(annotation placement) · OpenAI (text embeddings for question matching) · Supabase
(database + private file store, Singapore) · Vercel (hosting; legacy Blob files) · Fly.io
(marking service + Telegram bot, Singapore) · Airtable (tuition records, US) · Resend
(email) · Telegram (optional bot) · Dropbox (one-month working copy of marked papers and
sheets, `dropbox-tray` cron) · Stripe / HitPay (self-serve passes only) · Sentry (error
reports, production only) · Apple / Google push services (notifications).

Retention as enforced today: practice data + clippings + notebook purged 12 months after
inactivity (`/api/cron/retention`; the notebook + clippings part was only built 5 Oct 2026 —
before that this line was ahead of the code; since 5 Oct 2026 also Ask questions, essays,
humanities answers and the app-use log, never a current tuition student's); marking runs and hand-in photos have NO automatic
expiry yet (docs/RETENTION.md classes 1–2 await Adrian's decision); Dropbox copy removed
30 days after release. The short page's wording is true under today's behaviour.

Delete my account (5 Oct 2026, Adrian: "delete them, except what's on marked papers"):
erases everything the app keeps — notebook, clippings, private notes, Ask log, essays,
humanities answers, pen marks on worksheets and practice, the app-use log, the photos
sent for practice sheets, practice answers, assignments, passes' account link, the login —
and KEEPS the marked papers with what is on them (the hand-in photos, the marking, and
the student's own writing on the marked paper), Adrian's teaching record. The list is
`src/lib/erasure.ts`. Backups: our copies follow within about three months (file copies
30 days after the source file goes, monthly database copies kept 3 months). The short
public page stays true as written.

