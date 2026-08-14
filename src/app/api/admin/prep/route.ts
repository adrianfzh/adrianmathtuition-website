// /api/admin/prep — "what am I walking into" for a lesson, one student at a time.
//
// GET            → { date, students[] }  — who has a lesson TODAY (tap targets)
// GET ?id=recXXX → the prep card:
//   - next lesson (and whether it's today)
//   - last logged lesson: topics, mastery, homework set, the plan written for today
//   - a few earlier logged lessons for the arc
//   - upcoming exams (dates + tested topics)
//   - marked papers + the topics that bled marks (thresholds mirror
//     report-facts/portal-marking so every surface names the same focus list)
//   - 2–3 question-bank suggestions per focus topic, answers included
//
// Owns NO writes. Pure assembly over the same sources the profile page,
// /admin/papers and the portal already read. Admin-facing only (no
// health-check entry needed under the testing policy).
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday, daysAgo } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { recomputeTotals, pendingCount } from '@/lib/mark-triage';
import { aggregateTopicBleed, type ReportPaper } from '@/lib/report-facts';
import {
  deriveBankLevels, matchBankTopic, pickSuggestedQuestions, partsAnswerSummary,
  slotTimeSortKey, parseTopicsCovered, type BankQuestionRow,
} from '@/lib/prep';

export const runtime = 'nodejs';

// Same bar as portal-marking.ts / report-facts consumers: a topic needs 4+
// marks behind it before its percentage means anything, <75% counts as weak,
// and three topics is a lesson plan — eight is a guilt trip.
const MIN_TOPIC_MARKS = 4;
const WEAK_PCT_CEILING = 75;
const MAX_FOCUS = 3;
const SUGGESTIONS_PER_TOPIC = 3;

