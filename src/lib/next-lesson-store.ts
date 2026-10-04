// The Next lesson card's I/O (5 Oct 2026, /admin/students/<id>/next).
// Server-only. Reads Airtable (Students, Lessons, Exams, Slots) and Supabase
// (student_materials, lesson_packs, notebook_mistakes, portal_assignments,
// kiosk_prints, paper_marking_runs, the bank's Set rows), writes
// lesson_packs + student_materials, and the Lessons progress fields of the
// auto log. The rules are pure and tested: lib/teaching-order.ts (what's next,
// exam season), lib/lesson-autolog.ts (the auto log). PDFs come from the
// renderers that already exist: the /ws worksheet route (bank questions,
// answers at the back) and lib/render-ref-paper (a Set paper, on demand).
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { airtableRequest, airtableRequestAll, narrowToStudent } from '@/lib/airtable';
import { addDaysISO, sgtDateISO, sgtTodayISO } from '@/lib/sgt';
import { parseTopicsField } from '@/lib/progress-digest';
import { shapeUpcomingExams, splitSubject, parseTestedTopics, type ExamRecordLike } from '@/lib/portal-exams';
import { studentSubjects } from '@/lib/stuck-store';
import { worksheetLevel } from '@/lib/stuck-send';
import { SUBJECT_LABEL, markerTopics } from '@/lib/stuck-topics';
import { SET_EXAM_TYPE_LIKE, SET_QUESTION_COLUMNS, SET_SCHOOL, blueprintTotal, groupSetPapers, setPaperTitle, type SetQuestionRow } from '@/lib/print-sets';
import { blueprintKeyFor, type PrintQuestionRef } from '@/lib/print-paper';
import {
  TEACHING_ORDER, chooseNext, courseFor, examSeason, nextSetPapers, setLevelFor, stepLabel, studentYear, topicsInOrder,
  type CoverageEvent, type Course, type ExamLike, type NextSuggestion, type SetRef, type Subject,
} from '@/lib/teaching-order';
import { HANDIN_DAYS, autoLogFields, composeAutoLog, mayWriteAutoLog, slotEndHHMM, type AutoLog } from '@/lib/lesson-autolog';
import { getMarkingSwitch } from '@/lib/marking-settings';
import fs from 'node:fs';
import path from 'node:path';

const DAY = 86_400_000;
/** Items on the night-before pack. */
export const PRACTICE_COUNT = 8;
export const WARMUP_COUNT = 4;
export const EXAM_SHEET_COUNT = 10;
/** Mistakes this recent feed the warm-up. */
const WARMUP_DAYS = 45;

export interface StudentRow { id: string; name: string; level: string | null; subjects: Subject[]; status: string }

export interface LessonRow { id: string; date: string; time: string | null; end: string | null; status: string; type: string | null }

export interface CourseSuggestion {
  subject: Subject;
  subjectLabel: string;
  course: Course;
  next: NextSuggestion | null;
}

export interface ExamPlan {
  label: string;
  subject: string;
  date: string;
  daysLeft: number;
  papers: string[];
  topics: string[];
  /** the next Set papers not yet given, in print order */
  sets: (SetRef & { level: string; title: string })[];
}

export interface NextLessonPlan {
  builtAt: string;
  lesson: LessonRow | null;
  mode: 'teach' | 'exam';
  courses: CourseSuggestion[];
  exam: ExamPlan | null;
  /** topics with live mistakes, most recent first — the warm-up's topics */
  weak: { topic: string; subject: Subject; count: number }[];
  notes: string[];
}

export interface MaterialRow {
  id: string;
  airtable_student_id: string;
  title: string;
  topic: string | null;
  label: string | null;
  level: string | null;
  kind: string;
  source: string;
  file_url: string | null;
  question_ids: string[];
  meta: Record<string, unknown>;
  status: string;
  request: string | null;
  error: string | null;
  pack_id: string | null;
  made_at: string;
  printed_at: string | null;
  given_at: string | null;
}

