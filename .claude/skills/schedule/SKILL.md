---
name: schedule
description: MANDATORY before touching /admin/schedule, /admin/progress, /admin/log, lessons, reschedules, attendance, capacity, recurring lesson generation, Revision Sprint, exam season, Lessons progress fields, or any admin-schedule/* API route. Routes you to the area runbook before any code is written.
---

# Schedule & lessons — read the runbook first

**Read [`docs/SCHEDULE.md`](../../../docs/SCHEDULE.md) in full before writing
or editing any schedule code.** That file is the source of truth — this skill
only routes you there and pins the traps that shipped real bugs:

- **UTC vs local time split is deliberate**: `getMondayOfWeek`/`addDays`/
  `isoDate` in `admin-schedule/route.ts` are UTC; `localToday()`/`daysAgo()` in
  `lib/schedule-helpers.ts` are local. Do NOT merge them.
- **Airtable date filters**: `{Date}<='endStr'` silently drops records ON
  `endStr` — always use the exclusive upper bound `{Date}<'dayAfterEnd'`.
- **Linked-record filtering**: neither `{Student}='recXXX'` nor
  `FIND('recXXX', ARRAYJOIN({Student}))` works (ARRAYJOIN gives display names).
  Filter by other fields, then match `r.fields['Student']?.[0] === studentId`
  in JS.
- **All admin web UI actions are silent** (no Telegram) — the notification
  policy lives in the doc.
- Query the live Airtable schema before coding against any table (CLAUDE.md
  § Airtable Schema).
