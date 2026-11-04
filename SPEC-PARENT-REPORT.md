# 👪 Weekly parent report — SPEC

**Status (5 Nov 2026): BUILT on branch `claude/parent-report-f25ba8`, switched OFF for students**
(`PARENT_REPORT_OPEN_TO_STUDENTS = false` — admin + the preview student only). No parent has
been emailed. Waiting on Adrian: look at the two example reports, then say yes to open it.

## Why (Adrian, 4 Nov 2026)

Adrian: *"yes build it FOR THE APP"* — for the consumer app (App Store, Google Play, website),
not a Telegram feature for tuition students. His aim is data: more users → more practice →
more data. Streaks do not bring back an unmotivated student; pressure they already feel does.
In Singapore, parents are the strongest motivator, and they pay. A weekly report makes the
parent do the reminding and keeps them seeing value.

## What the parent gets (one screen, ~20 seconds)

1. **This week** — practice days, questions tried, right on the first try; papers marked (≤ 2
   listed, 3 or more → one line with the latest); weekly stretch set "x of y done".
2. **Going well** — at most two *plain wins*, only when the counts really show one:
   - a topic: first tries in the last 14 days vs the 6 weeks before, ≥ 4 first tries on each
     side, ≥ 3 right lately, up by ≥ 20 points → "Quadratics: 1/4 → 3/4 right on the first try";
   - papers in one subject: the last 14 days' marks pooled vs the 6 weeks before, ≥ 2 papers on
     each side, up ≥ 5 points → "A Math papers: 62% → 71%". (One paper against one paper was
     dropped on 5 Nov: a short topical set 32/69 against a full paper 81/90 showed a "rise"
     that was not real.)
3. **To work on** — ONE maths topic: marks lost on papers + wrong first tries + Notebook
   mistakes, last 28 days (90 when quiet). The kind of mistake is named only when one kind is at
   least half ("most lost marks here were sign mistakes (+ and −)").
4. **One action** — a 10-minute set (3 unseen Core questions on that topic, through the normal
   serving doors) and a green **Send to my child on WhatsApp** button. The message holds only
   `https://www.adrianmathtuition.com/app/focus` — the child opens it signed in.
5. **Nothing done this week** → "No practice this week. A 10-minute set on … is ready — send
   this link to …". No counts, no scolding.

Words: Singapore classroom plain English; no hype; never a comparison with other children;
never how anything is worked out (Adrian: data logic stays internal). A test fails the build if
a hype or comparison word appears (`lib/parent-report.test.ts`).

## How a parent is linked (consent)

1. Student: **Settings → Weekly report for a parent → Make a link for my parent** → "Send on
   WhatsApp" / "Copy link". The link is `/parent/join/<8 random letters>` (no name), lasts 7
   days, works once. Up to 3 parents per child.
2. Parent opens it: sees the child's first name, six plain points they agree to
   (`PARENT_NOTICE` in `lib/parent-report.ts`), types their email, ticks "I am … parent or
   guardian, and I agree", taps Confirm.
3. That is the consent: one row in **`consent_records`** (append-only — the database refuses an
   update or delete) with the notice version and a hash of the exact words, the channel, the
   time. Stopping adds a "withdrawn" row (`SPEC-COMPANY.md` §14.5 step 4).
4. The student's Settings card then says plainly "👪 A parent is linked (since 5 Nov). Every
   Sunday evening they get a short report…". A pending link can be cancelled by the student; a
   confirmed one is stopped by the parent ("Stop these reports" on every report) or by us.
5. A parent with several children is one `parent_contacts` row with several links; their page
   `/parent` (a 180-day cookie on the phone that confirmed) shows every child's latest report.

## Delivery

- **Sunday 7pm SGT** (`/api/cron/parent-report`, vercel cron `0 11 * * 0`, `JOB_RHYTHMS`
  `parent-report` 204 h): for each active link, build the week's report once into
  `parent_reports` (≈1 KB of numbers, no name) and email the parent (Resend, from
  `AdrianMath <hello@adrianmathtuition.com>`) with the WhatsApp button and a private link
  `/parent/r/<token>` — like a "track your parcel" link: it opens that ONE report, stops working
  after 14 days, read-only. `?dry=1` lists without building or sending.
- **In the app:** `/parent` is the parent view (the native shell can open the same page; a parent
  sign-in for the app comes with push).
- **Push later:** neither iOS shell has push yet (no `aps-environment`, no APNs key); the
  portal's web push (`lib/portal-push.ts`, VAPID) is for students only. When push lands, the
  cron sends the same `reportWords` as a notification that opens `/parent/r/<token>`. Needs:
  the Apple Developer org account, the Push capability + APNs key for the app id; FCM for
  Android when there is an Android shell.
- **Telegram** (existing tuition parents with `Parent Telegram ID`): not built; a secondary
  channel later.
- **WhatsApp sent BY us:** not built — business-started WhatsApp messages need an approved
  template and cost per message. The parent forwarding the set on WhatsApp costs nothing.

## Privacy (PDPA) — what is in place

Parent consent at linking (recorded, append-only) · the parent can stop at any time · the
student is told a parent is linked · report links expire after 14 days · a report only ever
reads the one child's rows · no names or ids in any address · the report's numbers are counted
in code, never by a model, and no model sees the report.

**Draft line for `/privacy`** (NOT added yet — add when the switch opens; Adrian to approve), under
"What we keep and why":

> **Weekly reports for parents.** If your child asks us to, and you confirm, we email you a short
> weekly summary of their practice and marked papers, and one thing to work on. We keep a record
> of your confirmation and your email address. Only your own child's work is shown. You can stop
> the reports at any time from any report, and your child can see in their app that a parent is
> linked.

## Data use (the Supabase org is near its quota)

Small columns everywhere; a paper's big `result_json` is read only for papers released in the
last 28 days (≤ 8), older papers by score only. A database function that sums lost marks per
topic inside the database (so `result_json` never leaves it) was written but **not applied** —
the permission check stopped it; it is a small saving and can be added later with Adrian's OK.

## Files

`lib/parent-report.ts` (pure: facts, wins, weak spot, words, codes, link signing, consent words)
· `lib/parent-report.test.ts` · `lib/parent-report-store.ts` (reads, the 10-minute set, email)
· `components/ParentReport.tsx` · `app/parent/{page,r/[token],join/[code],stopped}` ·
`api/parent/{join,stop}` · `api/portal/parent-link` · `app/settings/ParentLinkCard.tsx` ·
`app/focus/page.tsx` · `admin/parent-report/page.tsx` (preview any student, nothing saved) ·
`api/cron/parent-report` · `migrations/parent_reports.sql` (applied to the maths project 5 Nov
2026) · health check `parent-report`.

## Open questions for later

- Should a student of 18+ (JC2) be able to stop a parent's report themselves? Today only the
  parent (or we) can.
- The tuition parents already in Airtable (`Parent Email`): invite them directly instead of via
  the child? Not done — consent should come through the link either way.
