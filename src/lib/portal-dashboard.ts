// Dashboard data assembly for /app (server-side only).
// Joins Airtable (lessons, slots) with Supabase (practice attempts) for the
// logged-in student. Airtable results are cached per student for 60s — the
// dashboard doesn't need real-time freshness and Airtable is rate-limited (5 rps).
//
// Privacy: only student-appropriate lesson fields leave this module (date, slot
// label, type, status, topics covered, homework assigned). Admin-facing fields
// (Lesson Notes, mastery/mood, reschedule bookkeeping) are deliberately never read.
import { airtableRequestAll, airtableRequest } from './airtable';
import { createSupabaseServer } from './supabase-server';
import type { PortalAccount } from './portal-auth';
import { shapeUpcomingExams, type ExamRecordLike, type UpcomingExam } from './portal-exams';

export interface DashboardLesson {
  date: string;          // YYYY-MM-DD
  slotLabel: string;     // "Mon 7:30pm"
  type: string;          // Regular / Rescheduled / ...
  status: string;        // Scheduled / Completed / ...
}

export interface DashboardData {
  firstName: string;
  level: string | null;
  nextLesson: DashboardLesson | null;
  weekLessons: { completed: number; upcoming: number };
  lastTopics: string[];          // from the most recent past lesson with topics
  homeworkAssigned: string | null;
  /** Home "Next exam" countdown — dated upcoming Exams rows (lib/portal-exams). */
  upcomingExams: UpcomingExam[];
  attemptsThisWeek: number;
  recentAttempts: Array<{ attemptedAt: string; verdict: string | null; via: string }>;
}

const cache = new Map<string, { at: number; data: Omit<DashboardData, 'attemptsThisWeek' | 'recentAttempts'> }>();
const CACHE_MS = 60_000;

