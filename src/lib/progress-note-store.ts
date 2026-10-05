// The progress note's I/O (5 Oct 2026): load one student's raw data for
// lib/progress-note buildProgressFacts, and find who is due a note. Server-only,
// read-only except the note insert in the route. Every source is fail-soft.
import type { SupabaseClient } from '@supabase/supabase-js';
import { airtableRequestAll } from '@/lib/airtable';
import { addDaysISO, sgtTodayISO } from '@/lib/sgt';
import { shapeUpcomingExams } from '@/lib/portal-exams';
import { examsFor, lessonsBetween, loggedLessons, type StudentRow } from '@/lib/next-lesson-store';
import { studentSubjects } from '@/lib/stuck-store';
import { NOTE_WINDOW_DAYS, noteDue, type NoteAsk, type NoteAttempt, type NoteExam, type NoteLessonNote, type NoteMistake, type NotePaper, type NoteSheet, type NoteTaught } from '@/lib/progress-note';

const DAY = 86_400_000;
const MATH_SUBJECTS = ['A Math', 'E Math', 'H2 Math', 'Math'];

export async function loadNoteInputs(sb: SupabaseClient, student: StudentRow, now = new Date()) {
  const since = new Date(now.getTime() - NOTE_WINDOW_DAYS * DAY).toISOString();
  const sid = student.id;
  const [runs, mistakes, attempts, asks, packs, sheets] = await Promise.all([
    sb.from('paper_marking_runs').select('created_at, released_at, paper_name, paper_subject, total_awarded, total_max, result_json')
      .eq('student_id', sid).not('released_at', 'is', null).is('superseded_by', null).gte('created_at', since).order('created_at').limit(60),
    sb.from('notebook_mistakes').select('subject, topic, error_kind, evidence').eq('airtable_student_id', sid).in('subject', MATH_SUBJECTS).gte('last_seen_at', since).limit(1000),
    sb.from('student_attempts').select('attempted_at, marking_verdict, marking_json').eq('airtable_student_id', sid).gte('attempted_at', since).limit(1000),
    sb.from('ask_skills').select('asked_at, topic, bank').eq('airtable_student_id', sid).gte('asked_at', since).limit(1000),
    sb.from('lesson_packs').select('lesson_date, auto_log, voice_note').eq('airtable_student_id', sid).gte('lesson_date', since.slice(0, 10)).not('auto_log', 'is', null),
    sb.from('sheet_section_outcomes').select('created_at, outcome, section:sheet_sections(title)').eq('student_id', sid).gte('created_at', since).neq('outcome', 'unknown').limit(500),
  ]);
  const papers: NotePaper[] = ((runs.data ?? []) as Record<string, unknown>[]).map((r) => ({
    date: String(r.created_at).slice(0, 10), name: String(r.paper_name ?? 'a paper'), subject: String(r.paper_subject ?? ''),
    awarded: r.total_awarded === null ? null : Number(r.total_awarded), max: r.total_max === null ? null : Number(r.total_max), resultJson: r.result_json,
  }));
  const mist: NoteMistake[] = ((mistakes.data ?? []) as Record<string, unknown>[]).map((m) => ({
    subject: String(m.subject), topic: (m.topic as string) ?? null, errorKind: (m.error_kind as string) ?? null,
    evidence: Array.isArray(m.evidence) ? (m.evidence as NoteMistake['evidence']) : [],
  }));
  const att: NoteAttempt[] = ((attempts.data ?? []) as Record<string, unknown>[])
    .filter((a) => !(a.marking_json as Record<string, unknown> | null)?.science)
    .map((a) => ({ at: String(a.attempted_at), verdict: (a.marking_verdict as string) ?? null, topics: Array.isArray((a.marking_json as Record<string, unknown> | null)?.topics) ? ((a.marking_json as { topics: string[] }).topics) : [] }));
  const ask: NoteAsk[] = ((asks.data ?? []) as Record<string, unknown>[]).filter((a) => !a.bank || a.bank === 'math').filter((a) => a.topic).map((a) => ({ at: String(a.asked_at), topic: String(a.topic) }));
  const taught: NoteTaught[] = [];
  const lessonNotes: NoteLessonNote[] = [];
  for (const p of (packs.data ?? []) as { lesson_date: string; auto_log: { topics?: string[] } | null; voice_note: { topics?: string[]; struggled?: string | null; homework?: string | null; next?: string | null } | null }[]) {
    // his voice note's topics are what was taught; the auto log's otherwise
    if (p.voice_note?.topics?.length) taught.push({ date: p.lesson_date, topics: p.voice_note.topics, how: 'log' });
    else if (p.auto_log?.topics?.length) taught.push({ date: p.lesson_date, topics: p.auto_log.topics, how: 'auto' });
    if (p.voice_note) lessonNotes.push({ date: p.lesson_date, struggled: p.voice_note.struggled ?? null, homework: p.voice_note.homework ?? null, next: p.voice_note.next ?? null });
  }
  try {
    for (const l of await loggedLessons(student)) if (l.topics.length && !taught.some((t) => t.date === l.date)) taught.push({ date: l.date, topics: l.topics, how: 'log' });
  } catch { /* the log is optional */ }
  const sh: NoteSheet[] = ((sheets.data ?? []) as Record<string, unknown>[]).map((s) => ({
    at: String(s.created_at), closed: s.outcome === 'closed' || s.outcome === 'slip', section: String((s.section as { title?: string } | null)?.title ?? ''),
  }));
  let exams: NoteExam[] = [];
  try {
    exams = shapeUpcomingExams(await examsFor(student), sgtTodayISO(now), student.level, { max: 3, horizonDays: 60 })
      .map((e) => ({ date: e.date, label: e.label, subject: e.subject, daysLeft: e.daysLeft }));
  } catch { /* fail-soft */ }
  return { now, papers, mistakes: mist, attempts: att, asks: ask, taught, lessonNotes, sheets: sh, exams };
}

