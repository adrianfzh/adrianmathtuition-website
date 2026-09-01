// GET /api/progress-digest?period=week|month|term[&examType=WA3]
//
//   period=week  (default — the vercel.json cron, Mon 8am SGT, hits this):
//     Telegram digest to Adrian: per student with lessons last week — mastery
//     trend, red flags (Slow ×2+, HW not done repeatedly, unlogged lessons).
//   period=month:
//     AI parent-facing DRAFTS (<150 words each, claude-opus-4-8) for the
//     previous calendar month (or current month after the 10th) → Supabase
//     `parent_digests` (status='draft'). NEVER auto-sent.
//   period=term&examType=WA3:
//     Same, but consolidates the term's lesson logs + the exam result
//     (Score/Total/%/grade if recorded) into a fuller <250-word report.
//
// Auth: x-vercel-cron header, CRON_SECRET bearer, or standard admin auth
// (signed session cookie / ADMIN_PASSWORD bearer) — same as payment-reminder.
// Regenerating replaces existing DRAFTS for the same (student, period, label);
// rows already marked 'sent' are never touched.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';
import { resolveActiveExamType, type ExamType } from '@/lib/exam-season';
import {
  addDays, isoDate,
  fetchActiveStudents, fetchLessonsInRange, fetchExamsForType,
  buildWeeklyDigest, generateParentDrafts,
  TERM_LESSON_WINDOWS,
  type DigestLesson,
} from '@/lib/progress-digest';
import { buildReportFacts, type ReportFacts, type ReportPaper } from '@/lib/report-facts';

export const runtime = 'nodejs';
export const maxDuration = 300; // month/term generate one AI call per student

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (req.headers.get('x-vercel-cron') === '1') return true;
  if (cronSecret && safeEqual(authHeader ?? '', `Bearer ${cronSecret}`)) return true;
  return verifyAdminAuth(req);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const period = req.nextUrl.searchParams.get('period') || 'week';

  try {
    if (period === 'week') return await runWeekly();
    if (period === 'month') {
      const res = await runMonthly();
      await logJobRun('progress-digest', res.ok, `monthly digests run (HTTP ${res.status})`);
      return res;
    }
    if (period === 'term') {
      const raw = req.nextUrl.searchParams.get('examType');
      const valid: ExamType[] = ['WA1', 'WA2', 'WA3', 'EOY'];
      let examType: ExamType | null = valid.includes(raw as ExamType) ? (raw as ExamType) : null;
      if (raw && !examType) {
        return NextResponse.json({ error: `examType must be one of ${valid.join('/')}` }, { status: 400 });
      }
      if (!examType) examType = resolveActiveExamType(null);
      if (!examType) {
        return NextResponse.json({ error: 'No active exam season — pass ?examType=WA1|WA2|WA3|EOY' }, { status: 400 });
      }
      return await runTerm(examType);
    }
    return NextResponse.json({ error: 'period must be week, month, or term' }, { status: 400 });
  } catch (e: any) {
    console.error('[progress-digest] failed:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

// ── Weekly (Telegram) ──────────────────────────────────────────────────────────

async function runWeekly() {
  // Cover the week that just ended: previous Mon..Sun. Trend window = 28 days
  // back from this Monday so "Slow ×2+" / repeated-HW patterns are visible.
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const thisMonday = addDays(now, -daysSinceMonday);
  const weekEndExclusive = isoDate(thisMonday);
  const weekStart = isoDate(addDays(thisMonday, -7));
  const trendStart = isoDate(addDays(thisMonday, -28));

  const weekEndDate = addDays(thisMonday, -1);
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  const weekLabel = `${fmt(weekStart)} – ${fmt(isoDate(weekEndDate))}`;

  const [students, lessons] = await Promise.all([
    fetchActiveStudents(),
    fetchLessonsInRange(trendStart, weekEndExclusive),
  ]);

  const digest = buildWeeklyDigest({
    weekLabel, weekStart, weekEndExclusive, today: isoDate(now), lessons, students,
  });
  for (const msg of digest.messages) {
    await sendTelegram(msg);
  }
  return NextResponse.json({
    ok: true, period: 'week', weekStart, weekEndExclusive,
    studentsCovered: digest.studentsCovered, flaggedStudents: digest.flaggedStudents,
  });
}

// ── Monthly (drafts) ───────────────────────────────────────────────────────────

async function runMonthly() {
  // Target the month that just ended when run early in a month (≤10th),
  // otherwise the current month-to-date.
  const now = new Date();
  const ref = new Date(now.getFullYear(), now.getMonth() + (now.getDate() <= 10 ? -1 : 0), 1);
  const start = isoDate(ref);
  const endExclusive = isoDate(new Date(ref.getFullYear(), ref.getMonth() + 1, 1));
  const periodLabel = ref.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });

  return generateAndStore({ period: 'month', periodLabel, start, endExclusive });
}

// ── Term (drafts, with exam result) ────────────────────────────────────────────

async function runTerm(examType: ExamType) {
  const year = new Date().getFullYear();
  const w = TERM_LESSON_WINDOWS[examType];
  const start = `${year}-${w.start}`;
  // Exclusive upper bound: day after the window end.
  const endExclusive = isoDate(addDays(new Date(`${year}-${w.end}T00:00:00`), 1));
  const periodLabel = `${examType} ${year}`;
  const exams = await fetchExamsForType(examType, year);

  return generateAndStore({ period: 'term', periodLabel, start, endExclusive, exams });
}

