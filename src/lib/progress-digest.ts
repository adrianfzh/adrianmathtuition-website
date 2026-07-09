// Progress digests — shared data layer + builders for:
//   1. Weekly admin digest (Telegram, cron Mon 8am SGT)
//   2. Monthly parent digest DRAFTS (AI-written, stored in Supabase `parent_digests`)
//   3. Term digest DRAFTS (post WA1/WA2/WA3/EOY — lesson logs + exam result)
//
// All data comes from Airtable Lessons progress fields (Mastery / Topics /
// Homework / Lesson Notes) + the Exams table (Result Score / Result Total /
// Result Grade / Result Notes — verified against live schema 2026-07-08).
// Drafts are NEVER auto-sent — /admin/digests is the review + copy surface.
import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';
import { airtableRequestAll } from '@/lib/airtable';
import type { ExamType } from '@/lib/exam-season';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DigestStudent {
  id: string;
  name: string;
  level: string;
  subjects: string[];
}

export interface DigestLesson {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  status: string;
  type: string;
  mastery: string; // 'Strong' | 'OK' | 'Slow' | ''
  mood: string;
  topics: string[];
  lessonNotes: string;
  homeworkAssigned: string;
  homeworkReturned: string; // 'Yes' | 'Partial' | 'No' | ''
  homeworkReturnedReason: string;
  progressLogged: boolean;
}

export interface DigestExam {
  studentId: string;
  examType: string;
  examDate: string | null;
  subject: string | null;
  testedTopics: string | null;
  score: number | null;
  total: number | null;
  grade: string | null;
  resultNotes: string | null;
}

// ── Date helpers (server-local, matching lib/schedule-helpers convention) ─────

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

// ── Airtable fetchers ──────────────────────────────────────────────────────────

export async function fetchActiveStudents(): Promise<Map<string, DigestStudent>> {
  const data = await airtableRequestAll(
    'Students',
    `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}` +
      `&fields[]=Student Name&fields[]=Level&fields[]=Subjects`
  );
  const map = new Map<string, DigestStudent>();
  for (const r of data.records) {
    map.set(r.id, {
      id: r.id,
      name: r.fields['Student Name'] || 'Unknown',
      level: r.fields['Level'] || '',
      subjects: r.fields['Subjects'] || [],
    });
  }
  return map;
}

/**
 * Lessons in [start, endExclusive) — exclusive upper bound per the Airtable
 * date-filter gotcha ({Date}<='end' silently drops records ON the end date).
 * Cancelled lessons are excluded. Student matched in JS (linked-record fields
 * can't be filtered by record id in a formula).
 */
