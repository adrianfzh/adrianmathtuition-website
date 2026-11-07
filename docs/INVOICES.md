# Invoices & Email Delivery — detailed docs

> Split out of `CLAUDE.md` on 2026-08-04. **MANDATORY reading before touching
> invoice generation/regeneration, `/admin/invoices`, Resend email paths, or
> anything that changes a dollar amount.** Money logic rules (pure functions in
> `src/lib/` + tests) are in the root [`../CLAUDE.md`](../CLAUDE.md) Testing policy.

## Invoice Flow

1. `generate-invoices` (14th 7am) → counts lessons per enrollment → creates Draft invoices with Line Items JSON
2. `payment-reminder` (14th 8pm) → Telegram reminder
3. Admin reviews on `/admin/invoices` → adjusts amounts, approves
4. "Generate Missing PDFs" → `generate-pdf-batch` → Puppeteer → Vercel Blob → PDF URL in Airtable
5. `send-invoices` (15th **10am SGT** — `0 2 15 * *` UTC in vercel.json; Vercel fires crons up to ~20 min late, e.g. 10:18–10:20 on 15 Jul 2026) → Resend email with PDF attachment → marks Sent

**`/api/admin-invoices` GET windows PAID invoices to the last ~5 months** (`paidWindowCutoffISO` in `lib/invoice-month.ts`, unit-tested) so the Airtable scan doesn't grow a serial pagination page every ~2 months; unpaid/unsent are always included regardless of age; `?all=1` = full history (the month filter's "Earlier months…" option triggers it).

**That's the ADVANCE cycle — the only one that runs, every month, since 15 Sep 2026.** The second,
**arrears** cycle built for October to January (1st/2nd, `?mode=arrears`, same three routes,
same three steps) is DORMANT — no cron schedules it and `ARREARS_MONTHS` is empty. Exam-year students' advance invoices are cut short at their last
paper → **[§ Year-end billing](#year-end-billing-octjan--2026-09-02) is mandatory reading
before touching anything in Oct–Jan.**

**Two regeneration routes, one intent each — don't merge them:** `generate-pdf-batch` renders the invoice **as stored** (the ✏️ Amend form's manual line-item/credit edits, verbatim); `regenerate-invoice` (the ♻️ Regenerate button) **recalculates** line items from the current schedule (preserving manual `Line Items Extra`). **Issue Date is one shared rule for both** — `resolveInvoiceIssueDate(status, currentIssueDate, todayISO)` in `lib/invoice-month.ts` (unit-tested): a **Sent** invoice being regenerated is *reissued* → **today** (SGT, via `sgtTodayISO()`); a fresh Draft → the **15th**; an unsent Draft with a date → **preserved**. Never re-implement this in a route or the `admin-invoices` PATCH — an amended Sent invoice must carry today's issue date, and the split where one path stamped today and another preserved the old date is exactly the bug that put a stale 15 Jul date on Kiara's amended Aug invoice.

## Year-end billing (Oct→Jan) — 2026-09-02

**Replaces the old "prorated months" arrangement wholesale.** `PRORATION_MONTHS`,
`lib/prorated-lessons.ts` and the "manual arrears re-run" ritual are GONE (deleted
2026-09-02), and so is the same-day `lib/arrears-invoices.ts` build (`?arrears=1` crons,
`prorated-arrears` job rows — it billed June in arrears too and had no exam cut-off; its
one independent fix, `lib/regenerate-line-items.ts`, was kept). Rules now live in
**`lib/year-end-billing.ts`** (pure, unit-tested) and
nowhere else — never re-derive a cut-off date, a due date or an arrears month list in a
route. First month the machinery bills: **October 2026** (`ARREARS_BILLING_FROM`).

> **⚠ Superseded on 15 Sep 2026 (later the same day) — every month is advance-billed.**
> Adrian: "keep things simple — have all months run on advance by default. Allow parents
> to opt out of months (Nov and Dec), then we just have arrears payments for them."
> `ARREARS_MONTHS = []`, `OPTOUT_MONTHS = [11, 12]`. What that means in practice:
> - The 14th's advance run drafts EVERY active student for the next month, all year.
> - A parent's opt-out (the email button → `/holiday-optout`) or Adrian's per-date screen
>   writes Cancelled lesson records with the `Holiday opt-out` marker (since 1 Nov 2026 followed by `· by parent (email button)`, `· by Adrian (student page)` or `· by a Claude session` — docs/SCHEDULE.md); the advance
>   generator fetches those for the invoice month (`optoutDatesByStudent`) and passes
>   them to `invoiceMonthLessonDates` as exclusions, so a skipped month is simply not
>   drafted and a skipped date comes off the line items. Deadline = the 13th of the
>   month before (the 14th generates). A later opt-out → 🔁 Regenerate Invoice, which
>   re-projects from the month's live lesson records and so already honours it.
> - One-off lessons in a skipped month are booked as `Additional` and swept onto the
>   NEXT advance invoice — that is the "arrears for them". **Since 2 Nov 2026 the advance
>   run's extras window reaches back three months** (`advanceExtrasWindowStartISO`, from the
>   1st of the month three months before the run day, SGT); `Billed` stops a repeat. Before,
>   it was "15th of last month → run day", so a student with NO lessons in the billed month
>   (a whole skipped Nov/Dec) got no invoice that run and the next run's window had moved
>   on — their extras were never billed.
> - The exam-year cut-off (Lane A below) still applies; it is independent of arrears.
> - A non-exam-year October invoice carries `EXAM_PREP_NOTE` + `HOLIDAY_BILLING_NOTE` in
>   Auto Notes (PDF) and the email block's "How November and December are billed"
>   paragraph; both say advance like any other month, and the two deadlines.
> - The arrears machinery (Lane B below, `?mode=arrears`, the combined January) is
>   DORMANT: no cron schedules it (`vercel.json`), the route refuses any bill month not
>   in `ARREARS_MONTHS`, and its tests pin the dormant behaviour. Left in place in case
>   the rule swings back next year.

From October to January every student falls into exactly one of two lanes (the text
below describes the machinery as designed on 14 Sep 2026; see the box above for what
actually runs).

### Lane A — exam-year students: advance billing, cut short at the last paper

**Who:** Level `Sec 4`, `Sec 5`, or `JC2` — *except* IP students (`Subject Level = 'IP'`
or subject `IP Math`), who carry a Sec 4 label but sit no O-Level and go to Lane B.
`isExamYearStudent()`.

They stay on the normal 14th-of-the-prior-month advance cron. What changes is that their
projected lessons **stop at an automatic per-level cut-off** — the day of their last
national Maths paper, from the SEAB timetables (`EXAM_CUTOFFS`, one row per year):

