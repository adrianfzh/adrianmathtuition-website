# Privacy page — parent-facing draft (item 15, 7 Sep 2026)

> Draft text for `/privacy`, written for parents in plain words. Not yet on the page.
> When it goes live: bump `POLICY_VERSION` in `src/lib/portal-consent.ts` and the
> version label on the page. Lines marked ⚠ describe a rule the code does not
> enforce yet — either build the rule (docs/RETENTION.md has the plan) or soften
> the words before publishing.

---

**Privacy at AdrianMath** · Version 2 · September 2026 · Adrian's Math Tuition, Singapore

This page explains, in plain words, what the AdrianMath app keeps about your child, who
else handles it, how long we keep it, and what you can ask us to do. Most students are
under 18, so an account is only opened after a parent or guardian agrees, through an
invite sent to the parent's email.

**What we keep**

- Your child's name, school level, school, and the email used to sign in. Your name,
  email and phone number as the parent.
- Photos of the papers your child hands in, and the marked copies we return.
- The marks, the comments on each question, and a record of the kinds of mistakes made,
  so practice can target the right things.
- Practice questions attempted in the app and the feedback given.
- Questions your child asks the maths helper (Ask) and the answers, so Adrian can see
  what is causing trouble.
- Lesson dates, attendance, and invoices, which Adrian already keeps as your tutor.
- Basic usage such as when the app was last opened, which helps Adrian notice who is
  not using it.

**What we use it for**

Only to teach your child: marking the work, returning it, choosing what to practise
next, and showing Adrian what to cover in lessons. We do not sell any of it, show
advertising, or use it for anything unrelated to tuition.

**Who else handles it**

Running an app means using a few services. None of them may use your child's data for
their own purposes, and none of the AI services train their models on it.

- Anthropic (Claude) does the marking, the practice feedback and the maths helper.
  Photos and questions are sent without your child's name. Part of the marking also
  runs on Adrian's own computer.
- Google (Gemini) looks at the page image once more after marking, so ticks and comments
  land beside the right line. No name is sent.
- OpenAI turns question text into a searchable form so we can find similar questions.
  Only the question text is sent.
- Supabase stores the database and the private file store (photos, marked copies), in
  Singapore, encrypted. Files can only be opened from a signed-in account.
- Vercel hosts the website. Fly.io hosts the marking service and the Telegram bot, in
  Singapore.
- Airtable holds the tuition records: names, contact details, lessons, invoices.
- Resend sends our emails (invites, sign-in links, invoices).
- Telegram, if your family chooses to use the bot: messages and photos pass through
  Telegram under Telegram's own terms. Everything the bot does is also available in
  the app.
- Dropbox holds a working copy of each marked paper and practice sheet for about one
  month, so Adrian can check and hand-write on them. The copy is removed a month after
  the paper is returned.
- Stripe or HitPay handle payment only if you buy an app pass online. Tuition families
  pay by the usual invoice and none of your card details ever reach us.
- Sentry receives error reports from the website so we can fix faults. Reports do not
  include your child's work.
- Apple and Google deliver the "your paper is marked" notifications if your child turns
  them on.

**How long we keep it**

- While your child is a student with Adrian, everything stays so progress can be seen
  over time.
- Practice work, notebook entries and clippings are removed 12 months after the account
  goes quiet.
- ⚠ Hand-in photos are removed 12 months after the paper was marked. The marked copy is
  kept for 24 months as Adrian's teaching record, then removed.
- The Dropbox working copy goes one month after the paper is returned.
- Lesson and invoice records are kept as long as accounting rules require.

**Your choices**

- In the app's Settings your child (or you) can download everything the app holds, or
  delete the account. Deleting removes the account, practice work, notebook and
  clippings straight away. Marked papers follow the timing above.
- You can email Adrian at any time to see, correct or delete data, or to withdraw
  consent. Withdrawing consent closes the account.
- Notifications, the Telegram bot and the "Ask" helper are all optional.

**How it is protected**

Each account can only ever read its own records; this is enforced inside the database,
not just on the screen. Connections are encrypted. Access keys are limited to what each
service needs. Student work is never written into server logs. If we ever learn of a
breach affecting your child, we will tell you, and the PDPC where the law requires it.

**Children**

Accounts are opened by parents, not by students on their own. If your child is under 13
and you would rather they used the app only with you, tell Adrian and we will set it up
that way. You can ask what is held about your child at any time.

**Contact**

Adrian Fong is the tutor and the data protection officer. Message him directly or email
ablnon@hotmail.com. Questions, corrections and complaints all go to the same place.