export async function fetchLessonsInRange(start: string, endExclusive: string): Promise<DigestLesson[]> {
  const formula = `AND({Date}>='${start}',{Date}<'${endExclusive}',{Status}!='Cancelled',{Status}!='Cancelled - Prorated')`;
  const fields = [
    'Student', 'Date', 'Status', 'Type', 'Mastery', 'Mood',
    'Topics Covered', 'Topics Free Text', 'Lesson Notes',
    'Homework Assigned', 'Homework Returned', 'Homework Returned Reason',
    'Progress Logged',
  ].map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(formula)}&${fields}&sort[0][field]=Date&sort[0][direction]=asc`
  );
  return data.records
    .filter((r: any) => r.fields['Student']?.[0])
    .map((r: any) => ({
      id: r.id,
      studentId: r.fields['Student'][0],
      date: r.fields['Date'] || '',
      status: r.fields['Status'] || '',
      type: r.fields['Type'] || '',
      mastery: r.fields['Mastery'] || '',
      mood: r.fields['Mood'] || '',
      topics: parseTopics(r.fields),
      lessonNotes: r.fields['Lesson Notes'] || '',
      homeworkAssigned: r.fields['Homework Assigned'] || '',
      homeworkReturned: r.fields['Homework Returned'] || '',
      homeworkReturnedReason: r.fields['Homework Returned Reason'] || '',
      progressLogged: !!r.fields['Progress Logged'],
    }));
}

/** Exams of one type with an Exam Date in the given year (or no date but created for it). */
export async function fetchExamsForType(examType: ExamType, year: number): Promise<DigestExam[]> {
  const formula = `AND({Exam Type}='${examType}',NOT({No Exam}))`;
  const data = await airtableRequestAll(
    'Exams',
    `?filterByFormula=${encodeURIComponent(formula)}` +
      `&fields[]=Student&fields[]=Exam Type&fields[]=Exam Date&fields[]=Subject&fields[]=Tested Topics` +
      `&fields[]=Result Score&fields[]=Result Total&fields[]=Result Grade&fields[]=Result Notes`
  );
  return data.records
    .filter((r: any) => {
      if (!r.fields['Student']?.[0]) return false;
      const d = r.fields['Exam Date'];
      return !d || String(d).startsWith(String(year));
    })
    .map((r: any) => ({
      studentId: r.fields['Student'][0],
      examType: r.fields['Exam Type'],
      examDate: r.fields['Exam Date'] || null,
      subject: r.fields['Subject'] || null,
      testedTopics: r.fields['Tested Topics'] || null,
      score: r.fields['Result Score'] ?? null,
      total: r.fields['Result Total'] ?? null,
      grade: r.fields['Result Grade'] || null,
      resultNotes: r.fields['Result Notes'] || null,
    }));
}

// Topics Covered (JSON array of canonical names) + Topics Free Text (comma list).
// Same parse as /api/admin-revision-attendance.
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

// ── 1. Weekly admin digest (Telegram HTML) ─────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface WeeklyDigestResult {
  messages: string[]; // Telegram-ready HTML chunks (<4096 chars each)
  studentsCovered: number;
  flaggedStudents: number;
}

/**
 * Per student with ≥1 lesson in [weekStart, weekEndExclusive):
 *   mastery trend (over trendLessons — the wider 28-day window, so "Slow ×2"
 *   and "HW not done repeatedly" catch patterns a single week can't show),
 *   red flags, one line each.
 */
export function buildWeeklyDigest(opts: {
  weekLabel: string;
  weekStart: string;
  weekEndExclusive: string;
  today: string;
  lessons: DigestLesson[]; // 28-day trend window, sorted by date asc
  students: Map<string, DigestStudent>;
}): WeeklyDigestResult {
  const { weekLabel, weekStart, weekEndExclusive, today, lessons, students } = opts;

  const byStudent = new Map<string, DigestLesson[]>();
  for (const l of lessons) {
    if (!byStudent.has(l.studentId)) byStudent.set(l.studentId, []);
    byStudent.get(l.studentId)!.push(l);
  }

  const lines: string[] = [];
  let flagged = 0;
  const entries = [...byStudent.entries()]
    .map(([sid, ls]) => ({ student: students.get(sid), all: ls, week: ls.filter(l => l.date >= weekStart && l.date < weekEndExclusive) }))
    .filter(e => e.student && e.week.length > 0)
    .sort((a, b) => a.student!.name.localeCompare(b.student!.name));

  for (const { student, all, week } of entries) {
    const s = student!;
    // Mastery trend over the trend window (deduped consecutive values)
    const masteries = all.filter(l => l.mastery).map(l => l.mastery);
    const trend = masteries.filter((m, i) => i === 0 || m !== masteries[i - 1]);
    const trendStr = trend.length ? trend.join('→') : 'no mastery logged';

    // Red flags
    const flags: string[] = [];
    const slowCount = all.filter(l => l.mastery === 'Slow').length;
    if (slowCount >= 2) flags.push(`🔴 Slow ×${slowCount}`);
    const hwMissed = all.filter(l => l.homeworkReturned === 'No').length;
    if (hwMissed >= 2) flags.push(`📕 HW not done ×${hwMissed}`);
    const unlogged = week.filter(l => l.date <= today && !l.progressLogged && l.status !== 'Rescheduled' && l.status !== 'Absent').length;
    if (unlogged > 0) flags.push(`✏️ ${unlogged} unlogged`);
    if (flags.length) flagged++;

    const topics = [...new Set(week.flatMap(l => l.topics))].slice(0, 3);
    const parts = [
      `• <b>${esc(s.name)}</b> (${esc(s.level)}): ${esc(trendStr)}`,
      topics.length ? esc(topics.join(', ')) : '',
      flags.length ? `⚠ ${flags.join(' · ')}` : '',
    ].filter(Boolean);
    lines.push(parts.join(' — '));
  }

  const header =
    `📬 <b>Weekly progress digest</b> — ${esc(weekLabel)}\n` +
    `${entries.length} student${entries.length === 1 ? '' : 's'} had lessons · ${flagged} flagged\n`;

  // Telegram caps messages at 4096 chars — chunk on line boundaries.
  const messages: string[] = [];
  let current = header;
  for (const line of lines.length ? lines : ['(no lessons logged this week)']) {
    if (current.length + line.length + 1 > 3800) {
      messages.push(current);
      current = '(cont.)\n';
    }
    current += '\n' + line;
  }
  messages.push(current);

  return { messages, studentsCovered: entries.length, flaggedStudents: flagged };
}

// ── 2 & 3. AI parent digest drafts (monthly + term) ────────────────────────────

const MONTH_SYSTEM = `You write progress summaries for parents of students at a Singapore math tuition centre (O-Level E/A Math and JC H2 Math), on behalf of the tutor, Adrian.