/** Paged read of one timestamp column for everyone since `since` → newest per student. */
async function newestPer(sb: SupabaseClient, table: string, sidCol: string, tsCol: string, since: string, extra?: (q: any) => any): Promise<Map<string, string>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out = new Map<string, string>();
  for (let from = 0; from < 20_000; from += 1000) {
    let q = sb.from(table).select(`${sidCol}, ${tsCol}`).gte(tsCol, since).order(tsCol, { ascending: false }).range(from, from + 999);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error || !data?.length) break;
    for (const r of data as unknown as Record<string, string>[]) {
      const s = r[sidCol], t = r[tsCol];
      if (s && t && (!out.has(s) || t > out.get(s)!)) out.set(s, t);
    }
    if (data.length < 1000) break;
  }
  return out;
}

export interface DueStudent { student: StudentRow; lastNoteAt: string | null; lastDataAt: string | null; lessonSoon: boolean }

/** Active students with new data since their last note (lib/progress-note noteDue). */
export async function dueStudents(sb: SupabaseClient, now = new Date()): Promise<DueStudent[]> {
  const since = new Date(now.getTime() - NOTE_WINDOW_DAYS * DAY).toISOString();
  const { records } = await airtableRequestAll('Students', `?filterByFormula=${encodeURIComponent(`OR({Status}='Active',{Status}='Trial')`)}&fields%5B%5D=Student%20Name&fields%5B%5D=Level&fields%5B%5D=Subjects&fields%5B%5D=Status`);
  const students: StudentRow[] = (records as { id: string; fields: Record<string, unknown> }[]).map((r) => {
    const level = typeof r.fields['Level'] === 'string' ? (r.fields['Level'] as string) : null;
    return { id: r.id, name: String(r.fields['Student Name'] ?? '').trim() || r.id, level, subjects: studentSubjects(r.fields['Subjects'], level), status: String(r.fields['Status'] ?? '') };
  }).filter((s) => !/^adrian\s+fong$/i.test(s.name));
  const [runs, mist, att, asks, logs, notes, soon] = await Promise.all([
    newestPer(sb, 'paper_marking_runs', 'student_id', 'released_at', since),
    newestPer(sb, 'notebook_mistakes', 'airtable_student_id', 'last_seen_at', since, (q) => q.in('subject', MATH_SUBJECTS)),
    newestPer(sb, 'student_attempts', 'airtable_student_id', 'attempted_at', since),
    newestPer(sb, 'ask_skills', 'airtable_student_id', 'asked_at', since),
    newestPer(sb, 'lesson_packs', 'airtable_student_id', 'log_written_at', since),
    newestPer(sb, 'student_progress_notes', 'airtable_student_id', 'written_at', '2000-01-01'),
    lessonsBetween(sgtTodayISO(now), addDaysISO(sgtTodayISO(now), 2)).catch(() => []),
  ]);
  const soonIds = new Set(soon.map((l) => l.studentId));
  const out: DueStudent[] = [];
  for (const s of students) {
    const lastDataAt = [runs, mist, att, asks, logs].map((m) => m.get(s.id)).filter((x): x is string => !!x).sort().at(-1) ?? null;
    const lastNoteAt = notes.get(s.id) ?? null;
    const lessonSoon = soonIds.has(s.id);
    if (noteDue({ lastNoteAt, lastDataAt, lessonSoon, now })) out.push({ student: s, lastNoteAt, lastDataAt, lessonSoon });
  }
  // a lesson soon first, then the longest without a note
  return out.sort((a, b) => Number(b.lessonSoon) - Number(a.lessonSoon) || String(a.lastNoteAt ?? '').localeCompare(String(b.lastNoteAt ?? '')));
}
