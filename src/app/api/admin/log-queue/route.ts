// /api/admin/log-queue — every lesson still waiting to be written up.
//
// GET → { today, cutoff, lessons: [...], topicsByLevel }
//
// This is the read half of /admin/log, the end-of-day one-tap logging screen.
// The writes go through the EXISTING routes (`lesson-update`, `lesson-prev-update`,
// `attendance`) — this route deliberately owns no mutation, so the 14-day edit
// window and the Progress Logged auto-set stay defined in exactly one place.
//
// A lesson is "waiting" when it has happened (date ≤ today), is still live
// (Scheduled or Completed — not Absent/Cancelled/Rescheduled), and
// `Progress Logged` is false. That is the same population the /admin hub's
// "❓ unmarked lessons" card counts, widened to include lessons whose
// attendance WAS marked but whose progress never was.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday, daysAgo, EDIT_WINDOW_DAYS } from '@/lib/schedule-helpers';
import { getTopicsForLevel, type TopicCategory } from '@/lib/canonical-topics';
import { parseTopicsField } from '@/lib/progress-digest';

export const runtime = 'nodejs';

// How far back to look for the previous lesson that carries the plan + the
// homework that was set. A month covers a fortnightly student comfortably.
const PREV_LOOKBACK_DAYS = 45;

interface QueueLesson {
  lessonId: string;
  date: string;
  studentId: string;
  studentName: string;
  level: string;
  slotId: string | null;
  slotLabel: string;
  status: string;
  type: string;
  mastery: string;
  mood: string;
  topics: string[];
  homeworkAssigned: string;
  homeworkReturned: string;
  lessonNotes: string;
  nextLessonPlan: string;
  /** The lesson before this one — where the plan and the set homework live. */
  prev: { date: string; homeworkAssigned: string; nextLessonPlan: string } | null;
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = localToday();
  // Nothing older than the edit window can be saved, so nothing older belongs
  // in a queue — showing it would only offer taps the server will refuse.
  const cutoff = daysAgo(EDIT_WINDOW_DAYS);
  const tomorrow = addDaysIso(today, 1);
  const lookbackStart = addDaysIso(cutoff, -PREV_LOOKBACK_DAYS);

  const BASE_FIELDS = [
    'Student', 'Date', 'Status', 'Type', 'Slot', 'Mastery', 'Mood',
    'Topics Covered', 'Topics Free Text', 'Lesson Notes',
    'Homework Assigned', 'Homework Returned', 'Progress Logged', 'Student Level',
  ].map(f => `fields[]=${encodeURIComponent(f)}`).join('&');

  // Exclusive upper bound — `{Date}<='today'` silently drops today's records
  // when Date is date-typed (the repo-wide Airtable date-filter gotcha).
  const formula =
    `AND({Date}>='${lookbackStart}',{Date}<'${tomorrow}',` +
    `{Status}!='Cancelled',{Status}!='Cancelled - Prorated')`;

  const query = (extraFields: string) =>
    airtableRequestAll(
      'Lessons',
      `?filterByFormula=${encodeURIComponent(formula)}&${BASE_FIELDS}${extraFields}` +
      `&sort[0][field]=Date&sort[0][direction]=desc`
    );

  let records: any[];
  try {
    // `Next Lesson Plan` may not exist in the base yet, and an unknown name in
    // fields[] 422s the WHOLE list request. Retry without it rather than let a
    // missing optional field take the entire screen down.
    const data = await query('&fields[]=Next Lesson Plan').catch(err => {
      if (!String(err?.message ?? '').includes('UNKNOWN_FIELD_NAME')) throw err;
      console.warn('[log-queue] Next Lesson Plan missing from base — continuing without it');
      return query('');
    });
    records = data.records;
  } catch (err: any) {
    console.error('[log-queue] lesson fetch failed:', err);
    return NextResponse.json({ error: err?.message || 'Airtable error' }, { status: 500 });
  }

