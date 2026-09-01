// Upcoming exams for the student portal — the Home "Next exam" countdown
// (2026-09-02). Pure shaping lives here (unit-tested); the Airtable read sits
// in lib/portal-dashboard.ts beside the lessons fetch so both ride the same
// cached round trip.
//
// Privacy: only what a student may see leaves this module — exam type,
// subject / paper, date, whether the date is approximate, and the tested-
// topics list. Adrian's Exam Notes text and the Result fields never surface.
//
// Airtable shape reminder (docs/SCHEDULE.md): Exams are keyed per
// (student × Exam Type); `Subject` encodes the paper ("A Math (P1)"); the
// `~|` prefix in Exam Notes means "date approximate" (lib/exam-notes-markers).
import { decodeExamNotes } from './exam-notes-markers';
import { examTypeLabel } from './exam-grade';

export interface ExamRecordLike {
  id: string;
  examType: string;
  customName: string;
  subject: string;
  examDate: string | null;
  testedTopics: string;
  examNotes: string;
  noExam: boolean;
}

export interface UpcomingExam {
  id: string;
  examType: string;
  /** Student-facing name: "Prelims", "WA3", "Promo", or the custom name. */
  label: string;
  /** "A Math" / "E Math" / "H2 Math" / "Math" / "" (not recorded). */
  subject: string;
  /** "P1" / "P2" when the Airtable Subject encodes the paper. */
  paper: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** Whole days from today (SGT); 0 = today. */
  daysLeft: number;
  approx: boolean;
  testedTopics: string[];
  /** Portal practice level key ('AM', 'EM', 'JC2', …) for deep links; null when unmappable. */
  practiceLevel: string | null;
}

/** Exams further out than this don't count down yet — a WA four months away is noise on Home. */
export const EXAM_HORIZON_DAYS = 120;
/** Rows on the Home card: the next exam plus up to two more (P2, the other subject). */
export const EXAM_CARD_MAX = 3;
/** Tested-topic chips shown before "+n more". */
export const EXAM_TOPIC_CHIPS = 8;

const DAY_MS = 86_400_000;

export function splitSubject(raw: string): { subject: string; paper: string | null } {
  const m = (raw || '').trim().match(/^(.*?)\s*\((P[12])\)$/i);
  if (m) return { subject: m[1].trim(), paper: m[2].toUpperCase() };
  return { subject: (raw || '').trim(), paper: null };
}

/**
 * Which portal practice level a subject maps to for this student — the key
 * lib/qb-levels hands the picker (Sec 3s narrow to the S3_* banks, JC1 to its
 * own key). Null when the subject can't be practised as one level ("Math" at
 * Sec 4 is ambiguous; an unknown subject string).
 */
export function practiceLevelForSubject(subject: string, studentLevel: string | null): string | null {
  const lv = (studentLevel || '').toLowerCase();
  const sec = lv.startsWith('sec') ? parseInt(lv.replace(/[^0-9]/g, ''), 10) || 0 : 0;
  const s = (subject || '').trim().toLowerCase();
  if (s === 'a math') return sec === 3 ? 'S3_AM' : 'AM';
  if (s === 'e math') return sec === 3 ? 'S3_EM' : 'EM';
  if (s === 'h2 math' || s === 'h1 math') return lv === 'jc1' ? 'JC1' : 'JC2';
  if (s === 'math') {
    if (sec === 1) return 'S1';
    if (sec === 2) return 'S2';
    return null;
  }
  if (!s) {
    if (lv === 'jc1') return 'JC1';
    if (lv.startsWith('jc')) return 'JC2';
    if (sec === 1) return 'S1';
    if (sec === 2) return 'S2';
  }
  return null;
}

export function examLabel(rec: Pick<ExamRecordLike, 'examType' | 'customName'>, studentLevel: string | null): string {
  if (rec.examType === 'Custom') return (rec.customName || '').trim() || 'Test';
  if (rec.examType === 'Prelim') return 'Prelims';
  return examTypeLabel(rec.examType || '', studentLevel || '') || 'Exam';
}

/** "Surds, Indices\nLogarithms" → unique trimmed names (the dialog stores a comma list). */
export function parseTestedTopics(raw: string): string[] {
  const out: string[] = [];
  for (const t of (raw || '').split(/[,\n]/)) {
    const s = t.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Whole days from `fromIso` to `toIso` (both YYYY-MM-DD); negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

export function shapeUpcomingExams(
  records: ExamRecordLike[],
  today: string,
  studentLevel: string | null,
  opts: { max?: number; horizonDays?: number } = {},
): UpcomingExam[] {
  const max = opts.max ?? EXAM_CARD_MAX;
  const horizon = opts.horizonDays ?? EXAM_HORIZON_DAYS;
  const rows: UpcomingExam[] = [];
  for (const r of records) {
    if (r.noExam) continue;
    const date = (r.examDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const daysLeft = daysBetween(today, date);
    if (daysLeft < 0 || daysLeft > horizon) continue;
    const { subject, paper } = splitSubject(r.subject);
    rows.push({
      id: r.id,
      examType: r.examType || '',
      label: examLabel(r, studentLevel),
      subject,
      paper,
      date,
      daysLeft,
      approx: decodeExamNotes(r.examNotes || '').approx,
      testedTopics: parseTestedTopics(r.testedTopics),
      practiceLevel: practiceLevelForSubject(subject, studentLevel),
    });
  }
  rows.sort((a, b) =>
    a.date.localeCompare(b.date)
    || (a.paper || '').localeCompare(b.paper || '')
    || a.subject.localeCompare(b.subject));
  return rows.slice(0, max);
}

export function countdownWords(daysLeft: number): string {
  if (daysLeft <= 0) return 'Today';
  if (daysLeft === 1) return 'Tomorrow';
  return `in ${daysLeft} days`;
}

/** "Tue 15 Sep" — same en-SG rendering Home uses for lesson dates. */
export function examDateWords(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/** "Prelims · A Math P1" */
export function examTitle(e: Pick<UpcomingExam, 'label' | 'subject' | 'paper'>): string {
  return `${e.label}${e.subject ? ` · ${e.subject}` : ''}${e.paper ? ` ${e.paper}` : ''}`;
}

/** /app/practice/timed prefilled with the exam's level + tested topics (mixed set when none recorded). */
export function timedSetHref(e: Pick<UpcomingExam, 'practiceLevel' | 'testedTopics'>): string {
  const p = new URLSearchParams();
  if (e.practiceLevel) p.set('level', e.practiceLevel);
  if (e.testedTopics.length) p.set('topics', e.testedTopics.join(','));
  const qs = p.toString();
  return `/app/practice/timed${qs ? `?${qs}` : ''}`;
}

/** The practice picker's "Practise this topic" deep link (opens the topic sheet). */
export function topicPracticeHref(e: Pick<UpcomingExam, 'practiceLevel'>, topic: string): string {
  const p = new URLSearchParams();
  if (e.practiceLevel) p.set('level', e.practiceLevel);
  p.set('topic', topic);
  return `/app/practice?${p.toString()}`;
}
