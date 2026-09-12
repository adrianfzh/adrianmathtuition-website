// The essay report as the app shows it (SPEC-ESSAY-MARKING.md §What comes back).
// The bot validated the report (its lib/essay-report); this is the RENDER side:
// the student's own text cut into segments with the marks laid on it, the band
// range, and the trend across the last essays. Pure; tested.

export interface EssayMark {
  quote: string;
  start: number;
  end: number;
  fix: string | null;
  code: string | null;
  reason: string | null;
}
export interface EssayHabit { code: string; count: number; example: string | null; advice: string | null }
export interface EssayTask {
  answered: 'yes' | 'partly' | 'no' | null;
  points: { point: string; met: boolean }[];
  opening: string | null;
  ending: string | null;
  paragraphs: { n: number; controlling_idea: boolean; note: string | null }[];
}
export interface EssayUpgrade { quote: string; better: string; why: string | null }
export interface EssayBand { band: number; min: number; max: number; descriptors: string[]; evidence: string | null }
export interface EssayReport {
  word_count: number;
  marks: EssayMark[];
  habits: EssayHabit[];
  task: EssayTask | null;
  upgrades: EssayUpgrade[];
  bands: Record<string, EssayBand | null>;
  total: { min: number; max: number; out_of: number } | null;
  summary: string | null;
}

export type EssayStatus = 'queued' | 'marking' | 'marked' | 'held' | 'failed';

export interface EssaySegment {
  text: string;
  mark: EssayMark | null;
}

/**
 * Cut the essay into plain and marked segments, in order. Marks that overlap
 * an earlier one, or fall outside the text, are skipped rather than drawn
 * wrongly — the bot's belt already sorted and located them, this is the guard
 * on the render side.
 */
export function segmentsFor(text: string, marks: readonly EssayMark[]): EssaySegment[] {
  const out: EssaySegment[] = [];
  let pos = 0;
  const sorted = [...marks].filter(m => Number.isInteger(m.start) && Number.isInteger(m.end) && m.end > m.start && m.start >= 0 && m.end <= text.length)
    .sort((a, b) => a.start - b.start);
  for (const m of sorted) {
    if (m.start < pos) continue;                       // overlaps the previous mark
    if (m.start > pos) out.push({ text: text.slice(pos, m.start), mark: null });
    out.push({ text: text.slice(m.start, m.end), mark: m });
    pos = m.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), mark: null });
  return out;
}

/** "Band 4 · 7–8 of 10" — never a single number. */
export function bandLine(b: EssayBand | null, max: number): string {
  if (!b) return 'not decided';
  return `Band ${b.band} · ${b.min}–${b.max} of ${max}`;
}

export interface TrendRun { marked_at: string | null; created_at: string; code_counts: Record<string, number> | null }
export interface TrendLine { code: string; counts: number[] }

/**
 * The habit counts across the student's last `n` marked essays, oldest first,
 * for the codes that appear in the NEWEST essay's top three (the habits it
 * names) — "tense 7 → 4 → 2". Essays with no counts are skipped.
 */
export function trendFor(runs: readonly TrendRun[], n = 5): TrendLine[] {
  const marked = runs.filter(r => r.code_counts && typeof r.code_counts === 'object')
    .sort((a, b) => (a.marked_at ?? a.created_at) < (b.marked_at ?? b.created_at) ? -1 : 1)
    .slice(-n);
  if (marked.length < 2) return [];
  const latest = marked[marked.length - 1].code_counts!;
  const codes = Object.entries(latest).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
  return codes.map(code => ({ code, counts: marked.map(r => Number(r.code_counts![code] ?? 0)) }));
}

export const ESSAY_STATUS_WORDS: Record<EssayStatus, string> = {
  queued: 'Waiting to be read',
  marking: 'Being read now',
  marked: 'Marked',
  held: 'Being checked',
  failed: 'Could not be marked',
};

/** What the student is told while a held essay waits — never the internal reason. */
export function studentStatusLine(status: EssayStatus): string {
  switch (status) {
    case 'queued': return 'Your essay is in the queue. This usually takes a minute or two.';
    case 'marking': return 'Your essay is being read now — twice, to be sure. About a minute.';
    case 'held': return 'The two reads did not agree on the band, so Adrian is looking at it. The feedback will be here when he has.';
    case 'failed': return 'Something went wrong with this one. Hand it in again, or tell Adrian.';
    default: return '';
  }
}