  // Slot labels (small table, fetched whole) and student names.
  const [slotsData, studentsData] = await Promise.all([
    airtableRequestAll('Slots', '?fields[]=Day&fields[]=Time').catch(() => ({ records: [] as any[] })),
    airtableRequestAll('Students', "?filterByFormula=" + encodeURIComponent("{Status}='Active'") + '&fields[]=Student Name&fields[]=Level')
      .catch(() => ({ records: [] as any[] })),
  ]);
  const slotLabel = new Map<string, string>();
  for (const s of slotsData.records) {
    const day = String(s.fields['Day'] ?? '').replace(/^\d\s*/, '');
    const time = String(s.fields['Time'] ?? '');
    slotLabel.set(s.id, [day, time].filter(Boolean).join(' '));
  }
  const studentMeta = new Map<string, { name: string; level: string }>();
  for (const s of studentsData.records) {
    studentMeta.set(s.id, { name: s.fields['Student Name'] || 'Unknown', level: s.fields['Level'] || '' });
  }

  // Records are date-desc; the first match per student below a given date is
  // that lesson's predecessor.
  const byStudent = new Map<string, any[]>();
  for (const r of records) {
    const sid = r.fields['Student']?.[0];
    if (!sid) continue;
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid)!.push(r);
  }

  const lessons: QueueLesson[] = [];
  for (const r of records) {
    const sid = r.fields['Student']?.[0];
    if (!sid) continue;
    const date = String(r.fields['Date'] ?? '');
    const status = String(r.fields['Status'] ?? '');
    if (!date || date < cutoff || date > today) continue;          // outside the editable window
    if (status !== 'Scheduled' && status !== 'Completed') continue; // Absent/Rescheduled need no write-up
    if (r.fields['Progress Logged']) continue;                     // already done

    const meta = studentMeta.get(sid);
    const siblings = byStudent.get(sid) ?? [];
    const prevRec = siblings.find((x: any) => {
      const d = String(x.fields['Date'] ?? '');
      return d && d < date && x.fields['Status'] !== 'Absent';
    });

    lessons.push({
      lessonId: r.id,
      date,
      studentId: sid,
      // A discontinued student can still have an unlogged lesson in the window;
      // fall back to the lookup field rather than dropping the row.
      studentName: meta?.name || r.fields['Student Name'] || 'Unknown',
      level: meta?.level || r.fields['Student Level']?.[0] || '',
      slotId: r.fields['Slot']?.[0] ?? null,
      slotLabel: slotLabel.get(r.fields['Slot']?.[0]) ?? '',
      status,
      type: String(r.fields['Type'] ?? ''),
      mastery: String(r.fields['Mastery'] ?? ''),
      mood: String(r.fields['Mood'] ?? ''),
      topics: parseTopicsField(r.fields),
      homeworkAssigned: String(r.fields['Homework Assigned'] ?? ''),
      homeworkReturned: String(r.fields['Homework Returned'] ?? ''),
      lessonNotes: String(r.fields['Lesson Notes'] ?? ''),
      nextLessonPlan: String(r.fields['Next Lesson Plan'] ?? ''),
      prev: prevRec
        ? {
            date: String(prevRec.fields['Date'] ?? ''),
            homeworkAssigned: String(prevRec.fields['Homework Assigned'] ?? ''),
            nextLessonPlan: String(prevRec.fields['Next Lesson Plan'] ?? ''),
          }
        : null,
    });
  }

  // Newest first. Writing up the day you just taught is the everyday case, and
  // an oldest-first list buries today under a fortnight of backlog. The lessons
  // about to fall out of the edit window are surfaced by a banner instead of by
  // the sort order.
  lessons.sort((a, b) => b.date.localeCompare(a.date) || a.studentName.localeCompare(b.studentName));

  const topicsByLevel: Record<string, TopicCategory[]> = {};
  for (const l of lessons) {
    if (l.level && !(l.level in topicsByLevel)) topicsByLevel[l.level] = getTopicsForLevel(l.level);
  }

  return NextResponse.json({ today, cutoff, lessons, topicsByLevel });
}