export interface PackRow {
  id: string;
  airtable_student_id: string;
  student_name: string | null;
  level: string | null;
  lesson_id: string;
  lesson_date: string;
  lesson_end: string | null;
  mode: string;
  plan: NextLessonPlan;
  built_at: string;
  auto_log: AutoLog | null;
  log_written_at: string | null;
  line_sent_at: string | null;
  line_message_id: number | null;
  confirmed_at: string | null;
  confirm_kind: string | null;
  reply_text: string | null;
}

const qs = (fields: string[]) => fields.map((f) => `fields%5B%5D=${encodeURIComponent(f)}`).join('&');

// ── Airtable reads ─────────────────────────────────────────────────────────

export async function loadStudent(id: string): Promise<StudentRow | null> {
  try {
    const r = await airtableRequest('Students', `/${id}`) as { id: string; fields: Record<string, unknown> };
    const level = typeof r.fields['Level'] === 'string' ? (r.fields['Level'] as string) : null;
    return {
      id: r.id,
      name: String(r.fields['Student Name'] ?? '').trim() || r.id,
      level,
      subjects: studentSubjects(r.fields['Subjects'], level),
      status: String(r.fields['Status'] ?? ''),
    };
  } catch {
    return null;
  }
}

let slotCache: { at: number; byId: Map<string, string> } | null = null;
async function slotTimes(): Promise<Map<string, string>> {
  if (slotCache && Date.now() - slotCache.at < 10 * 60_000) return slotCache.byId;
  const { records } = await airtableRequestAll('Slots', `?${qs(['Time'])}`);
  const byId = new Map<string, string>(records.map((r: { id: string; fields: Record<string, unknown> }) => [r.id, String(r.fields['Time'] ?? '')]));
  slotCache = { at: Date.now(), byId };
  return byId;
}

/** Lessons on [from, to) in the given statuses (default: still to happen), every student. */
export async function lessonsBetween(from: string, to: string, statuses: string[] = ['Scheduled']): Promise<(LessonRow & { studentId: string })[]> {
  const st = statuses.map((x) => `{Status}='${x}'`).join(',');
  const formula = `AND({Date}>='${from}',{Date}<'${to}',OR(${st}))`;
  const [{ records }, slots] = await Promise.all([
    airtableRequestAll('Lessons', `?filterByFormula=${encodeURIComponent(formula)}&${qs(['Student', 'Date', 'Slot', 'Status', 'Type'])}`),
    slotTimes(),
  ]);
  return (records as { id: string; fields: Record<string, unknown> }[]).flatMap((r) => {
    const sid = (r.fields['Student'] as string[] | undefined)?.[0];
    if (!sid) return [];
    const time = slots.get((r.fields['Slot'] as string[] | undefined)?.[0] ?? '') ?? null;
    return [{
      id: r.id, studentId: sid, date: String(r.fields['Date'] ?? ''), time, end: slotEndHHMM(time),
      status: String(r.fields['Status'] ?? ''), type: (r.fields['Type'] as string) ?? null,
    }];
  });
}

/** This student's next Scheduled lesson from today. */
export async function nextLessonFor(student: StudentRow, today = sgtTodayISO()): Promise<LessonRow | null> {
  const formula = narrowToStudent(`AND({Date}>='${today}',{Date}<'${addDaysISO(today, 45)}',{Status}='Scheduled')`, student.name);
  const [{ records }, slots] = await Promise.all([
    airtableRequestAll('Lessons', `?filterByFormula=${encodeURIComponent(formula)}&${qs(['Student', 'Date', 'Slot', 'Status', 'Type'])}&sort%5B0%5D%5Bfield%5D=Date`),
    slotTimes(),
  ]);
  const mine = (records as { id: string; fields: Record<string, unknown> }[])
    .filter((r) => (r.fields['Student'] as string[] | undefined)?.[0] === student.id)
    .sort((a, b) => String(a.fields['Date']).localeCompare(String(b.fields['Date'])));
  const r = mine[0];
  if (!r) return null;
  const time = slots.get((r.fields['Slot'] as string[] | undefined)?.[0] ?? '') ?? null;
  return { id: r.id, date: String(r.fields['Date']), time, end: slotEndHHMM(time), status: String(r.fields['Status']), type: (r.fields['Type'] as string) ?? null };
}

