import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';
import { sgtDayStart } from '@/lib/sgt';
import { resolveActiveExamType, nextExamType, scheduleExamTypes, pickDisplaySeason, ExamType } from '@/lib/exam-season';
import { decodeExamNotes } from '@/lib/exam-notes-markers';
import { subjectsFromRevisionLineItems, assignRevisionSessions } from '@/lib/revision-sessions';
import { resolveRescheduleChain, ChainLesson } from '@/lib/reschedule-chain';
import { cachedScheduleStatic } from '@/lib/schedule-static-cache';
import { SEC_CAP_SETTING, parseSecCapOverride, effectiveCapacity } from '@/lib/capacity-override';
import { SLOT_WINDOWS_SETTING, parseSlotWindows, slotVisibleInWeek } from '@/lib/slot-windows';

export const runtime = 'nodejs';

function getMondayOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const fetchAll = (table: string, query: string) =>
  airtableRequestAll(table, query).then(r => r.records);

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get('week') || isoDate(new Date());
  const monday = getMondayOfWeek(weekParam);
  const sunday = addDays(monday, 6);
  const weekStart = isoDate(monday);
  const weekEnd = isoDate(sunday);

  // Use exclusive upper bound (+1 day) because Airtable coerces Date to
  // datetime midnight, so <= '2026-04-26' stops before the day's lessons.
  const weekEndExclusive = isoDate(addDays(sunday, 1));
  // Lessons tab shows all lessons for the week. Cancelled lessons are fetched
  // too (then split out below) so the UI can show a faded "Cancelled" chip for
  // an enrolled student instead of a misleading "tap to mark" ghost — e.g. a
  // student whose June regular lesson was cancelled for a Revision Sprint.
  // - Includes Status='Rescheduled' (faded chip with a "→ date" indicator)
  // - Includes Status='Absent' — dimmed chips so past slots stay visible
  const lessonsFilter = `AND({Date}>='${weekStart}',{Date}<'${weekEndExclusive}')`;

  // Fetch slots, enrollments, and lessons in parallel
  // ── Stage 1: everything independent, in one parallel burst ──────────────────
  // (settings + topic-timeline don't depend on the week's data at all)
  // Slots / Enrollments / Topic Timeline are week-independent and change
  // rarely, so they're served through a 60s in-memory cache (see
  // lib/schedule-static-cache.ts — enrollment-writing routes invalidate it).
  // The unfiltered Enrollments scan in particular pages through the ENTIRE
  // enrollment history and is the slowest part of week navigation.
  // Lessons + Settings are always fetched live.
  const [slotsData, enrollmentsData, lessonsData, settingsData, tlRecords, upcomingData, reschedSourcesData] = await Promise.all([
    cachedScheduleStatic('slots', () =>
      fetchAll('Slots', `?filterByFormula=${encodeURIComponent(`{Is Active}=1`)}`)),
    // ALL enrollments (not just Active) with their tenure dates, so the Roster
    // can show who was enrolled during the VIEWED week, not just who's enrolled
    // now. Slot switches END the old enrollment + CREATE a new one (tenure is
    // preserved, never edited in place), so a past week's roster is derivable.
    // Overlap is filtered in JS below to sidestep Airtable's date-coercion gotcha.
    cachedScheduleStatic('enrollments', () =>
      fetchAll('Enrollments', `?fields[]=Student&fields[]=Slot&fields[]=Start Date&fields[]=End Date&fields[]=Status`)),
    (async () => {
      const baseQuery = `?filterByFormula=${encodeURIComponent(lessonsFilter)}&sort[0][field]=Date&sort[0][direction]=asc&fields[]=Date&fields[]=Slot&fields[]=Student&fields[]=Type&fields[]=Status&fields[]=Notes&fields[]=Rescheduled Lesson ID&fields[]=Progress Logged&fields[]=Is Revision Makeup`;
      // 'Booked Via' may not exist in Airtable yet — an unknown name in
      // fields[] 422s the whole request, so fall back without it rather than
      // break the schedule.
      try { return await fetchAll('Lessons', baseQuery + `&fields[]=Booked Via`); }
      catch { return fetchAll('Lessons', baseQuery); }
    })(),
    airtableRequest('Settings', `?filterByFormula=${encodeURIComponent(`OR({Setting Name}='exam_season_override',{Setting Name}='${SEC_CAP_SETTING}',{Setting Name}='${SLOT_WINDOWS_SETTING}')`)}&maxRecords=3`).catch(() => ({ records: [] })),
    // Current topics ({Current}=1) AND planned next-lesson topics (no Started
    // date) — the chip shows both. Key is -v2: the old cached shape lacked the
    // Current/Started fields this split needs.
    cachedScheduleStatic('topic-timeline-v2', () =>
      fetchAll('Topic Timeline', `?filterByFormula=${encodeURIComponent(`OR({Current}=1,{Started}='')`)}&fields[]=Student&fields[]=Subject&fields[]=Topic&fields[]=Current&fields[]=Started`).catch(() => [] as any[])),
    // Reschedule SOURCES (Status='Rescheduled') across a ±6/7-month window, so
    // destination chips can say where they came FROM even when the source lies
    // outside the viewed week (bot-created makeups say just "Makeup lesson" —
    // no parseable origin note). Month-quantized bounds keep the cache key
    // stable across week navigation; the widest source→dest gap on record is
    // 128 days, so ±6 months has ample headroom. Reschedule-mutating routes
    // call invalidateScheduleStatics().
    // Upcoming lessons for ~6 weeks past the viewed week, so each chip can say
    // when the student's NEXT lesson is ("next Sat, 1 Aug") even when it falls
    // outside this week's fetch. Live (not cached): bookings change too often.
    fetchAll('Lessons',
      `?filterByFormula=${encodeURIComponent(`AND({Date}>='${weekStart}',{Date}<'${isoDate(addDays(sunday, 43))}',{Status}!='Cancelled',{Status}!='Absent',{Status}!='Rescheduled')`)}&fields[]=Date&fields[]=Student&fields[]=Slot`
    ).catch(() => [] as any[]),
    cachedScheduleStatic(`resched-sources:${weekStart.slice(0, 7)}`, () => {
      const [wy, wm] = weekStart.split('-').map(Number);
      const monthISO = (y: number, m0: number) => new Date(Date.UTC(y, m0, 1)).toISOString().slice(0, 10);
      const from = monthISO(wy, wm - 1 - 6);
      const to = monthISO(wy, wm - 1 + 7);
      return fetchAll('Lessons',
        `?filterByFormula=${encodeURIComponent(`AND({Status}='Rescheduled',{Date}>='${from}',{Date}<'${to}')`)}&fields[]=Date&fields[]=Slot&fields[]=Rescheduled Lesson ID`
      ).catch(() => [] as any[]);
    }),
  ]);

  // Resolve exam season immediately (needed to include the exams fetch in stage 2).
  // The Settings fetch carries every flag row in one call — pick each by name.
  const settingsByName: Record<string, string> = {};
  for (const r of settingsData.records ?? []) {
    const name = r.fields?.['Setting Name'];
    if (name) settingsByName[name] = r.fields?.['Value'] ?? '';
  }
  let stage1ForceOn: ExamType | null = null;
  try {
    const v = JSON.parse(settingsByName['exam_season_override'] || '{}');
    if (['WA1', 'WA2', 'WA3', 'EOY'].includes(v.forceOn)) stage1ForceOn = v.forceOn as ExamType;
  } catch {}
  const resolvedExamType = resolveActiveExamType(stage1ForceOn);
  const scheduleExamTypesToFetch = scheduleExamTypes(resolvedExamType);
  // Sec-capacity toggle: slots below carry EFFECTIVE capacities so every client
  // surface (roster counts, full badges, slot pickers) follows automatically.
  const secCap = parseSecCapOverride(settingsByName[SEC_CAP_SETTING] ?? null);

  // Date-windowed slots: a one-off ad-hoc week is a normal weekly Slot row (the
  // table has no dates), so without this it would recur on the calendar
  // forever. Slots whose window misses the viewed week drop out of the grid and
  // the pickers; unwindowed slots — the entire regular timetable — pass through
  // untouched. Lessons already booked into a closed-window slot still render:
  // extraSlotIds below re-fetches any slot this week's lessons reference.
  const slotWindows = parseSlotWindows(settingsByName[SLOT_WINDOWS_SETTING] ?? null);
  const visibleSlots = Object.keys(slotWindows).length
    ? slotsData.filter((r: any) => slotVisibleInWeek(slotWindows[r.id], weekStart, weekEnd))
    : slotsData;

  // Split out cancelled lessons — they don't belong in the main lessons array
  // (which the grid renders), but the UI needs them to replace ghost chips.
  const activeLessonRecs = lessonsData.filter((r: any) => r.fields['Status'] !== 'Cancelled');
  const cancelledLessons = lessonsData
    .filter((r: any) => r.fields['Status'] === 'Cancelled')
    .map((r: any) => ({
      studentId: r.fields['Student']?.[0] || null,
      date: r.fields['Date'] || '',
      slotId: r.fields['Slot']?.[0] || null,
      notes: r.fields['Notes'] || '',
    }));

  // Collect rescheduled-lesson IDs so we can look up the new lesson's date
  const rescheduledNewIds = activeLessonRecs
    .filter((r: any) => r.fields['Status'] === 'Rescheduled')
    .map((r: any) => r.fields['Rescheduled Lesson ID']?.[0])
    .filter(Boolean) as string[];

  // Collect all unique student IDs (from both enrollments and lessons)
  const studentIds = [
    ...new Set([
      ...enrollmentsData.map((r: any) => r.fields['Student']?.[0]),
      ...lessonsData.map((r: any) => r.fields['Student']?.[0]),
    ].filter(Boolean)),
  ] as string[];

  // Extra (inactive/adhoc) slots referenced by this week's lessons
  const stage1SlotIds = new Set(visibleSlots.map((r: any) => r.id));
  const extraSlotIds = [
    ...new Set(
      // Include reschedule-source slots so an origin label ("↩ from …") can
      // name the time even when the source sat in an inactive/adhoc slot.
      [...lessonsData, ...reschedSourcesData]
        .map((r: any) => r.fields['Slot']?.[0])
        .filter((id: string | undefined) => id && !stage1SlotIds.has(id))
    ),
  ] as string[];

  const hasRevisionLessons = activeLessonRecs.some((r: any) => r.fields['Type'] === 'Revision Sprint');

  // ── Stage 2: every fetch that depends only on stage 1, in one parallel burst.
  // Previously these ran one after another (~6 sequential Airtable round-trips).
  const [newLessons, studentsData, extraSlotsData, revInvData, examsData] = await Promise.all([
    rescheduledNewIds.length
      ? fetchAll('Lessons', `?filterByFormula=${encodeURIComponent(`OR(${rescheduledNewIds.map(id => `RECORD_ID()='${id}'`).join(',')})`)}&fields[]=Date&fields[]=Slot&fields[]=Status&fields[]=Rescheduled Lesson ID`)
      : Promise.resolve([] as any[]),
    studentIds.length
      ? fetchAll('Students', `?filterByFormula=${encodeURIComponent(`OR(${studentIds.map((id) => `RECORD_ID()='${id}'`).join(',')})`)}&fields[]=Student Name&fields[]=Level&fields[]=Subjects`)
      : Promise.resolve([] as any[]),
    extraSlotIds.length
      ? fetchAll('Slots', `?filterByFormula=${encodeURIComponent(`OR(${extraSlotIds.map(id => `RECORD_ID()='${id}'`).join(',')})`)}`)
      : Promise.resolve([] as any[]),
    hasRevisionLessons
      ? fetchAll('Invoices', `?filterByFormula=${encodeURIComponent(`AND({Invoice Type}='Revision Sprint',{Status}!='Voided')`)}&fields[]=Student&fields[]=Line Items`)
      : Promise.resolve([] as any[]),
    // Active season + the NEXT one (+ Prelim/Promo): late in a window Adrian
    // enters next season's info (EOY during WA3) and the chip must show it.
    // In the gap between windows this is "just finished + next" — not nothing.
    scheduleExamTypesToFetch.length
      ? fetchAll('Exams', `?filterByFormula=${encodeURIComponent(`OR(${scheduleExamTypesToFetch.map(t => `{Exam Type}='${t}'`).join(',')})`)}&fields[]=Student&fields[]=Subject&fields[]=Exam Date&fields[]=Tested Topics&fields[]=Exam Notes&fields[]=No Exam&fields[]=Exam Type`).catch(() => [] as any[])
      : Promise.resolve([] as any[]),
  ]);

  // ── Reschedule CHAINS ───────────────────────────────────────────────────────
  // A moved lesson's replacement can itself be moved, so `Rescheduled Lesson ID`
  // is a chain. Fetch onward hops until every chain terminates — almost always 0
  // extra rounds (only ~5% of moved lessons move twice), so this costs nothing in
  // the common case. Resolution/classification lives in lib/reschedule-chain.ts.
  const chainById: Record<string, ChainLesson> = {};
  const addToChain = (recs: any[]) => {
    for (const r of recs) {
      chainById[r.id] = {
        id: r.id,
        date: r.fields['Date'] ?? '',
        status: r.fields['Status'] ?? '',
        slotId: r.fields['Slot']?.[0] ?? null,
        rescheduledToId: r.fields['Rescheduled Lesson ID']?.[0] ?? null,
      };
    }
  };
  addToChain(newLessons);
  for (let round = 0; round < 10; round++) {
    const missing = [...new Set(
      Object.values(chainById)
        .filter(l => l.status === 'Rescheduled' && l.rescheduledToId && !chainById[l.rescheduledToId])
        .map(l => l.rescheduledToId as string)
    )];
    if (!missing.length) break;
    const more = await fetchAll('Lessons',
      `?filterByFormula=${encodeURIComponent(`OR(${missing.map(id => `RECORD_ID()='${id}'`).join(',')})`)}&fields[]=Date&fields[]=Slot&fields[]=Status&fields[]=Rescheduled Lesson ID`
    ).catch(() => [] as any[]);
    if (!more.length) break; // deleted record — resolveRescheduleChain reports 'broken'
    addToChain(more);
  }
  const todayISO = localToday();

  const studentsById: Record<string, any> = Object.fromEntries(
    studentsData.map((r: any) => [
      r.id,
      { name: r.fields['Student Name'] || '', level: r.fields['Level'] || '', subjects: r.fields['Subjects'] || [] },
    ])
  );

  // Normalize day name to full English name regardless of Airtable storage format
  // (handles abbreviated "Sun", numeric-prefix "7 Sunday", plain "Sunday", etc.)
  const DAY_NORMALIZE: Record<string, string> = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
    friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
  };

  // Parse slots
  const mapSlot = (r: any) => {
    const dayRaw: string = r.fields['Day'] || '';
    const match = dayRaw.match(/^(\d+)\s+(.+)/);
    const dayNum = match ? parseInt(match[1]) : 9;
    const rawName = (match ? match[2].trim() : dayRaw.trim()).toLowerCase();
    const dayName = DAY_NORMALIZE[rawName] || (match ? match[2].trim() : dayRaw.trim());
    return {
      id: r.id,
      dayRaw,
      dayNum,
      dayName,
      time: r.fields['Time'] || '',
      level: r.fields['Level'] || '',
      capacity: r.fields['Normal Capacity'] || 0,
      // EFFECTIVE per-date cap — the Sec toggle lowers this (6 → 5); the
      // reschedule/add pickers and their "full" maths follow automatically.
      makeupCapacity: effectiveCapacity(r.fields['Makeup Capacity'] ?? null, r.fields['Level'], secCap),
      enrolledCount: r.fields['Enrolled Count'] || 0,
      // A dated slot is a ONE-OFF session, never part of the weekly timetable.
      // Its Level can be Secondary/JC (ad-hoc Sec and JC sessions exist), so
      // "is it Adhoc?" no longer answers this — every join-a-weekly-class
      // surface must test `dated`, not the level.
      dated: Boolean(slotWindows[r.id]),
      window: slotWindows[r.id] ?? null,
    };
  };

  const slots = visibleSlots.map(mapSlot);

  // Merge in the extra (inactive/adhoc) slots pre-fetched in stage 2.
  for (const r of extraSlotsData) slots.push(mapSlot(r));

  // EVERY active dated session, whatever week it falls in. `slots` above is
  // week-filtered, which is right for the grid and wrong for the date pickers:
  // Add Lesson and Reschedule let Adrian pick any date, so booking a 16 Aug
  // lesson into the 20 Aug ad-hoc session found no Thursday slot at all and the
  // dropdown came up empty (Adrian, 18 Aug 2026). Clients filter this list with
  // slotOpenOnDate(window, chosenDate) — it must never feed the weekly grid.
  const datedSlots = Object.keys(slotWindows).length
    ? slotsData.filter((r: any) => slotWindows[r.id]).map(mapSlot)
    : [];

  // enrollmentsBySlot: slotId → studentId[], as the roster stood DURING the
  // viewed week. An enrollment counts if its tenure overlaps [weekStart,weekEnd]:
  // it had started by week-end (missing Start Date = "since forever") and hadn't
  // ended before the week began (missing End Date = still open). So a past week
  // shows that week's real membership — a since-departed student reappears, and
  // a switched student sits in the slot they were actually in then, not today's.
  const enrollmentsBySlot: Record<string, string[]> = {};
  // Tenure per entry, for DAY-level checks. The week-overlap list above is right for
  // the Roster tab, but the Lessons tab's "tap to mark" ghosts are per DATE — a
  // student whose enrollment ended mid-week must not ghost on the days after it
  // ended (Chow Wen Zheng, discontinued effective Sat 1 Aug, still ghosted on that
  // Saturday because her Mon–Fri tenure overlapped the week; 1 Aug 2026).
  const enrollmentTenureBySlot: Record<string, { studentId: string; start: string; end: string }[]> = {};
  for (const r of enrollmentsData) {
    const slotId = r.fields['Slot']?.[0];
    const studentId = r.fields['Student']?.[0];
    if (!slotId || !studentId) continue;
    const start = (r.fields['Start Date'] as string) || '';
    const end = (r.fields['End Date'] as string) || '';
    const startedByWeekEnd = !start || start <= weekEnd;
    const notEndedBeforeWeek = !end || end >= weekStart;
    if (!startedByWeekEnd || !notEndedBeforeWeek) continue;
    if (!enrollmentsBySlot[slotId]) enrollmentsBySlot[slotId] = [];
    if (!enrollmentsBySlot[slotId].includes(studentId)) enrollmentsBySlot[slotId].push(studentId);
    (enrollmentTenureBySlot[slotId] ||= []).push({ studentId, start, end });
  }

  function isTimeRelatedNote(note: string): boolean {
    return /\d{1,2}[:.]\d{2}|(?:early|late|delay|arriv|leav|start|end|finish|cancel|\d+\s*(?:min|hr|hour)|half[\s-]?hour)/i.test(note);
  }

  // ── Reverse reschedule lookup: where did a Rescheduled/Makeup lesson come
  // FROM? Sources link forward via Rescheduled Lesson ID (a linked field, so
  // it can't be formula-filtered by record id) — the windowed
  // reschedSourcesData fetch covers sources up to ±6 months outside the viewed
  // week; the week's own records refresh the same entries. Note-parse
  // ("Rescheduled from …" / "Makeup for …") stays as a last-resort fallback.
  const sourceByDestId: Record<string, { date: string; slotId: string | null }> = {};
  for (const r of [...reschedSourcesData, ...lessonsData]) {
    const destId = r.fields['Rescheduled Lesson ID']?.[0];
    if (destId) sourceByDestId[destId] = { date: r.fields['Date'] || '', slotId: r.fields['Slot']?.[0] || null };
  }
  const fmtDayDate = (iso: string): string => {
    try {
      return sgtDayStart(iso).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
    } catch { return iso; }
  };
  function rescheduledFromLabel(lessonId: string, type: string, rawNote: string): string | null {
    if (type !== 'Rescheduled' && type !== 'Makeup') return null;
    const src = sourceByDestId[lessonId];
    if (src?.date) {
      const slot = visibleSlots.find((s: any) => s.id === src.slotId) || extraSlotsData.find((s: any) => s.id === src.slotId);
      const time = slot?.fields?.['Time'] || '';
      return `${fmtDayDate(src.date)}${time ? ` ${time}` : ''}`;
    }
    const m = rawNote.match(/(?:Rescheduled from|Makeup for)\s+([^|]+)/i);
    return m ? m[1].trim() : null;
  }

  const lessons = activeLessonRecs.map((r: any) => {
    const rawNote: string = r.fields['Notes'] || '';
    const type: string = r.fields['Type'] || 'Regular';
    // Trial lessons store the student name in Notes — preserve the full value.
    // For other types, only surface timing-related notes (truncated to 80 chars).
    const filteredNote = type === 'Trial' || isTimeRelatedNote(rawNote) ? rawNote.slice(0, 80) : '';
    const rescheduledNewId = r.fields['Rescheduled Lesson ID']?.[0] ?? null;
    const chain = resolveRescheduleChain(rescheduledNewId, chainById, todayISO);
    return {
      id: r.id,
      date: r.fields['Date'] || '',
      slotId: r.fields['Slot']?.[0] || null,
      studentId: r.fields['Student']?.[0] || null,
      type,
      status: r.fields['Status'] || '',
      notes: filteredNote,
      // Where the lesson ACTUALLY ended up (chain walked to its end), not the
      // first hop: a lesson moved twice then taught used to report the middle
      // date and read as pending.
      rescheduledToDate: chain.finalDate,
      rescheduledToSlotTime: (() => {
        const sid = chain.finalSlotId;
        if (!sid) return '';
        const slot = slots.find((s: any) => s.id === sid);
        return slot?.time ?? '';
      })(),
      rescheduledToStatus: chain.finalStatus,
      // Where a Rescheduled/Makeup lesson came FROM ("Fri, 24 Jul 3-5pm") —
      // same-week source record, else parsed from the stamped note.
      rescheduledFrom: rescheduledFromLabel(r.id, type, rawNote),
      // What became of it — 'delivered' | 'missed' | 'cancelled' | 'upcoming' |
      // 'unmarked' | 'broken'. The chip colours by THIS, not by status alone:
      // a makeup the student also missed is not the same as one still to come.
      rescheduledOutcome: chain.outcome,
      // >1 means it was moved more than once (the chip shows a ↻n hint).
      rescheduledHops: chain.hops,
      // A makeup created for a missed June-holiday revision lesson (Additional
      // lesson at a regular Sec slot) — flagged so the chip can say so.
      revisionMakeup: r.fields['Is Revision Makeup'] === true || /revision makeup/i.test(rawNote),
      progressLogged: r.fields['Progress Logged'] === true,
      // Actor attribution — who booked this lesson ('Web admin' / 'Bot (parent)'
      // / 'Bot (student)' / 'Bot (admin)' / 'WhatsApp (…)'); null on records
      // created before the field existed. Shown in the chip action sheet.
      bookedVia: (r.fields['Booked Via'] as string) || null,
    };
  });

  // ── Revision Sprint session labels ────────────────────────────────────────
  // Revision lessons have no Slot, so the schedule renders them in a separate
  // "Revision Sprint" card. Derive each one's subject/time (EM 10–12 / AM 1–3 /
  // H2 2–5) from the student's signed-up subjects + the sprint date schedule.
  const revisionLessons = lessons.filter((l: any) => l.type === 'Revision Sprint');
  if (revisionLessons.length) {
    const invData = revInvData; // pre-fetched in stage 2
    const subjectsByStudent: Record<string, string[]> = {};
    for (const r of invData) {
      const sid = r.fields['Student']?.[0];
      if (sid) subjectsByStudent[sid] = subjectsFromRevisionLineItems(r.fields['Line Items'] || '');
    }
    const byStudent: Record<string, { id: string; date: string }[]> = {};
    for (const l of revisionLessons) {
      if (!l.studentId) continue;
      (byStudent[l.studentId] = byStudent[l.studentId] || []).push({ id: l.id, date: l.date });
    }
    const labelById: Record<string, { subject: string; subjectLabel: string; time: string }> = {};
    for (const sid of Object.keys(byStudent)) {
      const sorted = byStudent[sid].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      Object.assign(labelById, assignRevisionSessions(subjectsByStudent[sid] || [], sorted));
    }
    for (const l of lessons as any[]) {
      const lbl = labelById[l.id];
      if (l.type === 'Revision Sprint' && lbl) {
        l.revisionSubject = lbl.subject;
        l.revisionTime = lbl.time;
        l.revisionLabel = `${lbl.subjectLabel} · ${lbl.time}`;
      }
    }
  }

  // ── Exam season + exam dates ──────────────────────────────────────────────
  let activeExamType: ExamType | null = null;
  const examsByStudent: Record<string, string | null> = {};
  const examTopicsByStudent: Record<string, string | null> = {};
  const examApproxByStudent: Record<string, boolean> = {};
  // Students who sit Project Work / an Alternative Assessment INSTEAD of a WA.
  // sid → 'Project Work' | 'Alternative Assessment'. (No WA exam, but the chip
  // says what to expect rather than "no upcoming exam".)
  const examAssessmentByStudent: Record<string, string> = {};
  // Full per-subject/per-paper entries for the exam quick-add dialog + chip dropdown
  // — the student's DISPLAY season only (see examSeasonByStudent).
  type ExamEntryOut = { subject: string; paper: string; examType: string; date: string | null; topics: string; notes: string; approx: boolean; photoUrl: string | null; noExam?: boolean };
  const examEntriesByStudent: Record<string, ExamEntryOut[]> = {};
  // Every loaded season's entries (active + next + Prelim/Promo) — the dialog
  // rebuilds its rows from these when Adrian switches the exam-type select.
  const examAllEntriesByStudent: Record<string, ExamEntryOut[]> = {};
  // Which season each student's chip shows + whether it still has an exam
  // ahead. Two seasons can be loaded at once (WA3 wrapping up, EOY being
  // entered); pickDisplaySeason chooses the upcoming one (lib/exam-season).
  const examSeasonByStudent: Record<string, { examType: string; upcoming: boolean }> = {};
  const upcomingExamType = nextExamType(resolvedExamType);

  try {
    // Exam type + exams were resolved/fetched in stages 1–2.
    activeExamType = resolvedExamType;
    {
      // Paper is encoded into Subject ("E Math (P1)") — no Paper field needed.
      const parseSubject = (raw: string): { subject: string; paper: string } => {
        const m = (raw || '').match(/^(.*)\s*\((P1|P2)\)\s*$/);
        if (m) return { subject: m[1].trim(), paper: m[2] === 'P1' ? 'Paper 1' : 'Paper 2' };
        return { subject: (raw || '').trim(), paper: '' };
      };
      // Approximate ("week only") dates carry a "~|" marker in Exam Notes; the
      // photo used for 📷 topic extraction rides along as a trailing
      // "\n📷|<url>" marker (lib/exam-notes-markers).
      const parseNotes = (raw: string): { approx: boolean; notes: string; photoUrl: string | null } => decodeExamNotes(raw || '');
      // Group by student, pick the season to display, then build the chip maps
      // from THAT season's records only (other seasons still ride along in
      // examAllEntriesByStudent for the dialog).
      const recsByStudent: Record<string, any[]> = {};
      for (const r of examsData) {
        const sid: string | undefined = r.fields['Student']?.[0];
        if (sid) (recsByStudent[sid] ||= []).push(r);
      }
      const sgtToday = localToday();
      const displayRecs: any[] = [];
      for (const [sid, recs] of Object.entries(recsByStudent)) {
        const pick = pickDisplaySeason(
          recs.map(r => ({ examType: (r.fields['Exam Type'] as string) || '', examDate: (r.fields['Exam Date'] as string) || null, noExam: r.fields['No Exam'] === true })),
          activeExamType, sgtToday,
        );
        if (pick.examType) examSeasonByStudent[sid] = { examType: pick.examType, upcoming: pick.upcoming };
        for (const r of recs) {
          if (r.fields['No Exam'] === true) {
            // No-Exam marker (raw notes keep the PWAA: label for the dialog).
            (examAllEntriesByStudent[sid] ||= []).push({
              subject: '', paper: '', examType: (r.fields['Exam Type'] as string) || '', date: null, topics: '',
              notes: (r.fields['Exam Notes'] as string) || '', approx: false, photoUrl: null, noExam: true,
            });
            continue;
          }
          const parsed = parseSubject((r.fields['Subject'] as string) || '');
          const pn = parseNotes((r.fields['Exam Notes'] as string) || '');
          (examAllEntriesByStudent[sid] ||= []).push({
            subject: parsed.subject, paper: parsed.paper,
            examType: (r.fields['Exam Type'] as string) || '',
            date: (r.fields['Exam Date'] as string) || null,
            topics: (r.fields['Tested Topics'] as string) || '',
            notes: pn.notes, approx: pn.approx, photoUrl: pn.photoUrl,
          });
          if (r.fields['Exam Type'] === pick.examType) displayRecs.push(r);
        }
        for (const r of recs) if (r.fields['No Exam'] === true && r.fields['Exam Type'] === pick.examType) displayRecs.push(r);
      }
      // Build studentId → earliest exam date (chip badge) + full entries (dialog/dropdown)
      for (const r of displayRecs) {
        const sid: string | undefined = r.fields['Student']?.[0];
        if (!sid) continue;
        const noExam: boolean = r.fields['No Exam'] === true;
        if (noExam) {
          examsByStudent[sid] = 'NO_EXAM'; // takes precedence over any date
          // A "PWAA:<type>" marker in Exam Notes = has PW/AA instead of a WA.
          const notes = (r.fields['Exam Notes'] as string) || '';
          if (notes.startsWith('PWAA:')) examAssessmentByStudent[sid] = notes.slice(5).trim();
          continue;
        }
        const examDate: string | undefined = r.fields['Exam Date'];
        // Record the entry (even a date-less one carries topics/notes for the dialog)
        const parsed = parseSubject((r.fields['Subject'] as string) || '');
        const pn = parseNotes((r.fields['Exam Notes'] as string) || '');
        (examEntriesByStudent[sid] ||= []).push({
          subject: parsed.subject,
          paper: parsed.paper,
          examType: (r.fields['Exam Type'] as string) || '',
          date: examDate || null,
          topics: (r.fields['Tested Topics'] as string) || '',
          notes: pn.notes,
          approx: pn.approx,
          photoUrl: pn.photoUrl,
        });
        if (examsByStudent[sid] === 'NO_EXAM') continue; // already flagged
        if (!examDate) continue;
        if (!examsByStudent[sid] || examDate < examsByStudent[sid]!) {
          examsByStudent[sid] = examDate;
          examTopicsByStudent[sid] = (r.fields['Tested Topics'] as string) || null;
          examApproxByStudent[sid] = pn.approx;
        }
      }
    }
  } catch (err) {
    console.error('[admin-schedule] exam fetch failed:', err);
  }

  // Current "working on" + planned "next lesson" topics per student (for the
  // chip) — fetched in stage 1. A planned row has no Started date and isn't
  // Current (see topic-timeline route).
  const currentTopicByStudent: Record<string, { subject: string; topic: string }[]> = {};
  const nextTopicByStudent: Record<string, { subject: string; topic: string }[]> = {};
  try {
    for (const r of tlRecords) {
      const sid = r.fields['Student']?.[0];
      if (!sid || !r.fields['Topic']) continue;
      const entry = { subject: r.fields['Subject'] || '', topic: r.fields['Topic'] };
      if (r.fields['Current'] === true) (currentTopicByStudent[sid] ||= []).push(entry);
      else if (!r.fields['Started']) (nextTopicByStudent[sid] ||= []).push(entry);
    }
  } catch (err) {
    console.error('[admin-schedule] topic timeline fetch failed:', err);
  }

  // Per-student upcoming occupying lessons (sorted by date) — the client finds
  // the first one AFTER each chip's date to label "next Sat, 1 Aug".
  const upcomingLessonsByStudent: Record<string, { date: string; slotId: string | null }[]> = {};
  for (const r of upcomingData) {
    const sid = r.fields['Student']?.[0];
    const date = r.fields['Date'];
    if (!sid || !date) continue;
    (upcomingLessonsByStudent[sid] ||= []).push({ date, slotId: r.fields['Slot']?.[0] ?? null });
  }
  for (const sid of Object.keys(upcomingLessonsByStudent)) {
    upcomingLessonsByStudent[sid].sort((a, b) => a.date.localeCompare(b.date));
  }

  return NextResponse.json({
    weekStart,
    weekEnd,
    secCap,
    slots,
    datedSlots,
    enrollmentsBySlot,
    enrollmentTenureBySlot,
    lessons,
    cancelledLessons,
    students: studentsById,
    activeExamType,
    nextExamType: upcomingExamType,
    examsByStudent,
    examTopicsByStudent,
    examApproxByStudent,
    examAssessmentByStudent,
    examEntriesByStudent,
    examAllEntriesByStudent,
    examSeasonByStudent,
    currentTopicByStudent,
    nextTopicByStudent,
    upcomingLessonsByStudent,
  });
}
