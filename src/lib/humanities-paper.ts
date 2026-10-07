// The timed paper (SPEC-HUMANITIES.md §A4, 7 Oct 2026): the exam's shape — one
// case study (35 marks) and one structured-response set (15) in 1 h 45 min.
// Each answer still gets a level, never a mark out of 50. Pure.
import { caseStudies, setsFor, type HumanitiesSet, type HumanitiesQuestion } from './humanities-questions';

export const PAPER_MINUTES = 105;
/** The exam's marks for the two structured-response parts. */
const STRUCTURED_MARKS: Record<string, number> = { sr_explain: 7, sr_weigh: 8 };

export interface PaperPart {
  /** "1" … "5" in Section A; "6(a)", "6(b)" in Section B. */
  label: string;
  section: 'A' | 'B';
  question: HumanitiesQuestion;
  marks: number;
}
export interface Paper {
  caseStudy: HumanitiesSet;
  structured: HumanitiesSet;
  parts: PaperPart[];
  total: number;
}

export function paperFor(caseStudyId: string, structuredId: string): Paper | null {
  const caseStudy = caseStudies().find(s => s.id === caseStudyId);
  const structured = setsFor('social-studies', 'structured').find(s => s.id === structuredId);
  if (!caseStudy || !structured) return null;
  const parts: PaperPart[] = [
    ...caseStudy.questions.map((question, i): PaperPart => ({ label: String(i + 1), section: 'A', question, marks: question.marks ?? 0 })),
    ...structured.questions.map((question, i): PaperPart => ({ label: `6(${'ab'[i] ?? i + 1})`, section: 'B', question, marks: question.marks ?? STRUCTURED_MARKS[question.skill] ?? 0 })),
  ];
  return { caseStudy, structured, parts, total: parts.reduce((n, p) => n + p.marks, 0) };
}

const fewestDone = (sets: HumanitiesSet[], answered: Set<string>): HumanitiesSet | undefined =>
  [...sets].map((s, i) => ({ s, i, done: s.questions.filter(q => answered.has(q.id)).length }))
    .sort((a, b) => a.done - b.done || a.i - b.i)[0]?.s;

/** The next paper for a student: the case study and the structured set they have done least of, in file order. */
export function nextPaper(answered: Set<string>): { caseStudyId: string; structuredId: string } | null {
  const cs = fewestDone(caseStudies(), answered);
  const sr = fewestDone(setsFor('social-studies', 'structured'), answered);
  return cs && sr ? { caseStudyId: cs.id, structuredId: sr.id } : null;
}

/** "1 h 45 min", "52 min". */
export function minutesLabel(m: number): string {
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
}

/** The clock on the paper: "1:44:59" left, or how far over. */
export function clockLabel(secondsLeft: number): string {
  const s = Math.abs(Math.trunc(secondsLeft));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
