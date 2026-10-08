// The humanities report (SPEC-HUMANITIES.md §2, 2 Oct 2026): what the bot writes
// on a humanities_runs row and how the page words it. A level RANGE, never a
// mark. Pure — the page and the bench both import from here.

export type HumanitiesStatus = 'queued' | 'marking' | 'marked' | 'held' | 'failed';

export interface HumanitiesClaim {
  /** A verbatim piece of the student's answer. */
  quote: string;
  /** One of the scheme's four tags (from_source · not_supported · uses_context · evaluates). */
  tag: string;
  /** A few words on why. */
  note?: string | null;
}

/** One creditable point as the reader judged it (a point-marked answer). */
export interface PointCredit {
  /** The point's id in the question's list, or 'other' for a valid point not on it. */
  id: string;
  credit: number;
  /** The student's own words that make the point. */
  quote: string | null;
  note?: string | null;
  /** 'other' only: the point, in a few words. */
  text?: string | null;
}

export interface HumanitiesReport {
  /** 'points' on a point-marked answer: `level` and its range then hold MARKS (0 … levels_max). */
  marking?: 'points';
  points?: PointCredit[];
  /** The level the reads settled on. */
  level: number;
  level_lo: number;
  level_hi: number;
  levels_max: number;
  claims: HumanitiesClaim[];
  /** The one thing that would lift the answer. */
  lift: string;
  /** What a top answer does that this one does not — at most two lines. */
  gap: string[];
  /** One line for Adrian. */
  summary?: string | null;
}

/** "3 of 4 marks", or "2–3 of 4 marks" when the reads differed. */
export function marksLabel(lo: number, hi: number, max: number): string {
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  return `${a === b ? a : `${a}–${b}`} of ${max} ${max === 1 ? 'mark' : 'marks'}`;
}

/** The credited points as claims, so the answer can be shown with them marked. */
export function pointClaims(points: PointCredit[] | undefined): HumanitiesClaim[] {
  return (points ?? []).filter(p => p.credit > 0 && p.quote).map(p => ({ quote: p.quote as string, tag: p.credit >= 2 ? 'developed' : 'point', note: p.note ?? null }));
}

/** "Level 2–3 of 4", or "Level 3 of 4" when the reads agreed. */
export function levelLabel(lo: number, hi: number, max: number): string {
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  return a === b ? `Level ${a} of ${max}` : `Level ${a}–${b} of ${max}`;
}

export interface AnswerSegment { text: string; claim: HumanitiesClaim | null }

/**
 * The student's answer cut into plain text and tagged claims, in reading order.
 * A claim whose quote is not in the answer, or overlaps an earlier one, is dropped —
 * the answer shown is always the student's own text, whole.
 */
export function segmentAnswer(answer: string, claims: HumanitiesClaim[]): AnswerSegment[] {
  const spans: { start: number; end: number; claim: HumanitiesClaim }[] = [];
  for (const c of claims) {
    const q = (c.quote || '').trim();
    if (!q) continue;
    let from = 0, start = -1;
    // The first occurrence that does not collide with a span already taken.
    for (;;) {
      const i = answer.indexOf(q, from);
      if (i < 0) break;
      if (!spans.some(s => i < s.end && i + q.length > s.start)) { start = i; break; }
      from = i + 1;
    }
    if (start >= 0) spans.push({ start, end: start + q.length, claim: c });
  }
  spans.sort((a, b) => a.start - b.start);
  const out: AnswerSegment[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start > at) out.push({ text: answer.slice(at, s.start), claim: null });
    out.push({ text: answer.slice(s.start, s.end), claim: s.claim });
    at = s.end;
  }
  if (at < answer.length) out.push({ text: answer.slice(at), claim: null });
  return out;
}

export function humanitiesStatusLine(status: HumanitiesStatus): string {
  switch (status) {
    case 'queued': return 'Handed in. Your feedback will show here in a few minutes.';
    case 'marking': return 'Being read — a few minutes.';
    case 'held': return 'The two reads did not agree on the level, so the range below is wide. Use the tags and the lift.';
    case 'failed': return 'This one could not be read. Hand it in again.';
    default: return '';
  }
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
