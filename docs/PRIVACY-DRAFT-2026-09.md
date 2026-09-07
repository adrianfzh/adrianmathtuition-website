# Privacy page — parent-facing draft (item 15, 7 Sep 2026)

> The SHORT version below is the one Adrian wants on `/privacy`: enough to meet the PDPA
> (purposes, consent, access/correction, retention, protection, overseas transfer, DPO
> contact, breach notice) without naming any service or revealing the stack. Not yet on
> the page. When it goes live: bump `POLICY_VERSION` in `src/lib/portal-consent.ts` and the
> version label on the page. The named-processor list is kept at the bottom for internal
> reference only — it is NOT to be published.

---

**Privacy at AdrianMath** · Version 2 · September 2026 · Adrian's Math Tuition, Singapore

This page explains what the AdrianMath app keeps about your child, why, how long, and what
you can ask us to do. Accounts are opened only with a parent's or guardian's consent, given
through the invite sent to the parent's email.

**What we keep and why**

- Your child's name, school level and sign-in email, and your contact details as the
  parent, so we know whose work is whose and can reach you.
- Photos of the papers your child hands in, the marked copies, the marks and comments,
  practice attempts, and questions asked in the app. We use these only to mark the work,
  return it, choose what to practise next, and plan lessons.
- Lesson dates, attendance and invoices, which Adrian already keeps as your tutor.

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
ablnon@hotmail.com for questions, corrections or complaints.

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
inactivity (`/api/cron/retention`); marking runs and hand-in photos have NO automatic
expiry yet (docs/RETENTION.md classes 1–2 await Adrian's decision); Dropbox copy removed
30 days after release. The short page's wording is true under today's behaviour.