export async function examsFor(student: StudentRow): Promise<ExamRecordLike[]> {
  const since = addDaysISO(sgtTodayISO(), -320);
  const formula = narrowToStudent(`IS_AFTER({Exam Date}, '${since}')`, student.name);
  const { records } = await airtableRequestAll('Exams', `?filterByFormula=${encodeURIComponent(formula)}&${qs(['Student', 'Exam Type', 'Custom Name', 'Subject', 'Exam Date', 'Tested Topics', 'Exam Notes', 'No Exam'])}`);
  return (records as { id: string; fields: Record<string, unknown> }[])
    .filter((r) => (r.fields['Student'] as string[] | undefined)?.[0] === student.id)
    .map((r) => ({
      id: r.id,
      examType: String(r.fields['Exam Type'] ?? ''),
      customName: String(r.fields['Custom Name'] ?? ''),
      subject: String(r.fields['Subject'] ?? ''),
      examDate: (r.fields['Exam Date'] as string) ?? null,
      testedTopics: String(r.fields['Tested Topics'] ?? ''),
      examNotes: String(r.fields['Exam Notes'] ?? ''),
      noExam: !!r.fields['No Exam'],
    }));
}

export async function loggedLessons(student: StudentRow): Promise<{ date: string; topics: string[]; mastery: string | null }[]> {
  const since = addDaysISO(sgtTodayISO(), -300);
  const formula = narrowToStudent(`AND({Date}>='${since}',{Progress Logged})`, student.name);
  const { records } = await airtableRequestAll('Lessons', `?filterByFormula=${encodeURIComponent(formula)}&${qs(['Student', 'Date', 'Topics Covered', 'Topics Free Text', 'Mastery'])}`);
  return (records as { id: string; fields: Record<string, unknown> }[])
    .filter((r) => (r.fields['Student'] as string[] | undefined)?.[0] === student.id)
    .map((r) => ({ date: String(r.fields['Date'] ?? ''), topics: parseTopicsField(r.fields), mastery: (r.fields['Mastery'] as string) ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── what's next ────────────────────────────────────────────────────────────

const subjectOfExam = (raw: string): Subject | null => {
  const s = splitSubject(raw).subject.toLowerCase();
  if (s.startsWith('a math')) return 'AM';
  if (s.startsWith('e math') || s === 'math') return 'EM';
  if (s.startsWith('h2') || s.startsWith('h1')) return 'H2';
  return null;
};

/** Everything that says what this student has met, for chooseNext. */
async function coverage(sb: SupabaseClient, student: StudentRow, exams: ExamRecordLike[], today: string) {
  const events: (CoverageEvent & { subject: Subject | null })[] = [];
  const notes: string[] = [];
  let lastMastery: string | null = null;
  try {
    const logs = await loggedLessons(student);
    for (const l of logs) for (const t of l.topics) events.push({ topic: t, at: l.date, source: 'lesson', subject: null });
    lastMastery = logs.at(-1)?.mastery ?? null;
  } catch (e) { notes.push(`lesson log: ${(e as Error).message.slice(0, 80)}`); }
  for (const e of exams) {
    const d = (e.examDate || '').slice(0, 10);
    if (!d || d >= today || e.noExam) continue;
    for (const t of parseTestedTopics(e.testedTopics)) events.push({ topic: t, at: d, source: 'exam', subject: subjectOfExam(e.subject) });
  }
  const { data: mats } = await sb.from('student_materials')
    .select('topic, kind, source, meta, printed_at, given_at, made_at')
    .eq('airtable_student_id', student.id).is('removed_at', null)
    .or('printed_at.not.is.null,given_at.not.is.null');
  for (const m of (mats ?? []) as { topic: string | null; kind: string; source: string; meta: Record<string, unknown>; printed_at: string | null; given_at: string | null }[]) {
    // a warm-up, a Set paper and an exam revision sheet are revision, not the next step taught
    if (m.kind === 'warmup' || m.kind === 'set' || m.kind === 'practice-again' || m.source === 'exam' || m.source === 'stuck') continue;
    const topics = Array.isArray(m.meta?.topics) && (m.meta.topics as string[]).length ? (m.meta.topics as string[]) : m.topic ? [m.topic] : [];
    const skills = topics.length === 1 && Array.isArray(m.meta?.skills) ? (m.meta.skills as string[]) : [];
    const at = m.given_at || m.printed_at!;
    const subj = (m.meta?.subject as Subject | undefined) ?? null;
    for (const t of topics) {
      if (skills.length) for (const s of skills) events.push({ topic: t, skill: s, at, source: 'material', subject: subj });
      else events.push({ topic: t, at, source: 'material', subject: subj });
    }
  }
  const { data: asg } = await sb.from('portal_assignments')
    .select('topic, skill_title, created_at, source, revoked_at')
    .eq('airtable_student_id', student.id).is('revoked_at', null).not('topic', 'is', null);
  for (const a of (asg ?? []) as { topic: string; skill_title: string | null; created_at: string; source: string | null }[]) {
    if (a.source === 'practice-again' || a.source === 'find' || a.source === 'practice-photo') continue; // these follow mistakes or the student's own asks, not teaching
    events.push({ topic: a.topic, skill: a.skill_title, at: a.created_at, source: 'assignment', subject: null });
  }
  return { events, lastMastery, notes };
}

async function liveMistakes(sb: SupabaseClient, sid: string, now: Date) {
  const since = new Date(now.getTime() - WARMUP_DAYS * DAY).toISOString();
  const { data } = await sb.from('notebook_mistakes')
    .select('subject, topic, seen_count, last_seen_at')
    .eq('airtable_student_id', sid).eq('state', 'dark').is('removed_at', null)
    .in('subject', ['A Math', 'E Math', 'H2 Math', 'Math'])
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false }).limit(60);
  const by = new Map<string, { topic: string; subject: Subject; count: number }>();
  for (const r of (data ?? []) as { subject: string; topic: string | null; seen_count: number }[]) {
    const subject = subjectOfExam(r.subject);
    if (!r.topic || !subject) continue;
    // the marker's free words ("Surds and trigonometric ratios") → canonical topics, the stuck report's rule
    for (const topic of markerTopics(subject, r.topic)) {
      const k = `${subject}|${topic}`;
      const cur = by.get(k) ?? { topic, subject, count: 0 };
      cur.count += Math.max(1, r.seen_count || 1);
      by.set(k, cur);
    }
  }
  return [...by.values()];
}

function loadBlueprintTotals(): (level: string, paper: 'P1' | 'P2') => number | null {
  try {
    const bp = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'paper-blueprints.json'), 'utf8')) as { papers: Record<string, { slots?: { typ?: number }[] }> };
    return (level, paper) => blueprintTotal(bp.papers[blueprintKeyFor(level, paper, 'gce')]);
  } catch {
    return () => null;
  }
}