Write ONE summary for the student described, based ONLY on the lesson logs provided — never invent topics, results, or behaviour that isn't in the logs.

Rules:
- Warm, concrete, professional. Address the parent, refer to the student by first name.
- UNDER 150 words. Plain markdown (short paragraphs and/or a few bullets). No heading, no salutation ("Dear..."), no sign-off — Adrian adds those when sending.
- Cover: topics covered this period, genuine strengths observed, 1–2 focus areas, and homework consistency.
- Be honest but constructive about weak spots ("we're reinforcing...", "worth extra practice on...").
- If the logs are sparse, keep it shorter rather than padding.`;

const TERM_SYSTEM = `You write end-of-term progress reports for parents of students at a Singapore math tuition centre (O-Level E/A Math and JC H2 Math), on behalf of the tutor, Adrian.

Write ONE report for the student described, based ONLY on the lesson logs and exam result provided — never invent topics, results, or behaviour that isn't in the data.

Rules:
- Warm, concrete, professional. Address the parent, refer to the student by first name.
- UNDER 250 words. Plain markdown (short paragraphs and/or a few bullets). No heading, no salutation, no sign-off — Adrian adds those when sending.
- Consolidate the term: topics covered, how mastery developed across the term, homework consistency, genuine strengths, and 1–2 focus areas going forward.
- If an exam result is given, weave it into the picture (score/percentage/grade, and what it reflects). If no result is given, do NOT mention or speculate about the exam.
- Be honest but constructive about weak spots.`;

function lessonLogBlock(lessons: DigestLesson[]): string {
  return lessons.slice(0, 45).map(l => {
    const bits = [
      `${l.date} (${l.type}${l.status && l.status !== 'Completed' ? `, ${l.status}` : ''})`,
      l.topics.length ? `topics: ${l.topics.join(', ')}` : '',
      l.mastery ? `mastery: ${l.mastery}` : '',
      l.mood ? `mood: ${l.mood}` : '',
      l.homeworkAssigned ? `HW set: ${l.homeworkAssigned.slice(0, 120)}` : '',
      l.homeworkReturned ? `HW returned: ${l.homeworkReturned}${l.homeworkReturnedReason ? ` (${l.homeworkReturnedReason.slice(0, 80)})` : ''}` : '',
      l.lessonNotes ? `notes: ${l.lessonNotes.slice(0, 250)}` : '',
    ].filter(Boolean);
    return `- ${bits.join(' | ')}`;
  }).join('\n');
}

function examBlock(exam: DigestExam): string {
  const pct = exam.score != null && exam.total ? ` (${Math.round((exam.score / exam.total) * 1000) / 10}%)` : '';
  const bits = [
    `type: ${exam.examType}`,
    exam.subject ? `subject: ${exam.subject}` : '',
    exam.examDate ? `date: ${exam.examDate}` : '',
    exam.score != null && exam.total != null ? `score: ${exam.score}/${exam.total}${pct}` : '(no result recorded)',
    exam.grade ? `grade: ${exam.grade}` : '',
    exam.testedTopics ? `tested topics: ${exam.testedTopics.slice(0, 300)}` : '',
    exam.resultNotes ? `result notes: ${exam.resultNotes.slice(0, 300)}` : '',
  ].filter(Boolean);
  return bits.join(' | ');
}

export interface DraftGenResult {
  studentId: string;
  studentName: string;
  bodyMd: string;
  examJson: Record<string, unknown> | null;
}

/**
 * Generate parent-facing draft summaries with claude-opus-4-8, one call per
 * student, 3 concurrent. Students with zero logged lessons in range are skipped.
 */
export async function generateParentDrafts(opts: {
  period: 'month' | 'term';
  periodLabel: string;
  lessons: DigestLesson[];
  students: Map<string, DigestStudent>;
  exams?: DigestExam[];
}): Promise<{ drafts: DraftGenResult[]; errors: { studentName: string; error: string }[] }> {
  const { period, periodLabel, lessons, students, exams = [] } = opts;

  const byStudent = new Map<string, DigestLesson[]>();
  for (const l of lessons) {
    if (!byStudent.has(l.studentId)) byStudent.set(l.studentId, []);
    byStudent.get(l.studentId)!.push(l);
  }
  const examByStudent = new Map<string, DigestExam>();
  for (const e of exams) if (!examByStudent.has(e.studentId)) examByStudent.set(e.studentId, e);

  const client = new Anthropic();
  const limit = pLimit(3);
  const drafts: DraftGenResult[] = [];
  const errors: { studentName: string; error: string }[] = [];

  const tasks = [...byStudent.entries()]
    .map(([sid, ls]) => ({ student: students.get(sid), ls }))
    .filter(({ student, ls }) => {
      if (!student) return false;
      // Only draft when there's actually something logged to summarise.
      return ls.some(l => l.progressLogged || l.topics.length > 0 || l.mastery);
    });

  await Promise.all(tasks.map(({ student, ls }) => limit(async () => {
    const s = student!;
    const exam = period === 'term' ? examByStudent.get(s.id) : undefined;
    const user = [
      `STUDENT: ${s.name} (${s.level}${s.subjects.length ? `, ${s.subjects.join(' + ')}` : ''})`,
      `PERIOD: ${periodLabel}`,
      exam ? `EXAM RESULT: ${examBlock(exam)}` : '',
      `LESSON LOGS (${ls.length} lessons):`,
      lessonLogBlock(ls),
    ].filter(Boolean).join('\n\n');

    try {
      const msg = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: period === 'term' ? 1200 : 800,
        system: period === 'term' ? TERM_SYSTEM : MONTH_SYSTEM,
        messages: [{ role: 'user', content: user }],
      });
      const text = msg.content
        .filter(b => b.type === 'text')
        .map(b => (b as { text: string }).text)
        .join('')
        .trim();
      if (!text) throw new Error('empty response');
      drafts.push({
        studentId: s.id,
        studentName: s.name,
        bodyMd: text,
        examJson: exam ? {
          examType: exam.examType,
          examDate: exam.examDate,
          subject: exam.subject,
          score: exam.score,
          total: exam.total,
          percent: exam.score != null && exam.total ? Math.round((exam.score / exam.total) * 1000) / 10 : null,
          grade: exam.grade,
          resultNotes: exam.resultNotes,
        } : null,
      });
    } catch (e: any) {
      console.error(`[progress-digest] draft failed for ${s.name}:`, e?.message || e);
      errors.push({ studentName: s.name, error: e?.message || 'unknown error' });
    }
  })));

  drafts.sort((a, b) => a.studentName.localeCompare(b.studentName));
  return { drafts, errors };
}

// ── Term windows (lesson-log range feeding a term digest) ──────────────────────
// Approximate teaching windows leading into each exam season; MM-DD, current year.
export const TERM_LESSON_WINDOWS: Record<ExamType, { start: string; end: string }> = {
  WA1: { start: '01-01', end: '03-31' },
  WA2: { start: '03-16', end: '06-15' },
  WA3: { start: '06-16', end: '09-15' },
  EOY: { start: '09-01', end: '11-30' },
};
