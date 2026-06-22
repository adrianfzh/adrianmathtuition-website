// GET /api/admin-revision-attendance
// Revision-sprint attendance + makeup tracking for the /admin/revision-signups
// "Attendance" tab. Returns, per signed-up student, their revision sessions
// (date · subject · time · status) with any linked makeup, plus a summary.
//
// Revision lessons were created with only {Student, Date, Type='Revision Sprint'},
// so the subject/time is DERIVED here from the student's signed-up subjects and
// the fixed sprint date schedule (EM dates ⊂ AM dates, so EM+AM students have
// two records on shared dates — assigned deterministically by record id).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

// POST — two actions for the Attendance tab:
//   { action:'mark',   lessonId, status }                    → set a revision lesson's Status
//   { action:'makeup', lessonId, studentId, date, slotId }   → create a makeup lesson at a
//        regular slot (Type 'Additional'), mark the revision lesson Absent, and link them
//   { action:'unmakeup', lessonId }                          → delete the makeup + relink
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    if (body.action === 'mark') {
      const { lessonId, status } = body;
      if (!lessonId || !status) return NextResponse.json({ error: 'lessonId and status required' }, { status: 400 });
      await airtableRequest('Lessons', `/${lessonId}`, {
        method: 'PATCH', body: JSON.stringify({ fields: { Status: status } }),
      });
      return NextResponse.json({ success: true });
    }

    // Set the topics covered in this revision lesson (freeform, comma-separated).
    // Stored on 'Topics Free Text'; the GET merges it with any 'Topics Covered'.
    if (body.action === 'topics') {
      const { lessonId, topics } = body;
      if (!lessonId) return NextResponse.json({ error: 'lessonId required' }, { status: 400 });
      await airtableRequest('Lessons', `/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'Topics Free Text': (topics || '').trim() } }),
      });
      return NextResponse.json({ success: true });
    }

    // Set the homework state for this revision lesson on 'Homework Returned':
    //   value 'Yes' = handed up, 'No' = not handed up, '' = clear/unset.
    // (Back-compat: a boolean `submitted` still maps to 'Yes'/clear.)
    if (body.action === 'assignment') {
      const { lessonId, value, submitted } = body;
      if (!lessonId) return NextResponse.json({ error: 'lessonId required' }, { status: 400 });
      const v = value !== undefined ? value : (submitted ? 'Yes' : '');
      await airtableRequest('Lessons', `/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'Homework Returned': v || null } }),
      });
      return NextResponse.json({ success: true });
    }

    if (body.action === 'makeup') {
      const { lessonId, studentId, date, slotId } = body;
      if (!lessonId || !studentId || !date || !slotId) {
        return NextResponse.json({ error: 'lessonId, studentId, date, slotId required' }, { status: 400 });
      }
      // 1. Create the makeup lesson at the chosen regular slot
      const makeup = await airtableRequest('Lessons', '', {
        method: 'POST',
        body: JSON.stringify({ fields: {
          Student: [studentId], Slot: [slotId], Date: date,
          Type: 'Revision Makeup', Status: 'Scheduled', Notes: 'Revision makeup',
          'Is Revision Makeup': true,
        }}),
      });
      // 2. Mark the revision lesson Rescheduled (NOT Absent) + link to the makeup.
      //    Consistent with regular reschedules — its real outcome is read from the
      //    makeup's status, so it never shows a misleading red "Absent" once made up.
      await airtableRequest('Lessons', `/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { Status: 'Rescheduled', 'Rescheduled Lesson ID': [makeup.id] } }),
      });
      return NextResponse.json({ success: true, makeupId: makeup.id });
    }

    // Undo a makeup. Accept EITHER the revision lessonId (Attendance tab) OR the
    // makeupId (the Additional chip on /admin/schedule). Either way: delete the
    // makeup lesson, and revert the linked revision lesson to Scheduled.
    // Undo a makeup. Accept EITHER the revision lessonId (Attendance tab) OR the
    // makeupId (the Additional chip on /admin/schedule). Either way: delete the
    // makeup lesson and unlink. When undone from the schedule (makeupId path), the
    // original was rescheduled-ahead so revert it to Scheduled; from the Attendance
    // tab (lessonId path) it was genuinely missed, so leave it Absent.
    if (body.action === 'unmakeup') {
      let { lessonId } = body;
      const { makeupId: makeupIdIn } = body;
      let makeupId: string | undefined;
      let revertToScheduled = false;

      if (makeupIdIn && !lessonId) {
        revertToScheduled = true;
        // Find the Revision Sprint lesson whose Rescheduled Lesson ID points here.
        // (Can't filter linked-record by id in a formula — match in JS.)
        const revs = await airtableRequestAll('Lessons',
          `?filterByFormula=${encodeURIComponent(`AND({Type}='Revision Sprint',OR({Status}='Rescheduled',{Status}='Absent'))`)}&fields[]=Rescheduled Lesson ID`);
        const match = (revs.records || []).find((r: any) => r.fields['Rescheduled Lesson ID']?.[0] === makeupIdIn);
        lessonId = match?.id;
        makeupId = makeupIdIn;
      }

      if (!lessonId) {
        // No linked revision lesson found — at least remove the orphan makeup.
        if (makeupIdIn) await airtableRequest('Lessons', `/${makeupIdIn}`, { method: 'DELETE' }).catch(() => {});
        return NextResponse.json({ success: true });
      }

      if (!makeupId) {
        const rev = await airtableRequest('Lessons', `/${lessonId}`);
        makeupId = rev.fields['Rescheduled Lesson ID']?.[0];
      }
      if (makeupId) {
        await airtableRequest('Lessons', `/${makeupId}`, { method: 'DELETE' }).catch(() => {});
      }
      // Lesson was 'Rescheduled' while a makeup existed; on undo set it explicitly:
      // reschedule-ahead (schedule path) → back to Scheduled; genuinely-missed
      // (attendance path) → Absent.
      await airtableRequest('Lessons', `/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'Rescheduled Lesson ID': [], Status: revertToScheduled ? 'Scheduled' : 'Absent' } }),
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[admin-revision-attendance] POST error:', err.message);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