function slotLabel(f: Record<string, unknown> | null | undefined): string {
  const day = (f?.['Day'] || '').toString().replace(/^\d+\s+/, '').trim();
  return `${day} ${f?.['Time'] || ''}`.trim();
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  const today = localToday();

  const slotsData = await airtableRequestAll('Slots', `?fields[]=Day&fields[]=Time&fields[]=Level`);
  const slotById: Record<string, Record<string, unknown>> =
    Object.fromEntries(slotsData.records.map((r: { id: string; fields: Record<string, unknown> }) => [r.id, r.fields]));

  // ── Today mode: who's coming in ────────────────────────────────────────────
  if (!id) {
    const tomorrow = daysAgo(-1);
    const [lessons, students] = await Promise.all([
      airtableRequestAll('Lessons',
        `?filterByFormula=${encodeURIComponent(`AND({Date}>='${today}',{Date}<'${tomorrow}')`)}` +
        `&fields[]=Student&fields[]=Slot&fields[]=Type&fields[]=Status`),
      airtableRequestAll('Students', `?fields[]=Student Name&fields[]=Level`),
    ]);
    const nameById: Record<string, { name: string; level: string }> = Object.fromEntries(
      students.records.map((r: { id: string; fields: Record<string, unknown> }) =>
        [r.id, { name: (r.fields['Student Name'] || '') as string, level: (r.fields['Level'] || '') as string }]));

    const rows = lessons.records
      .filter((r: { fields: Record<string, any> }) =>
        r.fields['Status'] !== 'Cancelled' && r.fields['Status'] !== 'Rescheduled')
      .map((r: { id: string; fields: Record<string, any> }) => {
        const studentId = r.fields['Student']?.[0] || '';
        const sf = r.fields['Slot']?.[0] ? slotById[r.fields['Slot'][0]] : null;
        return {
          lessonId: r.id,
          studentId,
          name: nameById[studentId]?.name || '(unknown)',
          level: nameById[studentId]?.level || '',
          time: (sf?.['Time'] || '') as string,
          slotLabel: sf ? slotLabel(sf) : (r.fields['Type'] || ''),
          type: r.fields['Type'] || 'Regular',
          status: r.fields['Status'] || 'Scheduled',
        };
      })
      .filter((r: { studentId: string }) => r.studentId)
      .sort((a: { time: string; name: string }, b: { time: string; name: string }) =>
        slotTimeSortKey(a.time) - slotTimeSortKey(b.time) || a.name.localeCompare(b.name));

    return NextResponse.json({ date: today, students: rows });
  }

  // ── Card mode ───────────────────────────────────────────────────────────────
  const stu = await airtableRequest('Students', `/${id}`).catch(() => null);
  if (!stu) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const sf = stu.fields as Record<string, any>;
  const level = (sf['Level'] || '') as string;
  const subjects: string[] = sf['Subjects'] || [];

  // One lessons window feeds next-lesson, last-logged and the recent arc.
  // `Next Lesson Plan` may not exist in Airtable yet (docs/SCHEDULE.md) — an
  // unknown field name 422s a LIST endpoint, so retry without it.
  const windowStart = daysAgo(120);
  const lessonsQuery = (extra: string) => airtableRequestAll('Lessons',
    `?filterByFormula=${encodeURIComponent(`{Date}>='${windowStart}'`)}` +
    `&fields[]=Student&fields[]=Slot&fields[]=Date&fields[]=Type&fields[]=Status&fields[]=Mastery&fields[]=Mood` +
    `&fields[]=Topics Covered&fields[]=Topics Free Text&fields[]=Lesson Notes&fields[]=Homework Assigned` +
    `&fields[]=Homework Returned&fields[]=Progress Logged&sort[0][field]=Date&sort[0][direction]=asc` + extra);

  const [lessonsData, examsData] = await Promise.all([
    lessonsQuery('&fields[]=Next Lesson Plan').catch(err => {
      if (!String((err as Error)?.message ?? '').includes('UNKNOWN_FIELD_NAME')) throw err;
      return lessonsQuery('');
    }),
    airtableRequestAll('Exams', ''),
  ]);
  const mine = lessonsData.records.filter((r: { fields: Record<string, any> }) => r.fields['Student']?.[0] === id);

  const next = mine.find((r: { fields: Record<string, any> }) =>
    (r.fields['Date'] || '') >= today && r.fields['Status'] !== 'Cancelled' && r.fields['Status'] !== 'Rescheduled');
  const nextLesson = next ? {
    date: next.fields['Date'] || '',
    isToday: (next.fields['Date'] || '') === today,
    slotLabel: next.fields['Slot']?.[0] ? slotLabel(slotById[next.fields['Slot'][0]]) : (next.fields['Type'] || ''),
    type: next.fields['Type'] || 'Regular',
  } : null;

  const logged = mine
    .filter((r: { fields: Record<string, any> }) =>
      (r.fields['Date'] || '') <= today &&
      (r.fields['Progress Logged'] === true || r.fields['Mastery'] || r.fields['Topics Covered']))
    .sort((a: { fields: Record<string, any> }, b: { fields: Record<string, any> }) =>
      (b.fields['Date'] || '').localeCompare(a.fields['Date'] || ''));

  const shapeLogged = (r: { id: string; fields: Record<string, any> }) => ({
    id: r.id,
    date: r.fields['Date'] || '',
    topics: parseTopicsCovered(r.fields['Topics Covered'], r.fields['Topics Free Text']),
    mastery: (r.fields['Mastery'] || '') as string,
    mood: (r.fields['Mood'] || '') as string,
    lessonNotes: (r.fields['Lesson Notes'] || '') as string,
    homeworkAssigned: (r.fields['Homework Assigned'] || '') as string,
    homeworkReturned: (r.fields['Homework Returned'] || '') as string,
    nextPlan: (r.fields['Next Lesson Plan'] || '') as string,
  });
  const lastLogged = logged[0] ? shapeLogged(logged[0]) : null;
  const recent = logged.slice(1, 5).map(shapeLogged)
    .map(l => ({ date: l.date, topics: l.topics, mastery: l.mastery }));

  const exams = examsData.records
    .filter((r: { fields: Record<string, any> }) => r.fields['Student']?.[0] === id)
    .filter((r: { fields: Record<string, any> }) => r.fields['No Exam'] !== true && (r.fields['Exam Date'] || '') >= today)
    .map((r: { id: string; fields: Record<string, any> }) => ({
      id: r.id,
      examType: r.fields['Exam Type'] || '',
      customName: r.fields['Custom Name'] || '',
      subject: r.fields['Subject'] || '',
      examDate: r.fields['Exam Date'] || '',
      testedTopics: r.fields['Tested Topics'] || '',
    }))
    .sort((a: { examDate: string }, b: { examDate: string }) => a.examDate.localeCompare(b.examDate));

  // ── Marked papers → focus topics (Supabase) ────────────────────────────────
  const supa = getSupabaseAdmin();
  const { data: runRows, error: runErr } = await supa
    .from('paper_marking_runs')
    .select('id, created_at, paper_name, total_awarded, total_max, released_at, result_json')
    .eq('student_id', id)
    .order('created_at', { ascending: false })
    .limit(8);
  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });

  const scoredRuns = (runRows ?? []).filter(r => Array.isArray((r.result_json as { results?: unknown })?.results));
  const papers = scoredRuns.slice(0, 3).map(r => {
    const totals = r.total_max == null || r.total_awarded == null
      ? recomputeTotals(r.result_json)
      : { awarded: r.total_awarded, max: r.total_max };
    const date = String(r.created_at).slice(0, 10);
    return {
      id: r.id,
      date,
      name: r.paper_name || 'Untitled paper',
      awarded: totals.awarded,
      max: totals.max,
      pct: totals.max > 0 ? Math.round((totals.awarded / totals.max) * 100) : null,
      pending: pendingCount(r.result_json),
      released: !!r.released_at,
      topics: aggregateTopicBleed([
        { id: r.id, date, name: r.paper_name || 'Paper', totalAwarded: totals.awarded, totalMax: totals.max, resultJson: r.result_json },
      ]).slice(0, 4),
    };
  });

  const bleedInput: ReportPaper[] = scoredRuns.map(r => ({
    id: r.id,
    date: String(r.created_at).slice(0, 10),
    name: r.paper_name || 'Paper',
    totalAwarded: r.total_awarded,
    totalMax: r.total_max,
    resultJson: r.result_json,
  }));
  const focus = aggregateTopicBleed(bleedInput)
    .filter(t => t.max >= MIN_TOPIC_MARKS && t.pct < WEAK_PCT_CEILING)
    .slice(0, MAX_FOCUS);

  // ── Bank suggestions per focus topic ───────────────────────────────────────
  const bankLevels = deriveBankLevels(level, subjects);
  const QCOLS = 'id, school, year, paper, question_number, question_text, total_marks, answer, parts, difficulty';
  const fetchByTopic = async (topic: string): Promise<BankQuestionRow[]> => {
    const { data } = await supa
      .from('questions')
      .select(QCOLS)
      .in('level', bankLevels)
      .contains('topics', [topic])
      .is('deleted_at', null)
      .eq('has_image', false)
      .order('year', { ascending: false })
      .limit(40);
    return (data ?? []) as BankQuestionRow[];
  };

  // The bank's topic vocabulary, fetched once and only when an exact-name
  // query came back empty (marker names drift from bank names).
  let bankTopics: string[] | null = null;
  const getBankTopics = async (): Promise<string[]> => {
    if (bankTopics) return bankTopics;
    const { data } = await supa
      .from('questions')
      .select('topics')
      .in('level', bankLevels)
      .is('deleted_at', null)
      .limit(3000);
    bankTopics = [...new Set((data ?? []).flatMap(r => (Array.isArray(r.topics) ? r.topics : [])).map(String))];
    return bankTopics;
  };

  const suggestions: Array<{
    topic: string; bankTopic: string | null;
    questions: Array<{ id: string; school: string; year: string; paper: string; questionNumber: string; marks: number | null; text: string; answer: string }>;
  }> = [];
  if (bankLevels.length) {
    for (const t of focus) {
      let bankTopic: string | null = t.topic;
      let rows = await fetchByTopic(t.topic);
      if (!rows.length) {
        bankTopic = matchBankTopic(t.topic, await getBankTopics());
        rows = bankTopic && bankTopic !== t.topic ? await fetchByTopic(bankTopic) : [];
      }
      const picked = pickSuggestedQuestions(rows, SUGGESTIONS_PER_TOPIC);
      suggestions.push({
        topic: t.topic,
        bankTopic,
        questions: picked.map(r => ({
          id: r.id,
          school: (r.school || '').toString(),
          year: (r.year ?? '').toString(),
          paper: (r.paper || '').toString(),
          questionNumber: (r.question_number ?? '').toString(),
          marks: r.total_marks,
          text: (r.question_text || '').trim(),
          answer: (r.answer || '').trim() || partsAnswerSummary(r.parts),
        })),
      });
    }
  }

  return NextResponse.json({
    student: {
      id,
      name: sf['Student Name'] || '',
      level,
      subjects,
      subjectLevel: sf['Subject Level'] || '',
      status: sf['Status'] || '',
    },
    nextLesson,
    lastLogged,
    recent,
    exams,
    papers,
    focus,
    suggestions,
  });
}
