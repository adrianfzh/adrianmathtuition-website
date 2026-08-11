# Schedule, Progress & Revision Sprint — detailed docs

> Split out of `CLAUDE.md` on 2026-08-04. **MANDATORY reading before touching
> `/admin/schedule`, `/admin/progress`, lesson/reschedule/capacity routes, or the
> June Revision Sprint surfaces.** The bug archaeology in here is load-bearing.
> Root policies (push flow, auth, Airtable gotchas): [`../CLAUDE.md`](../CLAUDE.md).

## Lessons table — progress fields

| Field | Type | Notes |
|---|---|---|
| `Mastery` | Single select | `Strong` / `OK` / `Slow` (plain text; emoji added in UI) |
| `Mood` | Single select | Full emoji-prefixed strings: `'😄 Engaged'` / `'🙂 Fine'` / `'😟 Distracted'` / `'😴 Tired'` / `'😤 Frustrated'` — stored exactly as shown |
| `Topics Covered` | Long text | JSON array of canonical topic names (from `lib/canonical-topics.ts`) |
| `Topics Free Text` | Long text | Freeform topics not in the canonical list |
| `Lesson Notes` | Long text | Admin notes on the lesson — **distinct** from `Notes` (system field for reschedule reasons etc.) |
| `Homework Assigned` | Long text | What was set |
| `Homework Returned` | Single select | `Yes` / `Partial` / `No` — written to the **previous** lesson record |
| `Homework Returned Reason` | Long text | Optional reason if partial/no |
| `Progress Logged` | Checkbox | Auto-set `true` when any content field is non-empty — **excluding `Next Lesson Plan`** (a forward-looking plan doesn't mean this lesson was written up) |
| `Next Lesson Plan` | Long text | What this student starts on NEXT lesson. Written on the lesson just taught; read back by `/api/kiosk/plan` for the kiosk's "📌 For you today" card, and shown in the LessonModal recap as **📌 Planned for today** off `prev`. |

> ⚠ **`Next Lesson Plan` must be created by hand in Airtable** — the API token has
> `schema.bases:read` but not `:write`, so the field could not be added
> programmatically (2026-08-11). Until it exists:
> - `lesson-update` catches the 422, **drops the field, retries**, and returns
>   `droppedFields` — the rest of the progress log still saves and the modal shows
>   `⚠ Next Lesson Plan not saved — field missing in Airtable` instead of a false ✓.
> - `lesson-context` retries its prev-lesson query without the `fields[]` entry
>   (an unknown name 422s a **list** endpoint too, which would take the whole modal down).
> - `/api/kiosk/plan` returns `{plan: null}` and the kiosk card simply doesn't render.
> - `/api/health-check` `next-lesson-plan` probe fails until the field exists — so
>   promoting to prod before adding it will Telegram-alert every 6h. That's deliberate.
>
> The escaped-quote gotcha: `airtableRequest` wraps the **raw** body, so the error text
> reads `Unknown field name: \"Next Lesson Plan\"`. A regex expecting a bare `"` never
> fires and the fallback looks absent. (Also: Turbopack served a stale route module
> through three edits here — restart `next dev` before concluding a fix didn't work.)

## Notification Policy

**All admin web UI actions are silent** — no Telegram messages sent when admin uses the website.

Students/parents are notified via the bot's day-before reminder cron (`runDayBeforeReminders` in `flows.js`), which automatically picks up Rescheduled/Additional/Makeup/Trial lesson records. Same-day or next-day reschedules won't reach that cron in time — admin should message manually. (Telegram-only today; the WhatsApp reminder needs a Meta-approved utility template — parked to 15 Aug 2026.)

> ✅ **Verified 2026-08-04:** `runDayBeforeReminders` includes `Revision Makeup` in its type filter — the rule now lives in the bot's `lib/day-before.js` (`REMINDER_TYPES`, unit-tested), so a regression would fail the bot's suite. (This replaces the old ⚠ Unverified note.)

## /admin/schedule — Lesson Management

Two-tab interface, cookie-auth protected (30-day), PWA-ready.

### Tabs

- **Lessons** (default) — editable calendar. Shows Regular/Rescheduled/Makeup/Additional/Trial/Revision Makeup lesson records. Drag-to-reschedule, tap-to-action-sheet, per-slot [+] button, floating FAB.
- **Roster** — read-only slot enrollment view (which students are in which weekly slot). **Date-aware**: reflects who was enrolled during the VIEWED week, not just today. The schedule API fetches ALL enrollments (not only `Status='Active'`) with Start/End Date and filters by tenure overlap `[weekStart,weekEnd]` in JS (missing Start = "since forever", missing End = "still open"). So a past week shows that week's real membership — a since-departed student reappears, a switched student sits in the slot they were actually in then. A `⏮ Roster as it stood the week of …` notice + "This week" pill appear when viewing a non-current week. (Slot switches END the old enrollment + CREATE a new one rather than editing in place, which is what makes history derivable.)

Tab choice persists in `localStorage` (key: `schedule_view_mode`).

### Chip features

- **"tap to mark" ghost chips are gated by DAY-level enrollment tenure** (2026-08-01):
  the API returns `enrollmentTenureBySlot` beside the week-level roster, and the ghost
  filter requires the enrollment to cover THAT date — the week-overlap list alone
  ghosted Chow Wen Zheng on Sat 1 Aug after her enrollment ended 31 Jul (discontinued
  effective 1 Aug: the record deletion worked; the ghost synthesis was the leak).
- **Quick attendance pills** — ✅ / ❌ (and `undo`) appear on chips for **today and yesterday only**; tap to set Completed/Absent. This is a UI convenience gate, NOT a rule: attendance can be set on **any** date via the chip's action sheet (✅ Mark present / ❌ Mark absent → `PATCH /api/admin/progress/lessons`, which has no date window). The 14-day `EDIT_WINDOW_DAYS` lock applies to **progress fields only** (topics/mastery/mood/notes), never to Status.
- **Rescheduled-away chips report the END of the chain, not the first hop** — `Rescheduled Lesson ID` forms a *chain* (a makeup can itself be moved). `lib/reschedule-chain.ts` (`resolveRescheduleChain`, unit-tested) walks it and classifies the result: `delivered` (green ✓) / `missed` (red — makeup also missed, still owed) / `cancelled` (red) / `upcoming` (blue) / `unmarked` (amber) / `broken` (grey); `↻n` marks >1 hop. **Use this lib — never re-walk the chain inline.** Both `/api/admin-schedule` and `/api/admin/student-profile` call it; they previously had separate copies and the schedule one read only one hop, so a twice-moved-then-taught lesson showed as pending while the profile page showed it correctly. `/api/admin-schedule` fetches onward hops in a bounded loop (usually 0 extra rounds).
- **Attendance outcome is visible on every date** — green `Completed` / red `Absent` render regardless of how old the week is, and a past lesson still at `Scheduled` shows an amber `? unmarked` flag. (These used to sit behind the same today/yesterday gate as the ✓/✗ buttons, so on an older week an attended lesson looked identical to a never-marked one.) Any new chip-status affordance must gate the *buttons*, not the *label*.
- **Reschedule labels carry the weekday and the origin** (2026-07-24) — rescheduled-away sub-line reads `Rescheduled → Fri, 24 Jul 5-7pm`; the DESTINATION Rescheduled/Makeup chip shows `↩ from Fri, 24 Jul 3-5pm` (`rescheduledFrom` in the schedule payload: same-week source record reverse-lookup, else parsed from the `Rescheduled from …`/`Makeup for …` note the create routes stamp — cross-week sources with fully custom notes have no origin).
- **Topic timeline: planned next-lesson topic + self-healing corrections** (`/api/admin-schedule/topic-timeline`) — a row with **no Started and Current=false is a PLAN** ("next lesson's topic"; no new Airtable fields). POST actions: default advance (replace), `add` (another concurrent current topic), `end` (retire one row), `plan` (additive), `startPlanned` (rowId, keeps other currents), `autoStartPlanned` (ALL planned → current; fired when the sheet opens on a TODAY lesson), `clear`, rowId edit/delete. MULTIPLE topics may be current and multiple planned at once. Correction rules: retiring a topic **set today deletes** the mis-pick (no `24 Jul – 24 Jul` noise rows); re-adding a topic **ended today resurrects** its original row; adding/advancing into a planned topic consumes the plan. Every write calls `invalidateScheduleStatics()` (Topic Timeline is in the statics cache — without it the chip's 📘 line stayed stale for up to 60s). Work-tab UI (2026-07-26): ONE flowing form per subject — TODAY'S LESSON (topic chips + always-visible picker + mastery + quick note) → HOMEWORK (`Homework Assigned` via lesson-update, prefilled from lesson-context) → NEXT LESSON (planned chips + picker) → Save lesson log; the separate THIS LESSON box is gone.
- **⚠ exam season pill** — appears when student is missing exam date or tested topics for the active exam type
- **Chip info lines (no pill — retired 2026-07-26)** — the exam/topic pill is gone; the student NAME is the tap target for the Exam | Regular-work sheet. Chips show labelled sub-lines instead: `📅 WA3 · A Math · 20 Aug — topics` per subject (`examSummaryLines()`, exam type leads; P1/P2 split renders `P1 …, P2 …`), `✅ WA3 done` (green) once all exam dates are past, `📘 Working on: <topics>` + `📗 Next lesson: <topics>` (from `currentTopicByStudent`/`nextTopicByStudent`), muted `no exam / topic yet` when nothing is recorded, `📋 Project Work · no WA3` for PW/AA.
- **Prelim = all topics tested** — in the exam dialog, when `examType==='Prelim'` the per-subject topic picker is **hidden by default** (just an "＋ Add specific topics (optional)" reveal), since prelims test everything. The picker still appears if topics were already saved or the admin clicks reveal (`prelimTopicsOpen` set, reset per open). Other exam types show the picker as before.
- **Promo = JC1's EOY** (2026-08-08) — exam-type dropdown includes `Promo`; `levelExamType()` defaults JC1 to it during the EOY window (mirrors the Sec4/JC2→Prelim mapping); the schedule route's Exams fetch OR-includes `Promo` unconditionally (same as `Prelim`) so a Promo record satisfies the season pill; `examTypeLabel()` (lib/exam-grade.ts) relabels a JC1 EOY row "Promo" on the results surfaces. **Season equivalence is centralized in `seasonSatisfyingTypes()`** (lib/exam-season.ts, unit-tested): `checkExamInfoStatus` + the Exams fetches in `admin-stats` (hub ⚠ card) and `admin/progress/lessons` (LessonModal banner) all accept Prelim/Promo as satisfying the season — before 2026-08-08 those two fetched ONLY the active type, so a Sec 4 with complete Prelim info counted as an exam-info gap all WA3 season. Any new "missing exam info" surface must use the helper. ⚠ The Airtable `Exam Type` option is created via `typecast: true` on first write — the metadata-API options PATCH gets 422 with our token, so every `Exam Type`-writing create (`set-exams` incl. its No-Exam marker, `quick-add-exam`) must keep `typecast: true`.
- **📷 From photo topic extraction** (2026-08-08) — button beside "Topics tested" in the exam dialog: upload the student's photo (school "topics tested" list / timetable / teacher message) → `/api/admin-schedule/extract-exam-topics` (admin auth, `claude-sonnet-5`) maps it onto the SAME canonical list `getExamTopicsForSubject()` feeds the picker, and the returned topics are auto-ticked (additive merge — existing ticks kept). Umbrella school names expand ("Sequences & Series" → APGP + Series and Sequences). Model output is gated server-side by `lib/exam-topic-extract.ts` (`flattenExamTopics` + `parseExtractionResponse`, unit-tested) — only exact canonical names survive. Bonus fills, both only when currently empty: exam date (single-paper rows only) and a ≤200-char caveat note ("Integration up to 10.1.6 only"). Client downscales to ≤1400px JPEG (`photoToJpegDataUrl`, ~200-400KB — far under Vercel's 4.5MB cap); HEIC-on-Chrome decode failure toasts a "try a screenshot" error (Safari decodes HEIC fine). One hidden file input serves all rows (`photoRowRef` carries the row index).
- **Project Work / Alternative Assessment (PW/AA)** — some students sit PW or an AA *instead* of a WA. The exam dialog has a "Project Work / Alternative Assessment (no WA exam)" checkbox + a PW/AA toggle; checking it means no WA exam. Stored with NO new Airtable field: the marker record gets `No Exam=true` + a `PWAA:<type>` marker in **Exam Notes** (same marker-in-a-field pattern as the `~|` approx flag / paper-in-Subject). The schedule route parses it into `examAssessmentByStudent` (sid → 'Project Work' | 'Alternative Assessment'); the chip pill shows `📋 Project Work` / `📋 Alt. Assessment` and a `📋 … · no WA3` sub-line instead of "no upcoming exam". `set-exams` accepts `pwaa` in the body.
- **Progress dot** — green `●` on chip when `Progress Logged = true`
- **Student name tap** — opens the same tabbed **Exam | Regular work** sheet as the chip pill (2026-07-24; the old LessonModal overlay is retired on this page — the component remains on `/admin/lessons` + `/admin/students/[id]`). Trial lessons still open `/admin/progress` in a new tab. The sheet opens on the **Exam tab during an active exam season**, Regular work otherwise (`openWork` still forces the work tab from the 📘 topic pill).
- **Classmate exam fill (same school = same paper)** — in the Exam tab: (a) **"Also save for classmates"** — tick same-level students and Save writes the identical exam info to each via per-student `set-exams` POSTs (subjects filtered to what each ticked student takes; a ⚠︎ marks students whose existing exam info would be overwritten; mismatched-subject students are skipped and named in the toast); (b) **"📋 Same school? Copy exam info from:"** — shown while the current student's rows are empty; prefills rows from a classmate's saved entries (`rowsFromEntries`, shared with `openExamEdit`) for review before saving.

### Drag-and-drop stack

- `@dnd-kit/core` — `PointerSensor` (distance: 8px), `TouchSensor` (delay: 500ms, tolerance: 5px)
- `DragOverlay` renders floating copy with scale/rotate; source chip drops to 0.3 opacity
- `navigator.vibrate(30)` on drag start for haptic feedback
- `touchAction: 'none'` on draggable chips (required for iOS Safari)
- `DraggableLessonChip` and `DroppableLessonSlot` are **module-level components** (not inline) — required because they use `useDraggable`/`useDroppable` hooks

### /admin hub — tile arrange mode (shares the dnd-kit lore)

**Tile reorder on phone = iOS-style arrange mode** (2026-07-30): long-press a tile (pointer events, `pointerType==='touch'` only) → tiles jiggle, taps stop navigating, `touchAction` flips to `'none'`, drag freely, ✓ Done exits. Plain long-press-drag can NEVER work here: tiles need `touchAction:'manipulation'` for page scroll, and Safari fixes touch-action at GESTURE START — the arming press can't drag, the NEXT touch can. The long-press detector COMPOSES dnd-kit's `onPointerDown` (spreading over it kills mouse drag).

### Sec-capacity toggle — the "Sec cap" pill (2026-08-03)

- Header pill on `/admin/schedule` (mobile + desktop; amber while ON): caps Secondary slots'
  per-date **MAKEUP capacity** at 5 (stored 6) so classes stay smaller — new
  makeup/reschedule/additional bookings are refused once a date holds 5. **Scope is Makeup
  Capacity ONLY** (Adrian, 2026-08-03): Normal Capacity (4, advisory, routinely exceeded) and
  every enrollment path (signup, add-weekly-slot, switch) are deliberately ungated. Booked
  lessons are untouched by construction — the cap is consulted only where a lesson is created.
- State = Settings row `sec_capacity_override`, Value `{"secCap":5}` / `{"secCap":null}`;
  API `/api/admin/capacity-override` GET/POST; pure logic in `lib/capacity-override.ts`
  (unit-tested; min() semantics — the override only lowers, a null stored cap stays null).
- Enforced in `admin-schedule/add` + `reschedule` (force semantics unchanged; 409 message
  names the cap). `/api/admin-schedule` returns top-level `secCap` + EFFECTIVE `makeupCapacity`
  per slot (`capacity` stays raw), so the reschedule pickers follow automatically.
- **The bot respects it too** (repo `adrianmath-telegram-bot`, `lib/capacity-override.js`:
  same Settings row, 60s cache, fail-open): `getRescheduleOptions` (Telegram /rs + WhatsApp +
  trials), the admin-agent booking check, and the availability calendar/summary — parents are
  never offered a (slot, date) the toggle would refuse. **Any new capacity-checking surface in
  either repo must apply the same helper.**
- Airtable's `Is Full` / `Spots Remaining` FORMULA fields can't see the override — never read
  them on a surface that must respect it.

### Recurring lesson generation (Regular lessons)

Regular weekly lessons exist as individual `Lessons` records. Three things create them, all using `src/lib/lesson-generation.ts > generateRegularLessonsForSlot` (9-week default horizon, dedup by date+slot, holidays → `Cancelled`):
- **Signup** (`/api/signup`) — for new students (own inline copy, 9 weeks).
- **Slot switch** (`/api/admin-schedule/switch`) — deletes future old-slot lessons, generates 9 weeks on the new slot (was 28 days — too short). Accepts `{lessonId}` (calendar) OR `{studentId, oldSlotId}` (profile page). **Also mirrors the bot's `sw_confirm` proration + enrollment history:**
  - **Proration** (`lib/switch-proration.ts`, unit-tested): reconciles the switch month's **actual lessons** against **what the issued invoice billed** — `adjustment = (correctLessonCount − billedLessonCount) × rate`, where `correctLessonCount` = actual Regular non-cancelled lessons that month (post-switch, counted from real records) and `billedLessonCount` = `Base Amount ÷ rate` of the issued switch-month Regular invoice. **No issued invoice for that month → adjustment 0** (the monthly generator bills the new enrollment correctly). The OLD formula `(newRemaining − oldRemaining)` counted forward from the switch date only and assumed every pre-switch old-weekday lesson billed was delivered — it silently missed a $70 overbill when a billed final old-day lesson never happened (Kiara Tan, Jul 2026: billed 5 Fridays, switched to Sat, attended 4). If non-zero, creates a Draft **`Invoice Type='Adjustment'`** invoice; **a credit on an already-PAID switch month is attributed to the NEXT month** (so it reduces a future payment, not a settled one). `typecast:true` creates the `Adjustment` option on write.
  - **Enrollment history:** ENDs the old enrollment (`Status='Ended'`, `End Date`=day before switch) and CREATEs a new `Active` enrollment on the new slot, carrying over `Rate Per Lesson` + `Rate Type` (not an in-place Slot PATCH — preserves tenure history). Enrollments.Status live options are `Active`/`Ended` (committed schema.ts was stale).
- **Add weekly slot** (`/api/admin-schedule/add-weekly-slot`) — Roster tab [+] button → creates a 2nd Active Enrollment + 9 weeks of lessons.

**The forward-extender lives in the BOT**, not here: `generateUpcomingLessons(weeksAhead=4)` in `bot.js` runs **Mon 7am SGT** (and via `/generate`), topping up Regular lessons 4 weeks ahead for all Active enrollments. It only generates *forward from today* and never backfills, so a **missed cron run leaves a permanent gap** (the cause of the June 2026 hole). It dedups by `studentId|date` (not `+slot`), an edge-case bug for students whose two slots fall on the same date. If gaps appear, run `/generate` in the bot or backfill via the Airtable API.

### API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/admin-schedule` | GET | Weekly data: slots + lessons + students + exam info |
| `/api/admin-schedule/reschedule` | POST | New Rescheduled lesson + mark original |
| `/api/admin-schedule/add` | POST | Create Additional/Makeup/Trial/Revision Makeup (Revision Makeup: no capacity check, `Is Revision Makeup`, not billed) |
| `/api/admin-schedule/add-weekly-slot` | POST | Create an Active Enrollment + generate 9 weeks of Regular lessons (Roster tab [+] button) |
| `/api/admin-schedule/switch` | POST | Permanent slot switch: delete future old-slot lessons + generate 9 weeks on new slot + update enrollment |
| `/api/admin-schedule/delete` | POST | Hard-delete or mark Absent |
| `/api/admin-schedule/attendance` | POST | Update lesson Status |
| `/api/admin-schedule/lesson-context` | GET | Fetch progress fields + prev lesson + exam info for LessonModal |
| `/api/admin-schedule/lesson-update` | POST | Save Mastery/Mood/Topics/Notes (14-day window) |
| `/api/admin-schedule/lesson-prev-update` | POST | Save Homework Returned on previous lesson (14-day window) |
| `/api/admin-schedule/quick-add-exam` | POST | Upsert Exams record for active exam type |
| `/api/admin-schedule/extract-exam-topics` | POST | Photo → canonical tested-topics (+ date/note) for the exam dialog's 📷 button |
| `/api/admin-schedule/student-contact` | GET | Lazy-load student contact info |
| ~~`/api/admin-schedule/unmarked-count`~~ | — | NEVER EXISTED (stale doc, found 2026-08-04) — the count lives in `lib/unmarked-lessons.ts` (tested formula) and is served via `/api/admin-stats` for the hub card |

### LessonModal (retired on /admin/schedule 2026-07-24 — still used by /admin/lessons and /admin/students/[id])

Shared component `src/components/LessonModal.tsx`. On the schedule page, name tap now opens the tabbed Exam | Regular-work sheet instead. Sections:

1. **Edit-lock banner** — shown if lesson date is outside 14-day window or in future; inputs are disabled
2. **Previous lesson recap** — read-only (topics, homework set); includes Homework Returned radio (Yes/Partial/No) that writes to the PREVIOUS lesson record
3. **Exam season quick-add** — shown during active exam season if student is missing exam date or tested topics
4. **This lesson input** — editable fields:
   - Topics Covered: canonical multi-select (from `lib/canonical-topics.ts`) + free text
   - Mastery: Strong / OK / Slow (displayed as 🟢/🟡/🔴, stored as plain text)
   - Mood: 5 options stored as full emoji-prefixed strings matching Airtable option names exactly
   - Homework Assigned: long text
   - Lesson Notes: long text
5. **Autosave footer** — 500ms debounced save per field; shows saving/saved/error status

14-day edit window enforced server-side in both `lesson-update` and `lesson-prev-update`. Debounce timers cleared on modal unmount.

### Reschedule semantics (mirrors bot /rs exactly)

- Creates new lesson: `Type: 'Rescheduled'`, `Status: 'Scheduled'`
- PATCHes original: `Status: 'Rescheduled'`, `Rescheduled Lesson ID: [newId]`, appends `| auto-linked` to Notes
- Capacity check uses `Makeup Capacity` field (not `Normal Capacity`); counts only lessons that OCCUPY a seat — not Cancelled/Absent/**Rescheduled-away** (same rule as `occupiesSlot()`; counting moved-away records made a 4-student Sunday read "6/6 full", 31 Jul 2026)
- Deleting a Rescheduled record reverts source lesson to `Status: 'Scheduled'` and clears the link

### Shared helpers (`lib/schedule-helpers.ts`)

- `verifyAdminAuth(req)` — Bearer token check
- `localToday()` — today as `YYYY-MM-DD` in local/SGT time
- `daysAgo(n)` — `n` days before today as `YYYY-MM-DD`
- `EDIT_WINDOW_DAYS` — `14` (the edit window constant; shared by all lesson-* routes)
- `formatDateSlotLabel(dateStr, slotFields)` — e.g. `"Mon, 24 Nov 3-5pm"`
- `countLessonsInSlot(slotId, date)` — occupancy count: excludes Cancelled/Absent/Rescheduled; filters by Date+Status in Airtable, matches the slot record ID in JS (ARRAYJOIN({Slot}) returns display names, never IDs)

### Telegram (`lib/telegram.ts`)

- `sendTelegram(text)` — posts to `TELEGRAM_CHAT_ID` (admin alerts)
- `sendTelegramTo(chatId, text)` — posts to arbitrary chat ID (student/parent)

### Error conventions

- 401 auth, 400 bad body, 403 outside edit window, 409 slot full, 500 Airtable errors
- **409 double-booked (`doubleBooked: true`)** — the same student occupying the same
  (date, slot) twice is physically impossible, so every lesson-creating route
  (`reschedule`, `add`, `admin-revision-attendance` makeup) calls
  `findStudentSlotConflict()` (`lib/schedule-helpers.ts`) and hard-409s on a hit.
  **`force` does NOT bypass it** (force covers capacity/away overrides only) and the
  client must not offer the "book anyway" retry for it. Occupancy rule (not
  Cancelled/Absent/Rescheduled) is the pure `occupiesSlot()` in `lib/double-booking.ts`
  (unit-tested); `/admin/schedule` uses its `findDoubleBookedIds()` to badge any
  pre-existing duplicates with a red "⚠ double-booked" chip pill. Added after Adele
  (26 Jul 2026) ended up with a thrice-moved lesson AND an unrelated makeup in the
  same Sun 9–11am slot. Any NEW lesson-creation path must call the same guard.
- **`Booked Via` (Lessons, single select — actor attribution, added 2026-07-23)** —
  every lesson-creating write stamps WHO booked it: website routes write `Web admin`;
  the bot (repo `adrianmath-telegram-bot`, `lib/reschedule.js` `bookReplacementLesson`
  + the Additional-lesson creations) writes `Bot (parent)` / `Bot (student)` /
  `Bot (admin)` / `WhatsApp (parent|student)`. Write with `typecast: true` and drop
  the field gracefully on `UNKNOWN_FIELD_NAME` — a booking must never fail on
  metadata. Shown in the /admin/schedule chip action sheet ("✍️ Booked via …");
  records created before the field existed are unstamped. **Any new lesson-creation
  path must stamp it.**
- Notification failures are logged but never fail the parent request

### UI patterns

- Toasts: 3s auto-dismiss, fixed bottom-centre, success (green) / error (red)
- Drop targets: dashed navy border on hover
- All destructive actions require modal confirmation

## /admin/progress — Student Timeline

Read-only student history view. Cookie-auth protected (same 30-day session), PWA-ready.

### Structure

- **Header**: "Progress" + search box ("Search students…") + Level dropdown filter (All / Sec 1–5 / JC1–2)
- **Student selection**: URL deep-link via `?student=recXXX`. Selecting a student updates the URL.
- **Aggregations panel** (4 cards): Attendance % · Mastery breakdown (Strong/OK/Slow counts) · Top topic · Homework returned %
- **Date range filter**: Last 30 days / Last 90 days (default) / Last 6 months / Last 12 months / All time — triggers refetch
- **Timeline** (desktop ≥768px): horizontal interactive timeline, lessons + exams interleaved chronologically. Lesson nodes: top half = mastery colour, bottom half = mood emoji. Exam nodes: hexagon shape. Jump buttons: [< 6mo] [< 3mo] [< 1mo] [Now].
- **Mobile** (<768px): vertical reverse-chronological card list with the same data.
- **Detail panel**: click any node → full lesson or exam details below the timeline.
- **"Edit in Schedule" link**: `/admin/schedule?date=YYYY-MM-DD&openLesson=recXXX` — only active within 14-day window; shows muted "Editing locked" otherwise.

### Exam season

- Hardcoded windows in `lib/exam-season.ts` (`EXAM_WINDOWS`): WA1 02-01→03-15, WA2 04-15→06-05, WA3 07-15→09-05, EOY 09-20→11-10 (MM-DD, SGT)
- Manual override: Airtable `Settings` row `exam_season_override` → `{"forceOn":"WA2"}` (or `null`)
- `resolveActiveExamType(override)` — override if set, else date-based window, else null
- ⚠ pill on schedule chips when student missing exam date or tested topics for active type

### Key files

| File | Purpose |
|---|---|
| `app/admin/progress/page.tsx` | Student timeline page |
| `app/api/admin/progress/student-timeline/route.ts` | Timeline data + aggregations |
| `app/api/admin/exam-season/route.ts` | GET/POST exam season override |
| `lib/exam-season.ts` | `EXAM_WINDOWS`, `resolveActiveExamType()`, `checkExamInfoStatus()` |
| `lib/canonical-topics.ts` | Canonical topic lists for O-Level Sec and JC H2 |

## June 2026 Revision Sprint

`/admin/revision-signups` has two tabs: **Sign-ups** (manage sign-ups) and **Attendance**.

### Attendance tab (`/api/admin-revision-attendance`)

Tracks revision-lesson attendance + makeups for signed-up students. Revision lessons (`Type='Revision Sprint'`) were created with only `{Student, Date}` — no subject/time — so the **subject/session label (EM 10am–12pm / AM 1–3pm / H2 2–5pm) is derived at read time** from the student's signed-up subjects (parsed from the Revision Sprint invoice line items) + the fixed sprint date schedule. EM dates ⊂ AM dates, so EM+AM students get two records on shared dates, assigned deterministically (sorted by record id).

- **GET** → per student: sessions (date · subject · time · status · `assignmentSubmitted` · `topics[]`) + linked makeup + summary (attended/missed/madeUp/outstanding). `topics` merges `Topics Covered` (JSON) + `Topics Free Text` (comma list). Optional **`?studentId=recXXX`** scopes the response to one student (used by the `/admin/schedule` Revision Makeup session picker).
- **POST** `{action:'mark', lessonId, status}` — set a revision lesson's Status.
- **POST** `{action:'assignment', lessonId, value}` — set HW state on **`Homework Returned`**: `'Yes'` = handed up, `'No'` = not handed up, `''` = clear. (Back-compat: boolean `submitted` → `'Yes'`/clear.) UI: per-session **✓ / ✗ toggle** on the Attendance tab (optimistic).
- **POST** `{action:'hwnote', lessonId, note}` — free-text HW note (e.g. "partial — only Q1–5") stored on **`Homework Returned Reason`**. UI: a **"+ note" / 📝 chip** beside the HW ✓/✗ toggle on the Attendance tab (click-to-edit inline, optimistic). For tracking partial hand-ups.
- **POST** `{action:'topics', lessonId, topics}` — set topics covered (freeform, comma-separated) on **`Topics Free Text`**. UI: click the topic chips (or "+ topics") beside the session date to edit inline. When no manual topics are set, sessions **default to the published schedule** (`SCHEDULE_TOPICS` in the route, mirroring `/june-revision/sec4` + `/jc2`), split into chips on `+`.
- **Attendance tab layout**: student cards render in a responsive grid (4 cols web → 3 → 2 → 1 on narrow screens), grouped by subject section.
- **POST** `{action:'makeup', lessonId, studentId, date, slotId}` — **the "reschedule a missed (or known-to-be-missed) June-holiday lesson" action**: creates a makeup lesson at any active regular slot with a real **`Type='Revision Makeup'`** + **`Is Revision Makeup=true`** flag (Notes `'Revision makeup'`), marks the **original revision lesson `Rescheduled`** (NOT `Absent` — its outcome is read from the makeup's status), and links them via `Rescheduled Lesson ID`. (Both `Revision Makeup` Type and the `Is Revision Makeup` checkbox now exist on the Lessons table — the older "makeups borrow `Type='Additional'`" workaround is gone.) The makeup then shows on `/admin/schedule` at that slot with a teal **🏖 Revision makeup** chip badge (schedule route flags it via `revisionMakeup` = `Is Revision Makeup` true OR Notes matches `/revision makeup/i`).
  - **Where to trigger it:** (a) Attendance tab — **＋ Log makeup** on a *Missed* session, or **↻ Reschedule** on a *Scheduled* session (reschedule one you know will be missed; the action marks it Rescheduled + creates the makeup in one step). (b) `/admin/schedule` — a **↻ Reschedule** button on each *Scheduled* Revision Sprint chip opens the same date+slot dialog (auth via `savedPw`, refetches the week). (c) `/admin/schedule` **Add lesson → "Revision Makeup (not billed)"** type — pick the student, then a **session picker** (date · subject · time · ⚠ missed, with the selected session's topics shown) lists their Revision Sprint sessions (from `/api/admin-revision-attendance?studentId=`); selecting one routes through this same `action:'makeup'` endpoint, or leaving it on "— Standalone —" creates an unlinked makeup via `/api/admin-schedule/add` (which also accepts `type='Revision Makeup'`, skips the capacity check, sets `Is Revision Makeup` + no Billing Month). The picker only offers sessions not already made up.
  - **Slot picker** groups the student's same JC/Sec-level slots first (`sameLevelSlot()`), with all other slots still selectable under "Other slots". No capacity check.
  - **Billing:** the makeup is `Type='Revision Makeup'`, so it's already outside `generate-invoices`'s Additional-lesson billing query (which only counts `Type='Additional'`); that query **also** explicitly excludes `Is Revision Makeup` (with the `Notes`-matching `Revision makeup` as a legacy safety net) — the Revision Sprint was already paid, so the makeup is NOT billed again. **Any new "don't bill this lesson" case must keep it out of the Additional query and/or add the same exclusion.**
- **POST** `{action:'unmakeup', lessonId}` OR `{action:'unmakeup', makeupId}` — undo a makeup: deletes the makeup lesson + unlinks. `lessonId` (Attendance-tab ✕) leaves the revision lesson `Absent`; `makeupId` (schedule undo) reverts it to `Scheduled` (it was rescheduled-ahead, not truly missed). On `/admin/schedule`, the makeup chip's action sheet shows **↩ Undo revision reschedule**; a regular `Rescheduled` chip shows **↩ Undo reschedule** (calls `/api/admin-schedule/delete` which restores the source lesson).

Sign-ups tab: Sign-up (`/api/admin-revision-signup`) does: (1) mark Student `June Revision 2026='Signed Up'`, (2) void the regular June invoice, (3) create a `Revision Sprint` invoice, (4) create `Revision Sprint` lesson records on the sprint dates, (5) **soft-cancel the student's June `Regular` lessons** (they don't attend normal weekly lessons in June). Revert (`/api/admin-revision-revert`) undoes all of it, including restoring those regular lessons.

- Regular-lesson cancel/restore lives in `src/lib/revision-regular-lessons.ts` (`cancelJuneRegularLessons` / `restoreJuneRegularLessons`).
- Cancelled lessons get `Status='Cancelled'` and a Notes marker `Cancelled — June Revision Sprint sign-up`; restore matches that marker so only the auto-cancelled ones come back.
- Soft-cancel (not hard delete) → reversible, auditable, and dropped from the schedule (the schedule filters out `Status='Cancelled'`). Doesn't affect June invoicing (June isn't prorated; invoice generation counts slot occurrences, not these records).