// Sprint schedule (mirrors admin-revision-signup)
const SUBJECT_DATES: Record<string, string[]> = {
  EM: ['2026-06-02', '2026-06-05', '2026-06-09', '2026-06-12', '2026-06-16', '2026-06-19'],
  AM: ['2026-06-02', '2026-06-05', '2026-06-09', '2026-06-12', '2026-06-16', '2026-06-19', '2026-06-23', '2026-06-26'],
  JC: ['2026-06-01', '2026-06-04', '2026-06-08', '2026-06-11', '2026-06-15', '2026-06-18', '2026-06-22', '2026-06-25'],
};
// Topic schedule per subject+date — mirrors the public /june-revision/{sec4,jc2}
// pages. Used to auto-fill each session's topics when none are set manually.
const SCHEDULE_TOPICS: Record<string, Record<string, string>> = {
  EM: {
    '2026-06-02': 'Algebra + Indices',
    '2026-06-05': 'Coordinate Geometry + Graphs',
    '2026-06-09': 'Trigonometry + Congruency & Similarity',
    '2026-06-12': 'Circle Properties + Circular Measure',
    '2026-06-16': 'Mensuration + Real World Qns',
    '2026-06-19': 'Number Patterns + Proportion + Polygons',
  },
  AM: {
    '2026-06-02': 'Quadratic Functions + Surds',
    '2026-06-05': 'Indices & Logarithms',
    '2026-06-09': 'Coordinate Geometry & Circles',
    '2026-06-12': 'Linear Law + Binomial Theorem',
    '2026-06-16': 'Polynomials & Partial Fractions + Plane Geometry',
    '2026-06-19': 'Trigonometry',
    '2026-06-23': 'Differentiation and Applications',
    '2026-06-26': 'Integration and Applications',
  },
  JC: {
    '2026-06-01': 'Graphing Techniques + Functions',
    '2026-06-04': 'APGP + Series & Sequences',
    '2026-06-08': 'Differentiation Techniques and Applications',
    '2026-06-11': 'Integration Techniques and Applications + Differential Equations',
    '2026-06-15': 'Vectors',
    '2026-06-18': 'Complex Numbers + P&C',
    '2026-06-22': 'Probability + DRV',
    '2026-06-25': 'Binomial + Normal + Sampling Distributions',
  },
};
function scheduledTopics(subj: string, date: string): string[] {
  const raw = SCHEDULE_TOPICS[subj]?.[date];
  return raw ? raw.split(/\s*\+\s*/).map(t => t.trim()).filter(Boolean) : [];
}

const SUBJECT_META: Record<string, { label: string; time: string }> = {
  EM: { label: 'E Math', time: '10am–12pm' },
  AM: { label: 'A Math', time: '1–3pm' },
  JC: { label: 'H2 Math', time: '2–5pm' },
};
// Order subjects are assigned in (matters for shared dates)
const SUBJECT_ORDER = ['EM', 'AM', 'JC'];

// Topics Covered (JSON array of canonical names) + Topics Free Text (comma list).
function parseTopics(fields: any): string[] {
  const out: string[] = [];
  try {
    const arr = JSON.parse(fields['Topics Covered'] || '[]');
    if (Array.isArray(arr)) out.push(...arr.map((t: any) => String(t).trim()).filter(Boolean));
  } catch { /* ignore malformed */ }
  const free = (fields['Topics Free Text'] || '').trim();
  if (free) out.push(...free.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean));
  return [...new Set(out)];
}