/** Complete Set papers in the bank for one Set level (AM/EM/JC), with their question refs. */
export async function setPapersFor(sb: SupabaseClient, setLevel: string) {
  const { data, error } = await sb.from('questions').select(SET_QUESTION_COLUMNS)
    .eq('school', SET_SCHOOL).like('exam_type', SET_EXAM_TYPE_LIKE).is('deleted_at', null)
    .eq('level', setLevel);
  if (error) throw new Error(error.message);
  return groupSetPapers((data ?? []) as SetQuestionRow[], loadBlueprintTotals()).filter((p) => p.complete);
}

/** The plan for a student's next lesson: what to teach (or the exam to prepare), and why. */
export async function buildPlan(sb: SupabaseClient, student: StudentRow, lesson: LessonRow | null, now = new Date()): Promise<NextLessonPlan> {
  const today = sgtDateISO(now);
  const notes: string[] = [];
  let exams: ExamRecordLike[] = [];
  try { exams = await examsFor(student); } catch (e) { notes.push(`exams: ${(e as Error).message.slice(0, 80)}`); }
  const cov = await coverage(sb, student, exams, today);
  notes.push(...cov.notes);
  const weak = await liveMistakes(sb, student.id, now).catch(() => []);
  const year = studentYear(student.level);
  const subjects: Subject[] = student.subjects.length ? student.subjects : ['EM'];
  // A Math first for a student taking both: it is the subject a lesson usually runs on
  const ordered = [...subjects].sort((a, b) => ['AM', 'H2', 'EM'].indexOf(a) - ['AM', 'H2', 'EM'].indexOf(b));
  const courses: CourseSuggestion[] = ordered.map((subject) => {
    const course = courseFor(subject, student.level);
    const events = cov.events.filter((e) => e.subject === null || e.subject === subject);
    return {
      subject, subjectLabel: SUBJECT_LABEL[subject], course,
      next: chooseNext({
        order: TEACHING_ORDER[course], year, events, now, lastMastery: cov.lastMastery,
        weak: weak.filter((w) => w.subject === subject).sort((a, b) => b.count - a.count).map((w) => w.topic),
      }),
    };
  });

  // exam season: an exam in the next three weeks (counted from the lesson's own date)
  const from = lesson?.date && lesson.date > today ? lesson.date : today;
  const upcoming: ExamLike[] = shapeUpcomingExams(exams, from, student.level, { max: 10, horizonDays: 30 })
    .map((e) => ({ id: e.id, label: e.label, subject: e.subject, paper: e.paper, date: e.date, daysLeft: e.daysLeft, testedTopics: e.testedTopics }));
  const season = examSeason(upcoming);
  let exam: ExamPlan | null = null;
  if (season) {
    const subj = subjectOfExam(season.subject);
    const course = subj ? courseFor(subj, student.level) : null;
    const topics = course ? topicsInOrder(TEACHING_ORDER[course], season.testedTopics) : season.testedTopics;
    const sets: ExamPlan['sets'] = [];
    const setLevel = setLevelFor(season.subject, student.level);
    if (setLevel) {
      try {
        const avail = await setPapersFor(sb, setLevel);
        const { data: given } = await sb.from('student_materials').select('meta')
          .eq('airtable_student_id', student.id).eq('kind', 'set').is('removed_at', null)
          .or('printed_at.not.is.null,given_at.not.is.null');
        const givenRefs = ((given ?? []) as { meta: Record<string, unknown> }[])
          .filter((g) => g.meta?.setLevel === setLevel)
          .map((g) => ({ set: Number(g.meta.set), paper: g.meta.paper as 'P1' | 'P2' }));
        const wanted = season.papers.length ? season.papers : ['P1', 'P2'];
        for (const r of nextSetPapers(avail.map((a) => ({ set: a.set, paper: a.paper })), givenRefs)) {
          if (!wanted.includes(r.paper)) continue;
          sets.push({ ...r, level: setLevel, title: setPaperTitle(setLevel, r.set, r.paper) });
        }
      } catch (e) { notes.push(`set papers: ${(e as Error).message.slice(0, 80)}`); }
    }
    exam = { label: season.label, subject: season.subject, date: season.date, daysLeft: season.daysLeft, papers: season.papers, topics, sets };
  }

  return {
    builtAt: now.toISOString(),
    lesson,
    mode: exam ? 'exam' : 'teach',
    courses,
    exam,
    weak: weak.sort((a, b) => b.count - a.count).slice(0, 5),
    notes,
  };
}

