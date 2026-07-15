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

  try {
    // Student display fields (name may have changed in Airtable since activation)
    try {
      const student = await airtableRequest('Students', `/${studentId}`);
      firstName = ((student.fields?.['Student Name'] as string) || firstName).split(' ')[0];
      level = (student.fields?.['Level'] as string) || level;
    } catch { /* fall back to portal_accounts copies */ }

    // Lessons: past 14 days (topics/homework) through next 14 days (upcoming).
    // Airtable gotchas: exclusive upper bound; linked-record match done in JS.
    const today = todaySGT();
    const from = iso(addDays(today, -14));
    const toExcl = iso(addDays(today, 15));
    const formula = encodeURIComponent(
      `AND({Date}>='${from}',{Date}<'${toExcl}',{Status}!='Cancelled',{Status}!='Cancelled - Prorated')`
    );
    const { records } = await airtableRequestAll(
      'Lessons',
      `?filterByFormula=${formula}&fields[]=Date&fields[]=Student&fields[]=Slot&fields[]=Type&fields[]=Status&fields[]=Topics Covered&fields[]=Topics Free Text&fields[]=Homework Assigned&sort[0][field]=Date&sort[0][direction]=asc`
    );
    const mine = records.filter((r: any) => r.fields['Student']?.[0] === studentId);

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

  const data = { firstName, level, nextLesson, weekLessons, lastTopics, homeworkAssigned };
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