// Classify a revision lesson's real outcome, folding in its makeup's status.
//   attended             — present on the day
//   rescheduled_attended — missed the day, but the makeup was attended  → counts as done (green)
//   rescheduled_pending  — missed the day, makeup booked but not yet held → blue
//   rescheduled_missed   — missed the day AND missed the makeup          → red
//   missed               — missed, no makeup booked                      → red
//   scheduled            — upcoming / not yet marked                     → grey
function sessionOutcome(status: string, makeup: { status?: string } | null): string {
  if (status === 'Completed') return 'attended';
  // 'Rescheduled' (current) OR legacy 'Absent'-with-makeup: outcome comes from the makeup.
  if (status === 'Rescheduled' || (status === 'Absent' && makeup)) {
    if (makeup) {
      if (makeup.status === 'Completed') return 'rescheduled_attended';
      if (makeup.status === 'Absent') return 'rescheduled_missed';
      return 'rescheduled_pending';
    }
    return 'rescheduled_pending';   // rescheduled but makeup record missing (edge)
  }
  if (status === 'Absent') return 'missed';
  return 'scheduled';
}

function subjectsFromLineItems(raw: string): string[] {
  let items: { description?: string }[] = [];
  try { items = JSON.parse(raw || '[]'); } catch { /* ignore */ }
  const subs = new Set<string>();
  for (const it of items) {
    const d = (it.description || '').toLowerCase();
    if (d.includes('e math') || /\bem\b/.test(d)) subs.add('EM');
    else if (d.includes('a math') || /\bam\b/.test(d)) subs.add('AM');
    else if (d.includes('h2') || d.includes('jc')) subs.add('JC');
  }
  return SUBJECT_ORDER.filter(s => subs.has(s));
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 1. Signed-up students
  const studentsData = await airtableRequestAll(
    'Students',
    `?filterByFormula=${encodeURIComponent(`{June Revision 2026}='Signed Up'`)}&fields[]=Student Name&fields[]=Level`
  );
  const signedUp = studentsData.records;
  const signedUpIds = new Set(signedUp.map((r: any) => r.id));
  if (!signedUp.length) return NextResponse.json({ students: [], slots: [] });

  // 2. Subjects per student (from the Revision Sprint invoice line items).
  //    Prefer a live invoice, but fall back to a Voided one — a student whose
  //    revision invoice was voided (e.g. consolidated into a final invoice, like a
  //    discontinuing student) still attends the sprint and must keep their subject
  //    grouping rather than dropping into "Other".
  const invData = await airtableRequestAll(
    'Invoices',
    `?filterByFormula=${encodeURIComponent(`{Invoice Type}='Revision Sprint'`)}&fields[]=Student&fields[]=Line Items&fields[]=Status`
  );
  const subjectsByStudent: Record<string, string[]> = {};
  const voidedSubjects: Record<string, string[]> = {};
  for (const r of invData.records) {
    const sid = r.fields['Student']?.[0];
    if (!sid) continue;
    const subs = subjectsFromLineItems(r.fields['Line Items'] || '');
    if (!subs.length) continue;
    if (r.fields['Status'] === 'Voided') { if (!voidedSubjects[sid]) voidedSubjects[sid] = subs; }
    else subjectsByStudent[sid] = subs;
  }
  for (const sid in voidedSubjects) if (!subjectsByStudent[sid]) subjectsByStudent[sid] = voidedSubjects[sid];

  // 3. All Revision Sprint lessons, grouped by student
  const revLessons = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(`{Type}='Revision Sprint'`)}&fields[]=Student&fields[]=Date&fields[]=Status&fields[]=Rescheduled Lesson ID&fields[]=Homework Returned&fields[]=Topics Covered&fields[]=Topics Free Text`
  );
  const revByStudent: Record<string, any[]> = {};
  for (const r of revLessons.records) {
    const sid = r.fields['Student']?.[0];
    if (!sid || !signedUpIds.has(sid)) continue;
    (revByStudent[sid] = revByStudent[sid] || []).push(r);
  }

  // 4. Fetch the linked makeup lessons (for date + slot labels)
  const makeupIds = [...new Set(
    revLessons.records.flatMap((r: any) => r.fields['Rescheduled Lesson ID'] || [])
  )] as string[];
  const makeupById: Record<string, any> = {};
  let slotsById: Record<string, any> = {};
  const slotsData = await airtableRequestAll('Slots',
    `?filterByFormula=${encodeURIComponent(`{Is Active}=1`)}&fields[]=Day&fields[]=Time&fields[]=Level&fields[]=Makeup Capacity`);
  slotsById = Object.fromEntries(slotsData.records.map((r: any) => [r.id, r.fields]));
  if (makeupIds.length) {
    const mk = await airtableRequestAll('Lessons',
      `?filterByFormula=OR(${makeupIds.map(id => `RECORD_ID()='${id}'`).join(',')})&fields[]=Date&fields[]=Slot&fields[]=Status`);
    for (const r of mk.records) makeupById[r.id] = r.fields;
  }

  function slotLabel(slotId: string | undefined): string {
    if (!slotId) return '';
    const s = slotsById[slotId];
    if (!s) return '';
    const day = (s['Day'] || '').toString().replace(/^\d+\s+/, '').trim();
    return `${day} ${s['Time'] || ''}`.trim();
  }

  // 5. Build per-student sessions
  const students = signedUp.map((stu: any) => {
    const sid = stu.id;
    const subjects = subjectsByStudent[sid] || [];
    const lessons = (revByStudent[sid] || []).slice().sort((a, b) =>
      (a.fields['Date'] || '').localeCompare(b.fields['Date'] || '') || a.id.localeCompare(b.id));

    // Assign subject labels: walk subjects in order, claim an unlabeled lesson per expected date.
    const claimed = new Set<string>();
    const sessions: any[] = [];
    for (const subj of subjects) {
      for (const date of SUBJECT_DATES[subj] || []) {
        const lesson = lessons.find(l => l.fields['Date'] === date && !claimed.has(l.id));
        if (!lesson) continue;
        claimed.add(lesson.id);
        const makeupLinkId = lesson.fields['Rescheduled Lesson ID']?.[0];
        const mk = makeupLinkId ? makeupById[makeupLinkId] : null;
        sessions.push({
          lessonId: lesson.id,
          date,
          subject: subj,
          subjectLabel: SUBJECT_META[subj]?.label || subj,
          time: SUBJECT_META[subj]?.time || '',
          status: lesson.fields['Status'] || 'Scheduled',
          hw: lesson.fields['Homework Returned'] || '',
          assignmentSubmitted: lesson.fields['Homework Returned'] === 'Yes',
          topics: (() => { const m = parseTopics(lesson.fields); return m.length ? m : scheduledTopics(subj, date); })(),
          makeup: mk ? { lessonId: makeupLinkId, date: mk['Date'] || '', slotLabel: slotLabel(mk['Slot']?.[0]), status: mk['Status'] || '' } : null,
        });
      }
    }
    // Any revision lessons that didn't match a known subject/date (edge case)
    for (const l of lessons) {
      if (claimed.has(l.id)) continue;
      const makeupLinkId = l.fields['Rescheduled Lesson ID']?.[0];
      const mk = makeupLinkId ? makeupById[makeupLinkId] : null;
      sessions.push({
        lessonId: l.id, date: l.fields['Date'] || '', subject: '?', subjectLabel: 'Revision', time: '',
        status: l.fields['Status'] || 'Scheduled',
        hw: l.fields['Homework Returned'] || '',
        assignmentSubmitted: l.fields['Homework Returned'] === 'Yes',
        topics: parseTopics(l.fields),
        makeup: mk ? { lessonId: makeupLinkId, date: mk['Date'] || '', slotLabel: slotLabel(mk['Slot']?.[0]), status: mk['Status'] || '' } : null,
      });
    }
    sessions.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    // Per-session outcome — distinguishes a rescheduled lesson that was attended
    // (its makeup is Completed) from one whose makeup is still pending or also missed.
    for (const s of sessions) s.outcome = sessionOutcome(s.status, s.makeup);

    // Green (done) = attended directly OR rescheduled-and-attended.
    // Red (not attended) = missed outright OR rescheduled-but-makeup-also-missed.
    const attended = sessions.filter(s => s.outcome === 'attended' || s.outcome === 'rescheduled_attended').length;
    const missed = sessions.filter(s => s.outcome === 'missed' || s.outcome === 'rescheduled_missed').length;
    const rescheduled = sessions.filter(s => !!s.makeup).length;        // any lesson that was rescheduled
    const pending = sessions.filter(s => s.outcome === 'rescheduled_pending').length;
    return {
      id: sid,
      name: stu.fields['Student Name'] || '',
      level: stu.fields['Level'] || '',
      subjects,
      sessions,
      // outstanding = not attended and no successful/upcoming makeup → still needs action.
      summary: { total: sessions.length, attended, missed, rescheduled, madeUp: rescheduled, pending, outstanding: sessions.filter(s => s.outcome === 'missed' || s.outcome === 'rescheduled_missed').length },
    };
  });

  // Slots available for makeups (any active slot with makeup capacity)
  const slots = slotsData.records
    .map((r: any) => {
      const day = (r.fields['Day'] || '').toString().replace(/^\d+\s+/, '').trim();
      return { id: r.id, dayName: day, time: r.fields['Time'] || '', level: r.fields['Level'] || '', label: `${day} ${r.fields['Time'] || ''}`.trim() };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  students.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ students, slots });
}
