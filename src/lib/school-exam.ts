// 📝 School exam tracker (SPEC-EXAM-TRACKER.md, Adrian 15 Oct 2026: "take a scan of their
// exam papers when they finished their exams … then when they have another exam, do the
// same thing, so we can keep track"). Lives inside the Exams box on the student's Overview.
//
// The school's marks are the truth: the reader READS them, never re-marks. Pure — tested.
// The one model read is lib/school-exam-reader; the store is lib/school-exam-store.

import { isErrorKind, type ErrorKind } from './error-kinds';

/** The most pages one school paper may carry. */
export const SCHOOL_EXAM_MAX_PAGES = 40;

export type ExamPart = {
  /** question number as printed, e.g. "7" */
  q: string;
  /** part label, e.g. "a", "b(ii)", or "" for a question with no parts */
  part: string;
  /** marks the school gave */
  got: number;
  /** marks the part was worth */
  max: number;
  /** canonical topic */
  topic: string;
  /** one plain line on what went wrong — only when marks were lost */
  why: string;
  error_kind: ErrorKind | null;
  /** the reader could not read this mark clearly */
  unsure: boolean;
};

export type ExamRead = {
  parts: ExamPart[];
  /** the total the school wrote on the paper, if any */
  written_total: { got: number | null; max: number | null };
};

const num = (x: unknown): number | null => {
  const n = typeof x === 'string' ? Number(x.trim()) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Marks can be halves on some school papers; anything else is rounded to a half. */
const half = (n: number) => Math.round(n * 2) / 2;

/** One part from the reader (or from Adrian's edit), cleaned. Null when unusable. */
export function cleanPart(raw: unknown, topics: readonly string[] = []): ExamPart | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const q = String(r.q ?? '').trim().slice(0, 12);
  const max = num(r.max);
  let got = num(r.got);
  if (!q || max == null || max <= 0 || max > 100) return null;
  if (got == null) got = 0;
  got = Math.max(0, Math.min(half(got), half(max)));
  let topic = String(r.topic ?? '').trim().slice(0, 80);
  if (topics.length && topic) {
    const hit = topics.find(t => t.toLowerCase() === topic.toLowerCase());
    if (hit) topic = hit;
  }
  const lost = got < max;
  const ek = String(r.error_kind ?? '').trim();
  return {
    q, part: String(r.part ?? '').trim().slice(0, 12), got, max: half(max), topic: topic || 'Other',
    why: lost ? String(r.why ?? '').trim().slice(0, 200) : '',
    error_kind: lost && isErrorKind(ek) ? ek : null,
    unsure: r.unsure === true,
  };
}

/** The reader's JSON (tolerant of a code fence and text around it). Null when there is none. */
export function parseExamRead(raw: string, topics: readonly string[] = []): ExamRead | null {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const parts = (Array.isArray(j.parts) ? j.parts : []).map(p => cleanPart(p, topics)).filter((p): p is ExamPart => !!p);
    if (!parts.length) return null;
    const wt = (j.written_total && typeof j.written_total === 'object' ? j.written_total : {}) as Record<string, unknown>;
    return { parts, written_total: { got: num(wt.got), max: num(wt.max) } };
  } catch { return null; }
}

export function totals(parts: readonly ExamPart[]): { got: number; max: number } {
  let got = 0, max = 0;
  for (const p of parts) { got += p.got; max += p.max; }
  return { got: half(got), max: half(max) };
}

/** Red line for the check table: the read marks do not add up to the total the school wrote. */
export function totalMismatch(read: ExamRead): string | null {
  const t = totals(read.parts);
  const w = read.written_total;
  const bits: string[] = [];
  if (w.got != null && w.got !== t.got) bits.push(`the marks add up to ${t.got}, but the paper says ${w.got}`);
  if (w.max != null && w.max !== t.max) bits.push(`the parts are worth ${t.max}, but the paper is out of ${w.max}`);
  return bits.length ? bits.join('; ') : null;
}

export type TopicLoss = { topic: string; lost: number; max: number };

/** Marks lost per topic, biggest loss first; topics with nothing lost are kept at the end (max known). */
export function lossByTopic(parts: readonly ExamPart[]): TopicLoss[] {
  const m = new Map<string, TopicLoss>();
  for (const p of parts) {
    const t = m.get(p.topic) ?? { topic: p.topic, lost: 0, max: 0 };
    t.lost = half(t.lost + (p.max - p.got)); t.max = half(t.max + p.max);
    m.set(p.topic, t);
  }
  return [...m.values()].sort((a, b) => b.lost - a.lost || b.max - a.max || a.topic.localeCompare(b.topic));
}

export type Comparison = {
  better: { topic: string; before: number; now: number }[];
  stillWeak: { topic: string; before: number; now: number }[];
  newWeak: { topic: string; now: number }[];
  /** percentage points, rounded to one decimal; null when either paper has no total */
  change: number | null;
};

/** A topic counts as weak on a paper when it lost at least this many marks. */
export const WEAK_MIN_LOST = 2;

/**
 * This exam against the last one in the same subject. Only topics tested on BOTH papers
 * can be "better" or "still weak"; "new" is a topic weak now and not weak (or not tested) last time.
 */
export function compareExams(prev: readonly ExamPart[], cur: readonly ExamPart[]): Comparison {
  const a = new Map(lossByTopic(prev).map(t => [t.topic, t]));
  const b = lossByTopic(cur);
  const better: Comparison['better'] = [], stillWeak: Comparison['stillWeak'] = [], newWeak: Comparison['newWeak'] = [];
  for (const t of b) {
    const p = a.get(t.topic);
    const weakNow = t.lost >= WEAK_MIN_LOST;
    const weakBefore = !!p && p.lost >= WEAK_MIN_LOST;
    if (p && weakBefore && weakNow) stillWeak.push({ topic: t.topic, before: p.lost, now: t.lost });
    else if (p && weakBefore && !weakNow) better.push({ topic: t.topic, before: p.lost, now: t.lost });
    else if (weakNow) newWeak.push({ topic: t.topic, now: t.lost });
  }
  const pa = totals(prev), pb = totals(cur);
  const change = pa.max > 0 && pb.max > 0 ? Math.round((pb.got / pb.max - pa.got / pa.max) * 1000) / 10 : null;
  return { better, stillWeak, newWeak, change };
}

/** "WA3 2026" style label from a type and a date. */
export function examLabel(examType: string, examDate: string | null | undefined, subject?: string | null): string {
  const y = (examDate || '').slice(0, 4);
  return [examType, subject || '', /^\d{4}$/.test(y) ? y : ''].filter(Boolean).join(' · ');
}

export type ExamReport = {
  next_steps: { topic: string; action: string }[];
  parent_note: string;
};

/** The report writer's JSON → at most three next steps and the parent note. Null when unusable. */
export function parseReport(raw: string): ExamReport | null {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const steps = (Array.isArray(j.next_steps) ? j.next_steps : [])
      .map(s => (s && typeof s === 'object' ? s as Record<string, unknown> : {}))
      .map(s => ({ topic: String(s.topic ?? '').trim().slice(0, 80), action: String(s.action ?? '').trim().slice(0, 200) }))
      .filter(s => s.topic && s.action).slice(0, 3);
    const note = String(j.parent_note ?? '').trim().slice(0, 1200);
    if (!note) return null;
    return { next_steps: steps, parent_note: note };
  } catch { return null; }
}
