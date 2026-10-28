// A P&C LEARN step's pure part (SPEC-SELF-LEARNING.md §4c): the working of a question
// (his own lines where the notes write them, else the checked method of lib/pc-explain),
// and marking a typed number with the "where did I count wrong" help under it.
// No model anywhere.
import { count } from './pc-count';
import { explain, type ExplainLine } from './pc-explain';
import type { PcQuestion } from './pc-steps';
import { whereWrong, whereWrongLines } from './pc-wrong';

export const PC_FIVE = 5;
export const PC_PASS = 4;

export interface PcWorked {
  answer: number;
  lines: ExplainLine[];
  boxes: { label: string; ways: number }[] | null;
  /** The pc_arrange spec (drawn on the server through the bot's figure library). */
  picture: Record<string, unknown> | null;
}

/** The last whole number written in a line of working ("= 60", "\frac{5!}{2!} = 60"). */
export function lastNumber(tex: string): number | null {
  const m = tex.replace(/\\,|,/g, '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

/** The working of a question; null when its method does not agree with the exact count (never shown). */
export function workedOf(q: PcQuestion): PcWorked | null {
  const e = explain(q.spec);
  const exact = e.ok ? null : count(q.spec);
  const answer = e.ok ? e.total : exact?.ok ? exact.count : null;
  if (answer === null) return null;
  if (q.lines?.length) {
    if (lastNumber(q.lines[q.lines.length - 1].tex) !== answer) return null;
    return { answer, lines: q.lines, boxes: q.boxes ?? (e.ok ? e.boxes ?? null : null), picture: e.ok ? e.picture : null };
  }
  if (!e.ok) return null;
  return { answer, lines: e.lines, boxes: q.boxes ?? e.boxes ?? null, picture: e.picture };
}

export type PcVerdict =
  | { kind: 'correct' }
  | { kind: 'unreadable'; say: string }
  | { kind: 'wrong'; key: string; help: string[] };

/** "1,300,000,000", "60 ways", "60" → the number; null when it is not one whole number. */
export function readNumber(typed: string): number | null {
  const t = typed.replace(/ways?$/i, '').replace(/[\s,]/g, '');
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/** Mark a typed number. A wrong one gets the counted help when a slip explains it, else the step's watch-out. */
export function markPc(q: PcQuestion, answer: number, typed: string, watchOut?: string): PcVerdict {
  const n = readNumber(typed);
  if (n === null) return { kind: 'unreadable', say: 'Type the number only, like 60.' };
  if (n === answer) return { kind: 'correct' };
  const w = whereWrong(q.spec, n);
  if (w.kind === 'found') return { kind: 'wrong', key: w.key, help: whereWrongLines(w) };
  if (w.kind === 'ratio') return { kind: 'wrong', key: 'ratio', help: [w.say, ...(watchOut ? [watchOut] : [])] };
  return { kind: 'wrong', key: 'other', help: watchOut ? [watchOut] : ['Go through the working line by line and find where yours changes.'] };
}

/** "1. Draw one box…\n2. Write…" → one hint a line, numbers dropped. */
export function methodLines(method: string): string[] {
  return method.split(/\n+|(?<=\.)\s+(?=\d+\.\s)/).map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
}

export interface FiveResultPc { right: number; passed: boolean; watch: string | null }
/** The score of a five and the slip made most often. */
export function pcFiveResult(results: (PcVerdict & { kind: 'correct' | 'wrong' })[]): FiveResultPc {
  const right = results.filter(r => r.kind === 'correct').length;
  const tally = new Map<string, { n: number; say: string }>();
  for (const r of results) if (r.kind === 'wrong') {
    const had = tally.get(r.key);
    if (had) had.n++; else tally.set(r.key, { n: 1, say: r.help[0] ?? '' });
  }
  let watch: string | null = null, best = 0;
  for (const { n, say } of tally.values()) if (n > best) { best = n; watch = say; }
  return { right, passed: right >= PC_PASS, watch };
}