// ── making the PDFs (the /ws worksheet route, in-process) ──────────────────

export interface SheetAsk {
  level: string;            // worksheet level key: AM / EM / JC2 / S1 / S2
  topics: string[];
  skills?: string[];        // narrow one topic to these sub-skills
  count: number;
  title?: string;
  band?: 'standard' | 'advanced' | null;
  studentId?: string;
}
export type SheetResult = { ok: true; url: string; questionIds: string[]; count: number; topics: string[] } | { ok: false; error: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const SKILL_LEVEL: Record<string, string> = { AM: 'AM', EM: 'EM', JC2: 'JC', S1: 'S1', S2: 'S2' };

/** One bank worksheet, answers at the back, through the route the /ws menu and the stuck sheets use. */
export async function makeSheet(sb: SupabaseClient, ask: SheetAsk): Promise<SheetResult> {
  const secret = process.env.RENDER_MARKING_SECRET;
  if (!secret) return { ok: false, error: 'RENDER_MARKING_SECRET not set' };
  let skipSkills: string[] | undefined;
  if (ask.skills?.length && ask.topics.length === 1) {
    const { data } = await sb.from('subgroups').select('name').eq('level', SKILL_LEVEL[ask.level] ?? ask.level).eq('topic', ask.topics[0]);
    const want = new Set(ask.skills.map(norm));
    skipSkills = ((data ?? []) as { name: string }[]).map((r) => r.name).filter((n) => !want.has(norm(n)));
  }
  const { POST } = await import('@/app/api/bot/worksheet/route');
  const call = async (topics: string[]) => {
    const body = {
      level: ask.level, topics, count: ask.count, answers: true,
      title: ask.title, skipSkills, studentId: ask.studentId, ...(ask.band ? { band: ask.band } : {}),
    };
    const res = await POST(new NextRequest('http://internal/api/bot/worksheet', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-render-secret': secret }, body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown> };
  };
  try {
    let r = await call(ask.topics);
    // an unknown topic → keep only the ones the level has, once
    if (r.status === 400 && Array.isArray(r.body.validTopics)) {
      const valid = new Map((r.body.validTopics as string[]).map((t) => [norm(t), t]));
      const keep = ask.topics.map((t) => valid.get(norm(t))).filter((t): t is string => !!t);
      if (!keep.length) return { ok: false, error: `no bank topic for ${ask.topics.join(', ')}` };
      r = await call(keep);
    }
    if (r.status !== 200 || typeof r.body.url !== 'string') return { ok: false, error: String(r.body.error ?? `HTTP ${r.status}`).slice(0, 200) };
    return { ok: true, url: r.body.url, questionIds: (r.body.questionIds as string[]) ?? [], count: Number(r.body.count) || 0, topics: ask.topics };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}

// ── the pack ───────────────────────────────────────────────────────────────

export async function upsertPack(sb: SupabaseClient, student: StudentRow, lesson: LessonRow, plan: NextLessonPlan): Promise<PackRow> {
  const { data, error } = await sb.from('lesson_packs').upsert({
    airtable_student_id: student.id, student_name: student.name, level: student.level,
    lesson_id: lesson.id, lesson_date: lesson.date, lesson_end: lesson.end,
    mode: plan.mode, plan, built_at: new Date().toISOString(),
  }, { onConflict: 'lesson_id' }).select('*').single();
  if (error) throw new Error(`lesson_packs: ${error.message}`);
  return data as PackRow;
}

async function insertMaterial(sb: SupabaseClient, row: Partial<MaterialRow> & { airtable_student_id: string; title: string; kind: string; source: string }) {
  const { data, error } = await sb.from('student_materials').insert(row).select('*').single();
  if (error) throw new Error(`student_materials: ${error.message}`);
  return data as MaterialRow;
}

/**
 * The night-before items for a pack (each a PDF Adrian prints):
 *   - teach: the suggested step for the first subject (practice), a warm-up on recent mistakes
 *   - exam:  a revision sheet on the tested topics, the next Set papers, a warm-up
 *   - either: an unfinished Practice Again sheet already sent (linked, not re-made)
 * Items already on the pack are left alone; a failed one is recorded with its error.
 */
export async function prepareItems(sb: SupabaseClient, student: StudentRow, pack: PackRow): Promise<MaterialRow[]> {
  const plan = pack.plan;
  const { data: existing } = await sb.from('student_materials').select('*').eq('pack_id', pack.id).is('removed_at', null);
  const have = new Set(((existing ?? []) as MaterialRow[]).filter((m) => m.status === 'ready').map((m) => `${m.kind}|${m.topic ?? ''}|${(m.meta?.set as number) ?? ''}|${(m.meta?.paper as string) ?? ''}`));
  const out: MaterialRow[] = [];
  const base = { airtable_student_id: student.id, pack_id: pack.id };

  const sheet = async (kind: string, source: string, title: string, topic: string | null, label: string | null, subject: Subject, ask: Omit<SheetAsk, 'level'>) => {
    if (have.has(`${kind}|${topic ?? ''}||`)) return;
    const level = worksheetLevel(subject, student.level);
    const r = await makeSheet(sb, { ...ask, level, studentId: student.id });
    out.push(await insertMaterial(sb, {
      ...base, title, topic, label, level, kind, source,
      file_url: r.ok ? r.url : null, question_ids: r.ok ? r.questionIds : [], status: r.ok ? 'ready' : 'failed', error: r.ok ? null : r.error,
      meta: { subject, skills: ask.skills ?? [], topics: ask.topics, count: r.ok ? r.count : 0 },
    }));
  };

  if (plan.mode === 'exam' && plan.exam) {
    const ex = plan.exam;
    const subj = subjectOfExam(ex.subject) ?? plan.courses[0]?.subject ?? 'EM';
    if (ex.topics.length) {
      await sheet('practice', 'exam', `${ex.label} revision — ${ex.subject}`, ex.topics.slice(0, 6).join(', '), `${ex.label} topics`, subj,
        { topics: ex.topics.slice(0, 6), count: EXAM_SHEET_COUNT, title: `${ex.label} revision` });
    }
    for (const s of ex.sets) {
      if (have.has(`set||${s.set}|${s.paper}`)) continue;
      const papers = await setPapersFor(sb, s.level).catch(() => []);
      const sp = papers.find((p) => p.set === s.set && p.paper === s.paper);
      if (!sp) continue;
      out.push(await insertMaterial(sb, {
        ...base, title: s.title, topic: null, label: `Set ${s.set} · ${s.paper === 'P1' ? 'Paper 1' : 'Paper 2'}`, level: s.level, kind: 'set', source: 'exam',
        file_url: null, question_ids: sp.refs.map((r) => r.id), status: 'ready',
        meta: { set: s.set, paper: s.paper, setLevel: s.level, refs: sp.refs as PrintQuestionRef[], totalMarks: sp.totalMarks },
      }));
    }
  } else {
    const first = plan.courses.find((c) => c.next);
    if (first?.next) {
      const st = first.next.step;
      await sheet('practice', 'auto', `${first.subjectLabel}: ${stepLabel(st)}`, st.t, stepLabel(st), first.subject,
        { topics: [st.t], skills: st.s, count: PRACTICE_COUNT, title: st.s?.length ? stepLabel(st) : undefined });
    }
  }

  // warm-up: the two topics with the most recent live mistakes, in one subject — never the
  // topic the practice sheet is already on
  const taughtTopic = plan.mode === 'teach' ? plan.courses.find((c) => c.next)?.next?.step.t ?? null : null;
  const weak = plan.weak.filter((x) => x.topic !== taughtTopic);
  const w = weak.filter((x) => x.subject === (plan.courses[0]?.subject ?? x.subject)).slice(0, 2);
  const warm = w.length ? w : weak.slice(0, 1);
  if (warm.length) {
    await sheet('warmup', 'auto', 'Warm-up — recent mistakes', warm.map((x) => x.topic).join(', '), warm.map((x) => x.topic).join(' and '), warm[0].subject,
      { topics: warm.map((x) => x.topic), count: WARMUP_COUNT, title: 'Warm-up' });
  }

  // an unfinished Practice Again sheet already in the app
  const { data: pa } = await sb.from('portal_assignments')
    .select('id, title, pdf_url, status, created_at')
    .eq('airtable_student_id', student.id).eq('source', 'practice-again').is('revoked_at', null)
    .eq('status', 'assigned').not('pdf_url', 'is', null)
    .order('created_at', { ascending: false }).limit(1);
  const sheetRow = (pa ?? [])[0] as { id: string; title: string; pdf_url: string } | undefined;
  if (sheetRow) {
    const { data: dup } = await sb.from('student_materials').select('id').eq('airtable_student_id', student.id)
      .eq('kind', 'practice-again').contains('meta', { assignmentId: sheetRow.id }).is('printed_at', null).limit(1);
    if (!dup?.length) {
      out.push(await insertMaterial(sb, {
        ...base, title: sheetRow.title, topic: null, label: 'Practice Again (not handed in yet)', level: null, kind: 'practice-again', source: 'auto',
        file_url: sheetRow.pdf_url, status: 'ready', meta: { assignmentId: sheetRow.id },
      }));
    }
  }
  return out;
}

/** Build (or rebuild) one student's pack for one lesson: the plan, then the items. */
export async function buildPackFor(sb: SupabaseClient, student: StudentRow, lesson: LessonRow, opts: { items?: boolean; now?: Date } = {}) {
  const plan = await buildPlan(sb, student, lesson, opts.now);
  const pack = await upsertPack(sb, student, lesson, plan);
  const items = opts.items === false ? [] : await prepareItems(sb, student, pack);
  return { pack, items };
}

export async function materialsFor(sb: SupabaseClient, sid: string, limit = 40): Promise<MaterialRow[]> {
  const { data } = await sb.from('student_materials').select('*').eq('airtable_student_id', sid).is('removed_at', null)
    .order('made_at', { ascending: false }).limit(limit);
  return (data ?? []) as MaterialRow[];
}

// ── the auto log ───────────────────────────────────────────────────────────

/** What happened in a lesson: items printed/given that day, kiosk sheets, work handed in the next two days. */
export async function composeForPack(sb: SupabaseClient, pack: PackRow): Promise<AutoLog> {
  const day0 = `${pack.lesson_date}T00:00:00+08:00`;
  const day1 = `${addDaysISO(pack.lesson_date, 1)}T00:00:00+08:00`;
  const dayN = `${addDaysISO(pack.lesson_date, HANDIN_DAYS + 1)}T00:00:00+08:00`;
  const sid = pack.airtable_student_id;
  const [printedR, givenR, kioskR, runsR] = await Promise.all([
    sb.from('student_materials').select('title, topic, label, kind').eq('airtable_student_id', sid).is('removed_at', null).gte('printed_at', day0).lt('printed_at', day1),
    sb.from('student_materials').select('title, topic, label, kind').eq('airtable_student_id', sid).is('removed_at', null).gte('given_at', day0).lt('given_at', day1).is('printed_at', null),
    sb.from('kiosk_prints').select('topic').eq('student_id', sid).gte('printed_at', day0).lt('printed_at', day1),
    sb.from('paper_marking_runs').select('paper_name, student_label').eq('student_id', sid).is('superseded_by', null).gte('created_at', day0).lt('created_at', dayN),
  ]);
  const printed = [...(printedR.data ?? []), ...(givenR.data ?? [])] as { title: string; topic: string | null; label: string | null; kind: string }[];
  return composeAutoLog({
    printed,
    kiosk: ((kioskR.data ?? []) as { topic: string }[]).filter((k) => k.topic),
    handins: ((runsR.data ?? []) as { paper_name: string | null; student_label: string | null }[]).map((r) => ({ name: r.student_label || r.paper_name || 'a paper' })),
  });
}

/** The Lessons fields an auto log may touch, read fresh (a hand-written log is never overwritten). */
export async function lessonLogFields(lessonId: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await airtableRequest('Lessons', `/${lessonId}`) as { fields: Record<string, unknown> };
    return r.fields;
  } catch {
    return null;
  }
}

export async function patchLesson(lessonId: string, fields: Record<string, unknown>) {
  await airtableRequest('Lessons', `/${lessonId}`, { method: 'PATCH', body: JSON.stringify({ fields, typecast: true }) });
}

/**
 * Write a lesson's auto log to its Airtable Lessons row (Topics Covered, Lesson
 * Notes "Auto log: … — auto (not confirmed)", Progress Logged) and to the pack.
 * Never over a log Adrian wrote by hand (mayWriteAutoLog). An empty log is kept
 * on the pack only. Attendance is never touched.
 */
export async function writeAutoLog(
  sb: SupabaseClient, pack: PackRow, log: AutoLog, state: 'unconfirmed' | 'confirmed', extra?: string | null,
): Promise<{ written: boolean; reason?: string }> {
  const now = new Date().toISOString();
  await sb.from('lesson_packs').update({ auto_log: log, log_written_at: now }).eq('id', pack.id);
  if (log.empty && !extra) return { written: false, reason: 'nothing recorded' };
  const fields = await lessonLogFields(pack.lesson_id);
  if (!fields) return { written: false, reason: 'lesson not found' };
  if (!mayWriteAutoLog(fields)) return { written: false, reason: 'logged by hand' };
  await patchLesson(pack.lesson_id, autoLogFields(log, state, extra));
  return { written: true };
}

/** 📒 The end-of-lesson line's switch (/admin/switches). No row yet = ON (Adrian asked for the line). */
export const LESSON_LINE_SETTING = 'lesson_end_line';
export async function lessonLineOn(fresh = false): Promise<boolean> {
  try {
    const s = await getMarkingSwitch(LESSON_LINE_SETTING, fresh);
    return s.at === null && s.by === null ? true : s.on;
  } catch {
    return false;
  }
}