| 2026 cut-off | Who | Paper |
|---|---|---|
| `2026-10-23` | Sec 4/5, **E Math only** | O-Level E Math Paper 2 |
| `2026-10-28` | Sec 4/5 taking **A Math** (and any unknown subject mix) | O-Level A Math Paper 2 |
| `2026-11-03` | JC2, **H1 Math only** | A-Level H1 Math paper |
| `2026-11-06` | JC2 (H2, and the default) | A-Level H2 Math Paper 2 |

- The enrollment **End Date still wins when it is earlier** (`effectiveEndISO`).
- **Sec 4/5:** the October invoice (generated 14 Sep) runs to the cut-off; there is **no
  November invoice** — the cut-off is before 1 Nov, so the advance run skips the student
  entirely and lists them under 🎓 *"Exams over — no November 2026 invoice"*.
- **JC2:** October is a normal full month; the **November** invoice (generated 14 Oct)
  runs to the cut-off; December is skipped for the same reason.
- A cut-short invoice carries an **Auto Note** naming the date and the paper
  (`examCutoffNote`, e.g. *"Lessons run up to Wed 28 Oct 2026, the last O-Level A Math
  Paper 2. No lessons are scheduled after the exams."*). That note is deliberate: the
  send cron's `isCleanRegular` refuses any invoice with a non-empty Auto Notes, so **every
  cut-short invoice is HELD for Adrian's review** instead of auto-sending (first year =
  eyes on it). They also show in the generator's Telegram under 🎓 *"Cut short at the
  exams"*, and get a 🎓 badge on their summary line.
- **The table must be extended every year.** An exam-year student billed in a year with no
  `EXAM_CUTOFFS` row is billed to month-end/End Date as if nothing happened, and the run
  posts ⚠️ *"No exam cut-off table for &lt;year&gt;"* to Telegram. SEAB publishes the next
  year's timetable around February — add the row then.

### Lane B — everyone else: arrears billing, December+January combined

**Who:** Sec 1–3, JC1, IP students, blank/unknown Level. `billingModeFor()` puts their
**November and December** on arrears (`ARREARS_MONTHS = [11, 12]`).