function todaySGT(): Date {
  // SGT = UTC+8, no DST
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

async function airtableSection(account: PortalAccount) {
  const cached = cache.get(account.id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  const studentId = account.airtable_student_id;
  let firstName = (account.display_name || account.email).split(' ')[0];
  let level: string | null = account.level;
  let nextLesson: DashboardLesson | null = null;
  const weekLessons = { completed: 0, upcoming: 0 };
  let lastTopics: string[] = [];
  let homeworkAssigned: string | null = null;
  let upcomingExams: UpcomingExam[] = [];

  // Self-serve (stranger) accounts have airtable_student_id = '' — there is
  // no Airtable record or lessons to read, and `/Students/` with an empty id
  // would resolve to the LIST endpoint. The portal_accounts copies above are
  // the whole truth for them.
  if (!studentId) {
    const data = { firstName, level, nextLesson, weekLessons, lastTopics, homeworkAssigned, upcomingExams };
    cache.set(account.id, { at: Date.now(), data });
    return data;
  }

  try {
    // Student display fields (name may have changed in Airtable since
    // activation) and the lessons window are independent — fetch them in
    // parallel (.catch attached immediately so a student-record failure just
    // falls back to the portal_accounts copies, as before).
    const studentPromise = airtableRequest('Students', `/${studentId}`).catch(() => null);

    // Lessons: past 14 days (topics/homework) through next 14 days (upcoming).
    // Airtable gotchas: exclusive upper bound; linked-record match done in JS.
    const today = todaySGT();
    const from = iso(addDays(today, -14));
    const toExcl = iso(addDays(today, 15));
    const formula = encodeURIComponent(
      `AND({Date}>='${from}',{Date}<'${toExcl}',{Status}!='Cancelled',{Status}!='Cancelled - Prorated')`
    );
    // Exams dated today or later (Home's "Next exam" countdown) ride the same
    // batch — no extra latency — and fail soft so an Exams hiccup can never
    // take the lessons down with it. Same gotchas: string date compare on the
    // date-typed field, linked-record match done in JS below.
    const examFormula = encodeURIComponent(`AND({Exam Date}>='${iso(today)}',NOT({No Exam}))`);
    const [student, { records }, exams] = await Promise.all([
      studentPromise,
      airtableRequestAll(
        'Lessons',
        `?filterByFormula=${formula}&fields[]=Date&fields[]=Student&fields[]=Slot&fields[]=Type&fields[]=Status&fields[]=Topics Covered&fields[]=Topics Free Text&fields[]=Homework Assigned&sort[0][field]=Date&sort[0][direction]=asc`
      ),
      airtableRequestAll(
        'Exams',
        `?filterByFormula=${examFormula}&fields[]=Student&fields[]=Exam Type&fields[]=Custom Name&fields[]=Subject&fields[]=Exam Date&fields[]=Tested Topics&fields[]=Exam Notes&fields[]=No Exam`
      ).catch(() => ({ records: [] as any[] })),
    ]);
    if (student) {
      firstName = ((student.fields?.['Student Name'] as string) || firstName).split(' ')[0];
      level = (student.fields?.['Level'] as string) || level;
    }
    const mine = records.filter((r: any) => r.fields['Student']?.[0] === studentId);

    const myExams: ExamRecordLike[] = (exams.records as any[])
      .filter(r => r.fields['Student']?.[0] === studentId)
      .map(r => ({
        id: r.id as string,
        examType: (r.fields['Exam Type'] as string) || '',
        customName: (r.fields['Custom Name'] as string) || '',
        subject: (r.fields['Subject'] as string) || '',
        examDate: (r.fields['Exam Date'] as string) || null,
        testedTopics: (r.fields['Tested Topics'] as string) || '',
        examNotes: (r.fields['Exam Notes'] as string) || '',
        noExam: !!r.fields['No Exam'],
      }));
    upcomingExams = shapeUpcomingExams(myExams, iso(today), level);

    // Slot labels
    const slotIds = [...new Set(mine.map((r: any) => r.fields['Slot']?.[0]).filter(Boolean))] as string[];
    const slotLabel: Record<string, string> = {};
    if (slotIds.length) {
      const slotFilter = encodeURIComponent(`OR(${slotIds.map(id => `RECORD_ID()='${id}'`).join(',')})`);
      const slots = await airtableRequestAll('Slots', `?filterByFormula=${slotFilter}&fields[]=Day&fields[]=Time`);
      for (const s of slots.records) {
        const day = ((s.fields['Day'] as string) || '').replace(/^\d+\s+/, '').slice(0, 3);
        slotLabel[s.id] = `${day} ${s.fields['Time'] || ''}`.trim();
      }
    }

    const todayStr = iso(today);
    // Monday of this week (SGT) for week stats
    const dow = (today.getUTCDay() + 6) % 7; // Mon=0
    const weekStart = iso(addDays(today, -dow));
    const weekEndExcl = iso(addDays(today, 7 - dow));

    for (const r of mine) {
      const f = r.fields;
      const date = f['Date'] as string;
      const lesson: DashboardLesson = {
        date,
        slotLabel: slotLabel[f['Slot']?.[0]] || '',
        type: (f['Type'] as string) || 'Regular',
        status: (f['Status'] as string) || '',
      };
      if (date >= todayStr && lesson.status === 'Scheduled' && !nextLesson) nextLesson = lesson;
      if (date >= weekStart && date < weekEndExcl) {
        if (lesson.status === 'Completed') weekLessons.completed++;
        else if (lesson.status === 'Scheduled' && date >= todayStr) weekLessons.upcoming++;
      }
    }

    // Most recent past lesson with topics → "last lesson covered" + homework
    const past = mine.filter((r: any) => (r.fields['Date'] as string) < todayStr).reverse();
    for (const r of past) {
      const f = r.fields;
      if (lastTopics.length === 0 && (f['Topics Covered'] || f['Topics Free Text'])) {
        try { lastTopics = JSON.parse((f['Topics Covered'] as string) || '[]'); } catch { /* noop */ }
        const free = ((f['Topics Free Text'] as string) || '').split(',').map(s => s.trim()).filter(Boolean);
        lastTopics = [...lastTopics, ...free];
      }
      if (!homeworkAssigned && f['Homework Assigned']) homeworkAssigned = f['Homework Assigned'] as string;
      if (lastTopics.length && homeworkAssigned) break;
    }
  } catch {
    // Airtable down or student record missing — dashboard degrades to practice-only data.
  }

  const data = { firstName, level, nextLesson, weekLessons, lastTopics, homeworkAssigned, upcomingExams };
  cache.set(account.id, { at: Date.now(), data });
  return data;
}

export async function getDashboardData(account: PortalAccount): Promise<DashboardData> {
  const supabase = await createSupabaseServer(); // user-scoped: RLS limits to own rows

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [airtable, attemptsCount, recent] = await Promise.all([
    airtableSection(account),
    supabase
      .from('student_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', account.id)
      .gte('attempted_at', weekAgo)
      .then(r => r.count || 0),
    supabase
      .from('student_attempts')
      .select('attempted_at, marking_verdict, attempted_via')
      .eq('user_id', account.id)
      .order('attempted_at', { ascending: false })
      .limit(5)
      .then(r => (r.data || []).map(a => ({
        attemptedAt: a.attempted_at,
        verdict: a.marking_verdict,
        via: a.attempted_via,
      }))),
  ]);

  return { ...airtable, attemptsThisWeek: attemptsCount, recentAttempts: recent };
}