// ── Shared draft pipeline ──────────────────────────────────────────────────────

async function generateAndStore(opts: {
  period: 'month' | 'term';
  periodLabel: string;
  start: string;
  endExclusive: string;
  exams?: Awaited<ReturnType<typeof fetchExamsForType>>;
}) {
  const { period, periodLabel, start, endExclusive, exams } = opts;
  const [students, lessons, papers] = await Promise.all([
    fetchActiveStudents(),
    fetchLessonsInRange(start, endExclusive),
    fetchMarkedPapers(start, endExclusive),
  ]);

  const facts = buildFactsByStudent(lessons, papers, isoDate(new Date()));

  const { drafts, errors } = await generateParentDrafts({ period, periodLabel, lessons, students, exams, facts });

  const supabase = createServiceClient();
  let stored = 0;
  for (const d of drafts) {
    // Regenerate = replace prior DRAFT for this (student, period, label).
    // Rows marked 'sent' are audit history — never deleted or overwritten.
    const { error: delErr } = await supabase
      .from('parent_digests')
      .delete()
      .eq('airtable_student_id', d.studentId)
      .eq('period', period)
      .eq('period_label', periodLabel)
      .eq('status', 'draft');
    if (delErr) console.error('[progress-digest] draft cleanup failed:', delErr.message);

    const { error: insErr } = await supabase.from('parent_digests').insert({
      airtable_student_id: d.studentId,
      student_name: d.studentName,
      period,
      period_label: periodLabel,
      body_md: d.bodyMd,
      exam_json: d.examJson,
      status: 'draft',
    });
    if (insErr) {
      console.error(`[progress-digest] insert failed for ${d.studentName}:`, insErr.message);
      errors.push({ studentName: d.studentName, error: `db: ${insErr.message}` });
    } else {
      stored++;
    }
  }

  // Cron runs are unattended — a silent success is a success nobody acts on.
  // One nudge, only when there is something waiting.
  if (stored > 0) {
    const withPapers = [...facts.values()].filter(f => f.papers.length > 0).length;
    await sendTelegram(
      `\ud83d\udcec <b>${stored} parent draft${stored === 1 ? '' : 's'} ready</b> \u2014 ${periodLabel}\n` +
      `${withPapers} include marked-paper scores.\n` +
      `Review and send: ${SITE_URL}/admin/digests`
    ).catch(e => console.error('[progress-digest] nudge failed:', e?.message || e));
  }

  return NextResponse.json({
    ok: true, period, periodLabel, range: { start, endExclusive },
    drafted: stored,
    skipped: students.size - drafts.length,
    papersFound: papers.length,
    errors,
  });
}

// ── Marked papers → per-student facts ─────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.adrianmathtuition.com';

/**
 * Marked papers in [start, endExclusive), from Supabase `paper_marking_runs`.
 *
 * ⚠ Only runs TAGGED with a student can feed a report — `student_id` is set
 * when Adrian picks the student in the mark-paper send row, and historically
 * most runs were never tagged. An untagged run is simply invisible here; it
 * does not corrupt anyone's report, it just doesn't appear in one. /admin/papers
 * exists to tag the backlog.
 *
 * Failures are non-fatal: a report built from lesson logs alone is still worth
 * sending, so a Supabase outage degrades the report instead of killing the run.
 */
async function fetchMarkedPapers(start: string, endExclusive: string): Promise<(ReportPaper & { studentId: string })[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('paper_marking_runs')
      .select('id, created_at, paper_name, student_id, total_awarded, total_max, result_json')
      .not('student_id', 'is', null)
      .gte('created_at', `${start}T00:00:00Z`)
      .lt('created_at', `${endExclusive}T00:00:00Z`)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[progress-digest] marked-paper fetch failed:', error.message);
      return [];
    }
    return (data ?? []).map(r => ({
      id: r.id,
      studentId: r.student_id as string,
      date: String(r.created_at).slice(0, 10),
      name: r.paper_name || 'Paper',
      totalAwarded: r.total_awarded,
      totalMax: r.total_max,
      resultJson: r.result_json,
    }));
  } catch (e: any) {
    console.error('[progress-digest] marked-paper fetch threw:', e?.message || e);
    return [];
  }
}

/** One ReportFacts per student that has any lesson OR any marked paper. */
function buildFactsByStudent(
  lessons: DigestLesson[],
  papers: (ReportPaper & { studentId: string })[],
  today: string
): Map<string, ReportFacts> {
  const lessonsBy = new Map<string, DigestLesson[]>();
  for (const l of lessons) {
    if (!lessonsBy.has(l.studentId)) lessonsBy.set(l.studentId, []);
    lessonsBy.get(l.studentId)!.push(l);
  }
  const papersBy = new Map<string, ReportPaper[]>();
  for (const p of papers) {
    if (!papersBy.has(p.studentId)) papersBy.set(p.studentId, []);
    papersBy.get(p.studentId)!.push(p);
  }

  const out = new Map<string, ReportFacts>();
  for (const sid of new Set([...lessonsBy.keys(), ...papersBy.keys()])) {
    out.set(sid, buildReportFacts({
      lessons: lessonsBy.get(sid) ?? [],
      papers: papersBy.get(sid) ?? [],
      today,
    }));
  }
  return out;
}