> **October is an ordinary advance month again — Adrian, 15 Sep 2026** ("Make advance for
> October"): school is in session, attendance is predictable, and the fee comes in on
> 15 Sep rather than 1 Nov. The first design (14 Sep 2026) had October in arrears too;
> the 14 Sep cron therefore drafted none of these students, and their October invoices
> were generated by hand on 15 Sep. Their October invoice carries `EXAM_PREP_NOTE` in Auto
> Notes ("Exams coming up? October lessons can be brought forward…") — on the PDF, and in
> the email's holiday block — which also HOLDS them from the auto-send like any noted
> invoice. The 1 Nov arrears crons no longer exist (`vercel.json` runs them 1 Dec and
> 1 Jan only), and `generate-invoices?mode=arrears` refuses a bill month that is not in
> `ARREARS_MONTHS`. The holiday note and the parent's opt-out page name the optional
> months from `ARREARS_MONTHS`, so they read "November and December" now.
>
> **What the parent is told (15 Sep 2026, Adrian: "what do parents/students see?"):**
> the October invoice carries `ARREARS_ANNOUNCE_NOTE` (PDF) and the email block's
> "How November and December are billed" paragraph — nothing in advance, November's
> invoice on 1 Dec for attended lessons, December's with January's on 1 Jan. Every
> non-exam-year ARREARS invoice then carries `arrearsCoverageNote` ("This invoice is for
> the lessons attended in November 2026…") on the PDF and, via `arrearsNoteFrom`, in the
> email — which also HOLDS them on the 2nd for a look in this first year.

- A run on the **1st of the following month** bills the month that just ended from lessons
  actually **attended**: 1 Nov bills October, 1 Dec bills November.
- **December is combined with January in ONE invoice generated 1 Jan**: stored `Month` =
  `"January 2027"` (canonical — one invoice per student per label, so the monthly
  generator can never double-bill), line items = December's attended lessons **plus**
  January's projected lessons. The PDF/email renders `"December–January 2027"` via
  `displaySpanMonth()` — the stored label stays canonical because `applyPriorBalance`
  fails closed on a span.
- The **14 Dec advance cron therefore skips January** for these students
  (`isCombinedJanuary`), and the 14 Sep / 14 Oct / 14 Nov advance crons skip Oct/Nov/Dec.
  Skipped students are not silent: the generator's Telegram lists them under
  ⏳ *"Billed in arrears on the 1st"* and ⏳ *"December + January combined on 1 Jan"*.
- **The advance run creates NOTHING for an arrears (student, month) pair — not even an
  extras-only invoice.** That was exactly the trap in the old prorated branch: a student
  with billable Additional lessons got an Additional-only invoice at cron time, which then
  made the real arrears run skip them and their attended lessons were never billed. Extras
  are swept by the arrears run instead.
- **A student who has already opted out** (15 Oct 2026, Adrian, after Zane's amended November bill invited the parent to opt out again): every bill email reads the student's optional-month lessons once per batch (`skippedMonthsLookup` in `lib/holiday-optout.ts`) and passes the fully-skipped months to `holidayNoteHtml`. All optional months still ahead skipped → no holiday note; some → a short note ("Zane is skipping November … Lessons in December carry on as usual", change link, away dates) without the opt-out pitch. A month counts as skipped only when it has an opt-out cancellation and no Scheduled Regular lesson.
- **Holiday opt-out** (Student profile → *Holiday opt-out*, `/api/admin/holiday-optout`)
  offers **Oct/Nov/Dec only** now (it used to include June): skipping a date cancels the
  lesson record, so the arrears run never bills it. For a Lane A student an opt-out changes
  nothing — their invoice is a projection; amend it by hand.
- The 12th/13th Telegram reminders (`invoice-reminder`, `pre-invoice-reminder`) append
  `advanceRunNote()` in Oct–Jan: who gets no draft on the 14th, and each exam group's
  cut-off inside the month (or a ⚠ when the year has no `EXAM_CUTOFFS` row).

### The calendar

Everything is SGT. Vercel fires crons up to ~20 min late.

> The three **arrears** rows (1st / 1st / 2nd, Dec–Jan) are DORMANT since 15 Sep 2026 — they are
> no longer in `vercel.json` (the banner at the top of this section). Kept for the day they return.

| When | Cron (UTC in `vercel.json`) | Whom | What it does |
|---|---|---|---|
| 14th 7am | `0 23 13 * *` `/api/generate-invoices` | Lane A (+ all students Feb–Sep) | Drafts next month, clamped at the exam cut-off. Lane B students for Oct/Nov/Dec/Jan are skipped and listed. |
| 14th 8pm | `0 12 14 * *` `/api/payment-reminder` | — | Telegram: update payments before tomorrow's 7am generation. |
| 15th 10am | `0 2 15 * *` `/api/send-invoices` | Lane A | Auto-sends only `isCleanRegular` invoices; cut-short ones are held. |
| **1st 8am**, Dec/Jan | `0 0 1 12,1 *` `/api/generate-invoices?mode=arrears` | Lane B (+ extras for everyone) | Bills the month that just ended from attendance; 1 Jan = Dec attended + Jan projected. |
| **1st 8pm**, Dec/Jan | `0 12 1 12,1 *` `/api/payment-reminder?mode=arrears` | — | Telegram: drafts made this morning, auto-send tomorrow 10am. |
| **2nd 10am**, Dec/Jan | `0 2 2 12,1 *` `/api/send-invoices?mode=arrears` | Lane B | Sends the 1st's drafts. Honours `pause_auto_send` exactly like the 15th. |

Which run a request is doing comes from `lib/invoice-run-mode.ts` — `?mode=arrears`
(cron) or `{mode:'arrears'}` (manual body); anything else, including a blank or unknown
mode, is the advance run. It also owns the `job_runs` names (`-arrears` twins) and the
arrears wording of the reminder Telegram.

The send cron's summary names WHY an invoice was held: `yearEndHoldReason` reads the Auto
Notes — *exam cut-off* / *attended lessons (exam-year student)* — before the generic
*note*; the hold logic itself is unchanged (`isCleanRegular`).

### What an arrears run actually bills

- **Regular lines** — every **Completed** lesson of **Type `Regular` or `Rescheduled`**
  dated inside the bill month (`arrearsMonthFormula`; `Rescheduled` counts because a moved
  lesson is still a lesson taught). One line per lesson, labelled with **its own slot** and
  charged at that slot's enrollment rate, so a two-slot student is billed correctly.
- **Never twice:** a lesson whose `Billing Month` names a month that was **advance-billed
  and already invoiced** is dropped (`paidInAdvance`). A September lesson moved into
  October — or a makeup for a September absence — sat inside the paid September invoice.
  "Invoiced" means an invoice of ANY type and ANY status, **Voided included** — the same
  reading as the generator's duplicate check ("voided on purpose, never recreate"), so a
  month Adrian chose not to charge can't resurface here. A lesson owned by an arrears
  month is never pre-paid (that invoice only ever carried lessons dated inside the month),
  and a month with no invoice at all was never paid. Blank `Billing Month` falls back to
  the lesson's own date-month.
- **Absent lessons are NOT billed in arrears** — the terms promise Oct–Dec are charged on
  attendance. (Advance months still bill the projected slot occurrence regardless.)
- **Unmarked lessons are NOT billed either.** A bill-month lesson still `Scheduled` on the
  1st is invisible to the run (it bills `Completed` only). The run lists them — Telegram ❓
  *"N October 2026 lessons still Scheduled (M students)"* with each student's dates, and
  `unmarked` in the JSON — so Adrian marks attendance and hits ♻️ Regenerate on that
  student's draft (a rebuild reads attendance again). Students who already hold an invoice
  for the label are left out of the list.
- **Exam-year students in an arrears month.** Lane A is *supposed* to be fully billed in
  advance, but a Sec 4 with Completed October lessons and no October invoice (a late Level
  change, an enrollment created after the 14th) is real money: the run drafts them from
  attendance with the Auto Note *"Billed for the lessons attended in October 2026."* —
  which HOLDS the invoice for review — and never projects January for them. Exam-year
  students still `Active` on 1 Jan (nobody ended the enrollment) are listed under 🎓
  *"still Active — no January lines drafted"*: end the enrollment, or bump the Level and
  Regenerate.
- **The month must be over.** `arrearsBillMonthEnded` refuses a run before the first day
  after the bill month (HTTP 400, *"October 2026 has not ended yet"*) — an early run would
  draft a partial month. The cron on the 1st always passes; a deliberate early manual run
  needs `{"force":true}`.
- **Extras sweep** — every billable Completed `Additional` lesson dated before the first
  day after the bill month, with a **3-month look-back** so an extra that fell between two
  runs is never stranded (`sweepAdditionalFor` / `sweepWindowStartISO`). The `Billed`
  checkbox is the double-billing guard and is ticked after the invoice is created; each
  swept extra is labelled with **its own** month, not the bill month. Revision makeups are
  excluded as always (`billableAdditionalFor`). The sweep runs for **everyone**, Lane A
  included.
- **Extras only → `Invoice Type = 'Adjustment'`.** If the student already holds a
  `Regular`/`Enrollment` invoice for the label (a Lane A advance invoice, or an earlier
  run), the regular lines are suppressed and only the extras are billed, on an
  `Adjustment` invoice — which the send cron holds for review, and whose email subject and
  PDF filename say *"Additional Lessons"* so the parent doesn't think they're paying the
  month twice. A student already holding an `Adjustment` invoice for the label is skipped
  outright.
- **Nothing to bill → no invoice.** Zero attended and zero extras produces one aggregate
  count line in the Telegram summary, not a per-student skip flag.
- **Enrollments:** the arrears run fetches `Active` **plus** `Ended` enrollments whose
  `End Date` falls on/after the bill month's first day — a student who left mid-October
  still attended October lessons — **plus** `Ended` ones with a blank `End Date`
  (`{End Date}=BLANK()`, clamped to the bill month's last day). None exist today (checked
  2026-09-02); the clause is there so a sloppy discontinue can't hide a month.
- **Dates:** Issue = **the 2nd** (the send day; a late manual re-run stamps today
  instead), Due = **issue + 7 days** (`ARREARS_DUE_DAYS`). Advance invoices keep the old
  rule, due on the **15th of the month they cover** — one function, `invoiceDueDateISO`,
  decides both; the old inline rule would have back-dated every arrears invoice into the
  past.

### Regenerating a year-end invoice (♻️)

`regenerate-invoice` reproduces whatever the run drafted, using the same libs:

- `arrearsMachineryCovers(year, month)` is checked **first** — anything before October
  2026 (a June 2026 rebuild, a 2025 invoice) was advance-billed under the old rules and
  rebuilds the old way. Don't "fix" an old invoice into the new shape.
- An **arrears-month** invoice rebuilds its regular lines from **attended** lessons.
  **Additional lines are kept as stored** — the run's sweep already ticked them `Billed`,
  so refetching would drop them; an extra added since is picked up by the NEXT run's sweep,
  not by a rebuild.
- The **combined January** invoice rebuilds as December attended + January projected.
- An **advance** rebuild of an exam-year student drops every regular lesson dated after the
  cut-off (the recurring lesson generator knows nothing about exams, so the rows exist).
- Every **advance** rebuild keeps its **Additional lines as stored** too
  (`lib/regenerate-line-items.ts`, tested): the generator bills extras from a rolling
  window that mostly falls outside the invoice month and ticks `Billed`, so re-deriving
  them from the month window used to drop every billed extra and re-add in-window ones
  unticked (double-billed by the next run). Fixed 2026-09-02 for every month.
- Due date follows the same `invoiceDueDateISO` rule as the run; Issue Date still goes
  through `resolveInvoiceIssueDate`.
- **A moved lesson is billed once, on the row that happens** (25 Oct 2026, Ian Chen's
  November: three Sundays moved to Saturdays rebuilt as 6 lessons / $480 instead of
  3 / $240). The advance rebuild skips an original with Status `Rescheduled`, bills the
  `Type = Rescheduled` replacement under the month in its `Billing Month` (fetched even when
  it is dated outside the month; left out when it names another month), and labels the line
  with the lesson's own slot. Holiday opt-outs (Cancelled) stay out as before. The 14th's
  advance run is not affected: it projects regulars from the enrollment's weekly slot and never
  reads lesson rows, so a move made before the 14th still shows the old dates and slot label,
  with the right count. Tested in `lib/regenerate-line-items.test.ts`. A scan of every 2026
  invoice that day found no other bill carrying both halves of a move.

### Manual re-runs

```
POST /api/generate-invoices   {"mode":"arrears","month":"October 2026"}   # redo a bill month
POST /api/send-invoices       {"mode":"arrears","month":"October 2026"}   # send that batch
GET  /api/payment-reminder?mode=arrears                                    # arrears reminder text
```
`{"month":"January 2027"}` means the **combined** invoice (December attended + January
projected), not January alone. Students who already hold an invoice for the label are
skipped, so re-runs are safe. A bill month that has not ended is refused (HTTP 400); add
`"force":true` to the body to override — you are knowingly drafting a partial month.

### June is untouched

June is billed in **advance** like any other month, with the flexible-attendance credit
note and the June Revision Sprint logic exactly as before. The old code listed June in
`PRORATION_MONTHS`, but that branch never produced an invoice — every June has gone out in
advance. `Cancelled - Prorated` remains a live **Lessons** `Status` option meaning "not
coming, not billed"; it has no billing behaviour of its own beyond being excluded like
`Cancelled` (it is not `Completed`, so an arrears run never sees it).

### File map

| File | Owns |
|---|---|
| `lib/year-end-billing.ts` (+ `.test.ts`) | Exam-year test, `EXAM_CUTOFFS` + `examCutoffFor`, `effectiveEndISO`, `billingModeFor`, `isCombinedJanuary`, `arrearsRunTarget`, `arrearsBillMonthEnded`, `invoiceDueDateISO`, `paidInAdvance`, `arrearsRegularLessonsFor`, `sweepAdditionalFor`, `unmarkedArrearsFormula` + `unmarkedByStudent`, `attendedReviewNote` + `yearEndHoldReason`, `advanceRunNote`, `arrearsMachineryCovers` |
| `lib/arrears-lines.ts` (+ `.test.ts`) | Line-item builders shared by the run and the rebuild — `attendedLessonLines`, `projectedLessonLines`, `additionalLessonLines`, `sumLineRates` |
| `lib/arrears-fetch.ts` | The Airtable window fetches (server-only, deliberately thin) — attended pool, still-Scheduled pool, invoiced-months map (Voided included), sweep pool. Field-name fallbacks: an unknown name in `fields[]` 422s the whole request, so `Billing Month` / `Is Makeup` / `Billed` are requested and retried without |
| `lib/regenerate-line-items.ts` (+ `.test.ts`) | The advance rebuild's line rule: regulars re-projected from the month's lesson rows, Additional lines kept as stored |
| `api/health-check` → `arrears-lessons` | Every 6h: fetches the attended pool for the month the next arrears run would bill, so a broken Lessons fetch alarms weeks before 1 Nov, not on it |
| `lib/invoice-run-mode.ts` (+ `.test.ts`) | advance vs arrears resolution, target month label, `job_runs` names, reminder text |
| `lib/billing-math.ts` (+ `.test.ts`) | `invoiceMonthLessonDates` (the one weekday walk), half-open `monthWindowClause`, `addDaysISO` |
| `lib/job-health.ts` | The three `-arrears` `JOB_RHYTHMS` rows, `months: [1, 11, 12]` |

> ⚠ History (the machinery this replaced, fixed 2026-09-02): from launch the prorated
> branch filtered `{Student}='recXXX'` — matches NOTHING on a linked field (CLAUDE.md
> Gotchas; the same bug class that unbilled every Additional lesson until 2026-07-26) —
> and ended its window `{Date}<='monthEnd'`, which drops lessons ON the month's last day.
> Net effect: **no prorated month had ever billed a single regular lesson**, even on manual
> arrears re-runs. `regenerate-invoice` carried the same inclusive-bound bug. Both are why
> every window in invoice code now goes through `monthWindowClause` and every pool is one
> fetch matched in JS. Regression tests live in the `monthWindowClause` block of
> `lib/billing-math.test.ts` and the arrears-selection block of `year-end-billing.test.ts`.

### Assumed, not confirmed — flag to Adrian before relying on these

Adrian approved the design above on 2026-09-02; these were decided by the implementation
and never explicitly confirmed:

1. **IP Sec 4 students are NOT exam-year** — `Subject Level = 'IP'` or subject `IP Math`
   puts a Sec 4 label into Lane B (arrears, like Sec 3).
2. **A blank/unknown `Level` defaults to arrears** (Lane B).
3. **An exam-year student with an unrecognised subject mix gets the LATER A Math cut-off**
   — over-billing one lesson is easier to amend than a missing one.
4. **An `Ended` enrollment with no `End Date` is clamped to the bill month's end** and
   billed for whatever it attended (fetched via `{End Date}=BLANK()`).
5. **A Voided invoice counts as "already invoiced"** for `paidInAdvance` — a lesson owned
   by a voided month is never re-billed in arrears (errs toward not charging).
6. **An exam-year student's Completed lessons in an arrears month ARE drafted** (held for
   review, never auto-sent) rather than silently skipped.
7. **June opt-outs are no longer offered** in the Holiday opt-out modal (Oct–Dec only),
   because June is billed in advance.

### Gaps — known, deliberate, listed honestly

- **A December lesson moved into January is billed by nobody.** The 1 Jan run's December
  pool is *lessons dated in December*, so the moved record (dated in January) isn't in it;
  and the January half is **projected from the weekly slot calendar**
  (`invoiceMonthLessonDates`), not read from the Lessons table, so it never sees the moved
  record either. `paidInAdvance` is not what drops it — it is never a candidate. If the
  move lands on the student's normal slot weekday the projection happens to cover that
  date anyway; a makeup on any other day is billed nowhere.
- **A student with unbilled extras but no qualifying enrollment is never swept.** The
  arrears run iterates enrollments, so someone with no `Active` enrollment and no `Ended`
  one whose `End Date` is on/after the bill month's first day (or blank) is simply absent
  from the run.
- **An exam-year student holding a January advance invoice with stray Completed December
  lessons is not billed for them.** The arrears run's per-student gate is *"do you already
  hold a `Regular`/`Enrollment` invoice for this label"*, not *"which lane are you in"*, so
  holding the January advance invoice suppresses the December regular lines; only the
  extras sweep still runs.
- **Absent lessons are never billed in arrears** — by design (attendance-based terms), but
  it does mean a no-show in an arrears month costs nothing, unlike an advance month.
- **The bot repo (`~/dev/adrianmath-telegram-math-bot`) has its own invoice code and
  knows nothing about any of this.** Anything it generates or amends for Oct–Jan follows
  the old advance assumptions — check it before letting it touch a year-end invoice.

## Ad-hoc lessons — booked one at a time, billed on demand (22 Sep 2026)

A lesson booked from the schedule's Add modal with type **Ad-hoc** carries its price in
`Charge Override`; the monthly generator never bills it. The student profile's
"Ad-hoc lessons to bill" card → `POST /api/admin/bill-adhoc {studentId}` makes ONE Draft
`Invoice Type = 'Adhoc'` invoice (a line item per lesson), stamps `Source Invoice` + `Billing Month`
on each lesson (the dedup key), and the normal Draft → PDF → preview → send flow follows.
The rules are pure in `lib/adhoc-billing.ts` (tested).

- **The price is PER LESSON.** The Rates table's `Amount` is the price of **four** lessons
  ($320 Secondary, $360 JC). `GET /api/admin/rate?level=&studentId=` prefills the student's own
  `Rate Per Lesson` (an Active enrollment first), else `Amount ÷ 4` (`adhocChargeDefault`).
  Until 22 Sep 2026 it prefilled the whole `Amount`, so every one of Kevin Seng's eleven ad-hoc
  lessons (Jul–Aug 2026) was booked at $320; they were corrected to $80 by hand.
- **A moved ad-hoc lesson is billed on the row that happened.** Rescheduling creates a
  `Type = 'Rescheduled'` row (`Makeup For` → the original) with no charge; the original becomes
  `Status = 'Rescheduled'`. `billableAdhocLessons` walks `Makeup For` back to an Ad-hoc origin,
  bills the Completed moved row ONCE at the first charge along the chain (the moved row's own
  first), and the line item keeps `movedFrom: '2026-07-26'` for the record. A moved REGULAR
  lesson is never picked up — the monthly invoice already covers it.
- The route refuses (400) when a lesson has no charge — set one on the lesson first.
- **The PDF shows ONE row: "Ad-hoc lessons · 9 · $720.00", and the dates go in Auto Notes under
  the table** ("Lessons on 13, 27 and 31 July; 3, 10, 18, 19, 21 and 23 August 2026.") — Adrian,
  22 Sep 2026: "simpler and looks better". The renderer folds line items with the same
  description into one row at the FIRST item's rate, so every lesson at one price shares the
  description "Ad-hoc lessons"; when prices differ each price gets its own
  ("Ad-hoc lessons at $90.00") — a shared description would bill them all at the first price
  (`adhocRowDescription`). Auto Notes prints on the PDF, so nothing internal goes there.
- The email has its own subject ("Ad-hoc Lessons — Invoice for July–August 2026 – <name>"),
  its own body (the lesson dates grouped by month, no term/holiday notes — `buildAdhocEmailHtml`)
  and its own attachment name (`…-Ad-hoc-Lessons.pdf`). Auto-send on the 15th skips it (Regular
  only), so it goes out by hand after the preview.
- **One file name for every invoice PDF — `invoicePdfFileName` (`lib/invoice-month.ts`).** The
  blob (generate-pdf-batch, `lib/invoice-pdf.ts`, regenerate-invoice) and the email attachment
  both use it: the span month ("July–August 2026") plus a suffix for a second invoice in the
  month (`-Ad-hoc-Lessons`, `-Additional-Lessons`, `-Revision-Sprint`). Before 22 Sep 2026
  generate-pdf-batch printed the stored Month ("August 2026", so the PDF's payment reference
  disagreed with the email's) and stored every PDF under `<name>-<month>.pdf` with
  allowOverwrite, so an ad-hoc PDF replaced that month's regular invoice PDF.

### Booked ad-hoc lessons billed AHEAD, and a class that starts later (3 Nov 2026)

Adrian, 3 Nov 2026, on Chantal (new: one-off Fri/Sun lessons 20 Nov – 27 Dec, then a weekly
Saturday class from 2 Jan 2027): *"give signup link, then issue invoice for november. on 15 nov,
issue for dec (based on the lessons agreed upon, and also for jan). every invoice will be issued
on 15th"* → "yes build it". Four changes:

- **The monthly run skips weeks before an enrollment's Start Date** (`invoiceMonthLessonDates`
  5th argument, `SlotLine.startISO`). Until now Start Date was ignored: Ian Chen's Saturday class
  from 2 Jan 2027 would have been billed every December Saturday on 15 Nov. A month wholly before
  the start shows in the run's skip list as "starts <date>". The bot's weekly lesson maker
  (`handlers/flows.js`, both loops) skips those weeks too.
- **A signup whose class starts after the next monthly run makes no bill at signup**
  (`signupBillsNow` in `lib/billing-math.ts`: bill now only from the 14th of the month before the
  start month). The run bills it on the 15th like everyone else; the welcome email says "Your first
  invoice will arrive separately".
- **Booked ad-hoc lessons are billed a month ahead.** The 14th's advance run drafts ONE `Adhoc`
  invoice per student for the ad-hoc lessons booked in the invoice month (Scheduled or Completed,
  no Source Invoice — `bookedAdhocLessons`), labelled with that month, and the 15th's send sends it
  unattended when clean (`isCleanAdhocInvoice`). Only that month's bookings: old Completed lessons
  left unbilled (Kevin Seng, Jul–Aug 2026) are never swept up. The student page's billing tab has a
  second card, "Ad-hoc lessons booked in <this month>" → **Bill <Month> now**
  (`POST /api/admin/bill-adhoc {studentId, month:'YYYY-MM'}`) for the current month. An `Adhoc`
  bill no longer counts as "already has this month's invoice" for the regular run.
- **A paid-ahead ad-hoc lesson that is cancelled is credited once** on that student's next bill made
  by the run (`cancelledPaidAdhoc` → a `Line Items Extra` line carrying `lessonId`, the dedup key;
  the stored PDF is cleared so the send renders a fresh one; the bill is then held for review). A
  paid lesson that is MOVED is not a credit (the moved lesson is already paid for). No bill that
  month → the run's Telegram says to give the credit by hand.

**Changed again on 3 Nov 2026 (supersedes "billed a month ahead" above):** one-off lessons are
billed on the 15th of the month they FALL IN, beside next month's regular invoice. Adrian:
*"send out Dec invoice on 15 Dec for the adhoc lessons in December as well as the lessons for
January"*. The 14th's run takes booked, unbilled ad-hoc lessons from the 1st to the end of the
CURRENT month (done or still to come) → ONE `Adhoc` bill labelled with this month; booked after
the 14th → the student page's button. Chantal: November billed at sign-up (button), December
ad-hoc + January Saturdays on 15 Dec. Xavier: November Saturdays on 15 Nov.

**And: one bill, not two (3 Nov 2026).** Adrian, on Xavier Neo getting two emails on 15 Nov
("Two invoices for Xavier on 15 Nov?") → "yes" to one bill. A student who gets a monthly bill in
the run has this month's booked one-off lessons put ON that bill, as their own line
(`adhocMonthlyLines`: "Extra lessons — 7, 14, 21 and 28 November 2026", 4 × $70), each lesson
stamped Source Invoice = that bill. Only a student with no monthly bill that month gets a separate
`Adhoc` bill. Xavier on 15 Nov: December (1, 8, 15, 29 Dec) $280 + November extras $280 = $560.

**Sign-up links are short (3 Nov 2026).** Adrian, on Chantal's long link: *"I thought we said to
shorten links?"* — the bot has shortened its sign-up links since 13 Oct (`lib/short-link.js` →
Supabase `short_links` → `/j/<code>`), but the website's `POST /api/admin-schedule/trial-signup-link`
never did. It now returns `url` = `https://www.adrianmathtuition.com/j/<code>` (same lifetime as the
signed link) and `longUrl` (`lib/short-link.ts`). Every sign-up link sent to a parent is the short one.
Later the same day (Adrian: *"is it possible to put the word "registration" or "signup" in the link?
still short links"*): a sign-up short link reads `https://www.adrianmathtuition.com/register/<code>`
(website `shortBaseFor`, bot `lib/short-link.js baseFor`); `/j/<code>` still works for older links and
other kinds. Both routes forward through `lib/short-link-forward.ts`.

**A leftover leaver bill rides the ad-hoc bill (3 Nov 2026).** Adrian, on Kayla Ang coming back
(one-off H2 lessons Nov–Jan at $90, weekly Sunday 5–7pm JC from 14 Feb 2027) while her $70
September final-extras bill was still waiting for 15 Nov: *"1 bill on 15 november -> remember that
we said to consolidate?"*. When the 14th's run drafts a student's separate ad-hoc bill, any of their
Draft final-extras bills (`FINAL_EXTRAS_FORMULA`) are copied in as lines (`draftAdhocInvoice`
`carryLines`) and the old bill is set `Voided`. Kayla on 15 Nov: 25 Sep $70 + 8, 15, 29 Nov 3 × $90
= $340, one email.

**Later on 3 Nov 2026:**
- **This month's booked ad-hoc lessons go on the 15th too.** Adrian, on Xavier Neo's four extra
  Saturdays in November: *"keep all invoices send on 15th November"*. The 14th's run takes booked,
  unbilled ad-hoc lessons from the 1st of the CURRENT month to the end of the invoice month, one
  `Adhoc` bill per month of lessons labelled with that month; the 15th's send also takes clean
  `Adhoc` drafts labelled with the current month (`previousMonthLabel`).
- **A slot switched ahead still bills until the old class ends.** Both switch flows (website
  `admin-schedule/switch`, bot `lib/slot-switch.js`) mark the OLD enrollment `Ended` at once with a
  future End Date. With Start Date respected, the months in between would have gone unbilled (Ian
  Chen: Sunday class to 1 Jan 2027, Saturday from 2 Jan — no December bill). The advance run now
  also takes `Ended` enrollments whose End Date reaches the month, billed up to that date.
- **A sign-up link can carry a note the parent reads** (`note` on
  `POST /api/admin-schedule/trial-signup-link`, SIGNED like the other params — param order
  slotId, level, subjects, subjectLevel?, trialLessonId?, startDate?, note?, expires). It shows
  under "You are registering for". Adrian, for Chantal: *"put a note saying that in November and
  December lessons will be adhoc lessons, and billed accordingly"*.

## Payment reminders on the 15th for students with no bill (4 Nov 2026)

Adrian: *"so any outstanding is currently also in the next invoice sent on the next 15th — how about
students who have graduated/discontinued and still have outstanding > let's send reminders on 15th
as well?"* → "yes, build it". An unpaid bill shows on a student's NEXT bill ("Previous balance",
`applyPriorBalance`); a student who has left gets no next bill, so nothing reminded their parent.

- **`/api/cron/overdue-reminders`, 15th 11am SGT** (after the 10am bills). For every student with no
  bill issued that day (`Issue Date` = today) and a bill that is `Sent`/`Overdue`, past its Due Date
  and not fully paid: ONE email listing every such bill, the total and one PayNow reference
  (`buildReminderEmail`, signed Adrian, same wording as the invoices page's "Send reminder" button).
- **Every 15th until paid; after the 3rd, no more emails** — the Telegram lists them with
  "follow up yourself". The count is the `EmailLog` rows of Type `payment_reminder` (not `failed`)
  linked to the student's open bills.
- **The 14th's 8pm "mark payments" Telegram lists tomorrow's reminders** (`loadReminderPlan` for
  tomorrow — the drafts already carry Issue Date = the 15th), so a bill paid but not marked is marked
  first.
- `?dry=1` plans without sending. Rules pure in `lib/overdue-reminders.ts` (tested); Airtable in
  `lib/overdue-reminders-store.ts`. On 4 Nov: 5 graduated students owed $2,410.

## Leavers — "Graduated" and the final bill (29 Sep 2026)

Adrian, on Kayla (IP Sec 4, last exam 29 Sep): "the 25 sep [additional lesson] should
automatically be generated and send out during the scheduled send outs right?" It was not:
Additional lessons ride the NEXT month's advance invoice, and a leaver has none. Now
(`lib/graduation.ts` pure/tested + `lib/final-extras-store.ts`):

- When a student's LAST enrollment closes — `cron/end-enrollments` the morning after its End
  Date, or Discontinue — ONE Draft `Invoice Type='Adjustment'` invoice is drafted for their
  Completed, un-billed Additional lessons up to the end date (guards: the `Billed` checkbox AND
  "date already on one of their invoices"), Month = the lessons' month, Auto Notes
  `Additional lesson(s) on …` (prints on the PDF). The lessons are marked Billed.
- The 15th's `send-invoices` cron also fetches these drafts (any month, `FINAL_EXTRAS_FORMULA`)
  and sends them unattended when nothing else is on them (`isFinalExtrasInvoice`); subject
  "Additional Lessons — Invoice for <month>", no holiday paragraph.
- A past extra still at `Scheduled` is never billed blind — listed in the Telegram line.
- **The fields come from `finalExtrasInvoiceFields` (`lib/graduation.ts`, tested) and must
  never include a computed field** (`INVOICE_COMPUTED_FIELDS`: `Invoice ID`, `Base Amount`,
  `Paid (ledger)`). Until 2 Nov 2026 the draft wrote `Base Amount` — an Airtable FORMULA —
  so Airtable refused EVERY final bill; the job only logged "1 failure(s)". Kayla (25 Sep),
  Chloe Gng + Eva Isabelle Wong (13 Oct) and Alessi Tay (25 Oct) got no final bill; drafted
  by hand on 2 Nov 2026 with the fixed code (they go out with the 15 Nov send).
- Students.Status becomes **`Graduated`** for Sec 4/5/JC2 leaving from September (`leavingStatus`),
  else `Inactive`. Until the base has a `Graduated` option the write falls back to `Inactive`
  and the Telegram line says so.
- End dates: Sec 4 O-Level students carry their last paper as End Date; the six 2026 JC2s were
  set to 6 Nov 2026 (their post-exam Regular lessons Cancelled, not deleted); IP students' dates
  are set by hand.

## Deferred Adjustments (carry a credit/charge to a FUTURE month's invoice)

For when an adjustment must land on a month whose invoice doesn't exist yet (e.g. a referral credit deferred from June to July). Stored on the student's **current** invoice via 4 Invoices fields:

| Field | Type | Notes |
|---|---|---|
| `Deferred Amount` | Currency | Signed — negative = credit, positive = extra charge |
| `Deferred Note` | Long text | Reason, shown as the line-item description on the future invoice |
| `Deferred To Month` | Single line text | Target month, exactly `Month YYYY` (e.g. `July 2026`) |
| `Deferred Applied` | Checkbox | Auto-ticked by the generator once applied (applies exactly once) |

- **Set it:** via the Invoice Assistant AI ("defer Kiara's −$280 referral to July") → `patch_invoice` sets the 4 fields; or manually in Airtable.
- **Set automatically (referral reward, 2026-09-02):** when an invited friend's paid pass clears and the inviter is a TUITION student, the payment webhooks write a −S$10 carrier themselves — `lib/referral-invoice-credit.ts` (pure logic + tests), idempotent per checkout session via Supabase `referral_invoice_credits` (payment_reference UNIQUE). Target month: next month before the 14th SGT, the month after next from the 14th on — never a month the generator has already passed (a stale label would sit in the banner forever). It never clobbers a pending deferral (picks a free carrier record; falls back to the manual "apply by hand" Telegram when none). Success Telegram is a receipt only.
- **Apply:** `generate-invoices` queries `AND({Deferred To Month}='<month>', NOT({Deferred Applied}), {Deferred Amount}!=0)`, adds a `Line Items Extra` line to that student's new invoice, bumps `Final Amount`, appends `Auto Notes`, ticks `Deferred Applied`. If no invoice exists that month to attach to, it's left unapplied (resurfaces next run) and flagged in the Telegram summary.
- **Banner:** `/admin/invoices` shows a blue "⏰ Pending adjustments" banner (data from `/api/admin-invoices/deferred-pending`) grouped by target month, each with a ✕ Cancel button.
- PDF caveat: like referral credits, the deferral changes `Final Amount` after the draft PDF was rendered — regenerate PDFs before sending (the normal draft-review step covers this).

## Nothing internal on a parent's invoice (17 Sep 2026)

Adrian, reading Tan Sijia's August 2026 invoice: *"Should not mention fuzzy match"* — the
line said **"Referral reward ⚠ fuzzy match — referred Chloe Gng"**. The referral generator
used to interpolate its name-matching confidence into the parent-facing description; the
flag belongs in the line item's own `matchConfidence` field, which is what `/admin/invoices`
reads for its 🎁 badge (and what its ADMIN-only tooltip may say). `generate-invoices` was
corrected on 15 Sep, but only Denise Chan's October row was cleaned — Sijia's August row
still carried it, and nothing stopped a stored row from printing one again.

- **The gate is at RENDER, not only at write:** `lib/invoice-description.ts`
  `parentFacingDescription()` (pure, tested) strips `fuzzy|exact|no match` and any badge
  emoji, closes the gap (no orphaned dash, no empty brackets), and falls back to
  "Additional Item". `lib/generate-pdf.ts` calls it at **all four** description renders —
  invoice main rows, invoice extras, receipt main rows, receipt extras — so whatever is
  stored, a parent reads clean text. `leaksInternalFlag()` is the scanner for finding rows
  worth cleaning at source.
- **Cleaned at source too:** Sijia's `receMzNhypjLgwuB8` description was rewritten in
  Airtable (amounts untouched: −320 and −60, Final Amount $20). A sweep of all 436 invoices
  found no other parent-facing description or note carrying a flag.
- **Rule:** never interpolate an internal flag, confidence, id or debug marker into
  anything a parent reads. Internal state goes in its own field beside the description.

## Email delivery reliability

Resend returns **200 + an email id even when it SUPPRESSES** a send (address blocked because a prior email to it hard-bounced or was marked spam) — the mail is never delivered. So "Resend accepted it" ≠ "delivered". Two guards:

- **Send-time suppression check** (`send-invoices`, `admin-emails` resend, `mark-paper-send`, `welcome-email`): after the Resend POST, GET the email's `last_event`; if `suppressed`/`failed`/`bounced`, treat it as **not delivered** — the invoice is NOT marked `Sent`, the EmailLog row is `failed`, the Telegram summary reports it under "NOT delivered", and the bot send shows ❌.
  **All four call sites share `lib/resend-verify.ts` (pure classifier + tests) — never re-inline this check.** Its verdict has **three** states, not two: `ok`, `not-delivered`, and `unavailable`. The third exists because the read-back can itself stop working: a Resend key downgraded to **"Sending access"** answers **403 code 1010** to every GET, and the original inline guard was `if (st.ok) { … }`, so a 403 fell through as *"nothing wrong here"* and the invoice was marked Sent unverified. **A check that could not run is not a check that passed.** `unavailable` is split by `permanent`: 401/403 is a config fault that never fixes itself → Telegram ⚠️ "delivery verification is OFF" (once per batch in `send-invoices`, not once per invoice); 404/429/5xx/timeout is a slow night → stays quiet, the webhook is the async backstop. The send itself is never blocked by a monitoring failure.
- **Resend webhook** (`/api/resend-webhook`): real-time async events (`delivered`/`bounced`/`complained`/`delivery_delayed`) update the EmailLog `Status` by Resend ID and **Telegram-alert on bounce/complaint**. Setup: Resend dashboard → Webhooks → add `https://www.adrianmathtuition.com/api/resend-webhook`, subscribe to those events, put the signing secret in `RESEND_WEBHOOK_SECRET` (Svix-verified; if unset, events still flow but unverified). To clear a stuck address: Resend dashboard → Suppressions → remove it, then resend.
- **Stuck emails** (`/api/cron/email-stuck`, daily 9am SGT, 15 Oct 2026, Adrian: "yes"): an EmailLog row still `sent`/`delayed` 24–48 hours after it went out (never bounced, never arrived) is read back from Resend — `delivered` → the row is corrected silently; otherwise one Telegram ⚠️ listing the addresses. A read-back that cannot run (sending-only key) still alerts. Rule + tests: `lib/email-stuck.ts`. Emails sent outside the app (by hand via the Resend API) have no EmailLog row and are only covered by the webhook bounce alert.
- **`resend-delivery-read` health check** (6h cron): reads the newest EmailLog row's Resend ID back from `/emails/{id}` and goes red on 401/403 only. The older `resend` check pings `/domains` and proves the API *answers*; this one proves the key can still **read**, which is the exact permission the suppression guard needs. They are not the same check — a send-only key sends perfectly and 403s every read, so without this a guard that had stopped guarding stayed green forever. Fix is always the same: Resend dashboard → API Keys → **Full access**.

- **PDFs are rendered one at a time at send (15 Oct 2026).** Drafts carry no stored PDF, so the 10am run renders every bill itself. Rendering six at once failed five (each render launched its own Chromium); the November bills went out one by one by hand that morning. Fix: `getBrowser()` shares one launch in flight (`lib/generate-pdf.ts`), and `send-invoices` downloads stored PDFs in parallel but renders missing ones sequentially (~3 s each, inside the 300 s limit for ~35 bills). A manual send of a list of bills is safe again.

Email Log resend (`/api/admin-emails` POST) re-attaches the archived PDF and posts a Telegram confirmation ("↩ Email resent" / "⚠️ Resend NOT delivered").

### Email footer — the WhatsApp assistant line

The invoice footer's reschedule paragraph points parents at the **Twilio assistant
line** (`KIOSK_WA_NUMBER`), never Adrian's personal number. Its formatting lives in
`lib/wa-number.ts` (`waDigits` for the `wa.me` link, `waDisplay` for the visible
text) and is unit-tested — **do not re-inline it into an email template.**

Why the test exists: the inline formatter shipped on 10 Aug 2026 with its
replacement string written as `'1ドル 2ドル'` — a currency-localised mangling of the
backreferences `'$1 $2'`. With the backreferences gone the regex still matched all
eight digits and swapped them for that literal, so the number was not reformatted,
it was erased: one parent was emailed *"WhatsApp our assistant at 1ドル 2ドル"*
(Jeanette Tan, 15 Aug). It type-checked, never threw, and reads as ordinary text in
a diff. Only an assertion on rendered output catches this class of bug, so
`wa-number.test.ts` asserts the shape `/^\d{4} \d{4}$/` and the absence of `$`.
The paragraph was pulled 15 Aug and restored 1 Sep 2026 on Adrian's instruction.

### Re-sending an invoice — `resend: true`

`POST /api/send-invoices {recordId, resend: true}` sends an **unchanged** invoice
again (first email lost, junked, or defective). Without the flag, any invoice whose
earlier EmailLog row carried a PDF is classified as an AMENDMENT — subject becomes
"AMENDED Invoice for …" and the body reads *"this replaces the previously sent
invoice, disregard the earlier email"*. That is correct when the figures changed and
misleading when they did not; the classifier cannot tell the cases apart, so the
caller declares which it is. Add `preview: true` to see the exact email without
sending. Note the Email Log's own resend button replays the ARCHIVED body verbatim —
use it only when you want the original bytes, mistakes included.

## Delivery receipts — the webhook, and why the log said `sent` for three months

`/api/resend-webhook` turns Resend's delivery events into the EmailLog row's
`Status`, so "did the parent actually get it?" is a glance at the row instead of
an investigation. It was built in June 2026 and answered that question for
**zero** of 279 emails until 1 Sep 2026, because of two independent faults that
each fail in total silence:

1. **The subscription.** The endpoint was live, enabled, and pointed at the
   correct `www` URL — subscribed to `email.delivery_delayed` and nothing else.
   A delayed email is rare, so the endpoint was simply never called. Adrian added
   the other four events on 1 Sep.
2. **The write.** `Status` is an Airtable singleSelect whose only options were
   `sent` and `failed`. Writing an unlisted option to a singleSelect is a 422,
   and the PATCH is wrapped in `.catch(console.error)` — a webhook must return
   200 or Resend retries forever. So the first `delivered` event to arrive would
   have failed invisibly too. Fixed 2 Sep with `typecast: true`
   (`lib/email-status.ts`), which makes Airtable create the option on first use.
   The API token has no `schema.bases:write` scope, so adding the options by hand
   was not available; typecast is safe here because `STATUS_BY_EVENT` is a closed
   five-value set.

**If you touch delivery status, check both halves.** Code review sees the second
fault at best; only the Resend API sees the first:

```
curl -s https://api.resend.com/webhooks -H "Authorization: Bearer $RESEND_API_KEY"
```

(needs a Full-access Resend key — a sending-only key 403s with error 1010). The
same lesson as the mangled WhatsApp number above: **an integration that
type-checks, deploys, and throws nothing is not an integration that works. Only
an assertion on real output proves it.**

## A weekly slot started after its month was billed — on the next 15th bill (7 Nov 2026)

Adrian, 7 Nov 2026, on Lucas Ngo's second weekly lesson (Sun 1–3pm from 8 Nov; November was
already billed and paid): *"should not be adhoc lessons … he is really having 2 lessons per week
-> regular lessons"*. The lessons stay **Regular**; the bill catches them up.
- On the advance run (14th), every slot whose enrollment **Start Date is in the run month or the
  month before** adds its lessons from the start date to the end of the run month as Regular
  lines labelled with their own month ("Sec 3 E Math & A Math — November 2026"), beside next
  month's lines. `lib/billing-math.ts newSlotCatchUpDates` (tested).
- **Never twice:** a date already on any of the student's bills since ~6 weeks before last
  month (a sign-up's first bill, a bill made by hand — Draft or Sent, not Voided) is left out.
- **A class switch is skipped** (an enrollment Ended since the 1st of last month): the switch
  makes its own adjustment.
- The Telegram summary lists them: "➕ New weekly lessons since the last bill — added to this bill".
- So: to add a second weekly lesson mid-month, use ＋ Add weekly slot with the real start date —
  nothing else. 15 Nov 2026 check: only Lucas is touched (4 Sundays, $280; bill $910).

