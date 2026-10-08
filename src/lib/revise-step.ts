// One revision step — "revise a topic in full" (SPEC-SELF-LEARNING.md §4):
// a worked example shown one line a tap → try one with the next step on tap →
// five on your own, typed and checked at once, pass = 4 of 5; not passed → the
// example again → a new five. This file is the pure part for the expansion
// steps: the working is DERIVED from the two brackets, so an answer can never
// disagree with its question, and a wrong answer is matched against the slips
// students actually make. No model call anywhere.

import {
  add, equal, isCollected, mul, mulTerm, parseExpr, polyOf, polyTex, scale, sub, sumTex, termBodyTex, termTex,
  termTexBracketed, termsOf, type Poly, type Term,
} from './poly';

export const FIVE = 5;
export const PASS_MARK = 4;

export interface ReviseStep {
  slug: string;
  /** Position in its topic map, for "Step 2 of 8". */
  index: number;
  of: number;
  title: string;
  /** The idea, two short lines. */
  idea: [string, string];
  /** The worked example and the guided try, as typed brackets: "(x+3)(x-2)". */
  example: string;
  tryOne: string;
  /** Sets of five for "on your own"; a not-passed student gets the next set. */
  sets: string[][];
  /** What comes after this step, in plain words. */
  next?: string;
}

export interface Brackets { a: Term[]; b: Term[] }

/** "(x+3)(x-2)" → the two brackets, terms in the order written. Null when it is not two plain brackets. */
export function parseBrackets(q: string): Brackets | null {
  const m = /^\s*\(([^()]+)\)\s*\(([^()]+)\)\s*$/.exec(q);
  if (!m) return null;
  const a = parseExpr(m[1])?.flat, b = parseExpr(m[2])?.flat;
  if (!a || !b || a.length < 2 || b.length < 2) return null;
  return { a, b };
}

export function questionTex(br: Brackets): string { return `(${sumTex(br.a)})(${sumTex(br.b)})`; }

/** The four (or more) pieces, in the order they are multiplied out. */
export function pieces(br: Brackets): { x: Term; y: Term; product: Term }[] {
  const out: { x: Term; y: Term; product: Term }[] = [];
  for (const x of br.a) for (const y of br.b) out.push({ x, y, product: mulTerm(x, y) });
  return out;
}

export function expansion(br: Brackets): Poly { return mul(polyOf(br.a), polyOf(br.b)); }

export interface WorkLine { tex: string; why?: string }

/**
 * The working as one chain, a line per step:
 *   (x + 3)(x − 2) → x(x − 2) + 3(x − 2) → x² − 2x + 3x − 6 → x² + x − 6.
 * The last line is dropped when there is nothing to collect.
 */
export function working(br: Brackets): WorkLine[] {
  const second = `(${sumTex(br.b)})`;
  const split = br.a.map((t, i) => {
    const body = termBodyTex(t) === '1' ? '' : termBodyTex(t);
    const sign = i === 0 ? (t.coef < 0 ? '-' : '') : (t.coef < 0 ? '- ' : '+ ');
    return `${sign}${body}${second}`;
  }).join(' ');
  const spread = pieces(br).map(p => p.product);
  const lines: WorkLine[] = [
    { tex: questionTex(br) },
    { tex: `= ${split}`, why: 'Each term in the first bracket multiplies the whole second bracket.' },
    { tex: `= ${sumTex(spread)}`, why: 'Expand each small bracket. Watch the signs.' },
  ];
  const final = polyTex(expansion(br));
  if (final !== sumTex(spread)) lines.push({ tex: `= ${final}`, why: 'Collect the like terms.' });
  return lines;
}

export function answerTex(br: Brackets): string { return polyTex(expansion(br)); }

// ── Marking a typed answer ───────────────────────────────────────────────────

export type Verdict =
  | { kind: 'correct' }
  /** Could not be read: not an attempt, the student types again. */
  | { kind: 'unreadable'; say: string }
  /** Right so far but not finished (still in brackets, like terms not collected): not an attempt. */
  | { kind: 'unfinished'; say: string }
  | { kind: 'wrong'; slip: Slip };

export interface Slip { key: string; say: string }

const times = (x: Term, y: Term) => `$${termTexBracketed(x)} \\times ${termTexBracketed(y)} = ${termTex(mulTerm(x, y))}$`;

/** Which slip turns the right answer into what was typed? The first match wins; a miss is the general line. */
export function diagnose(br: Brackets, typed: Poly): Slip {
  const want = expansion(br);
  const ps = pieces(br);
  const first = ps[0], last = ps[ps.length - 1];

  // First × first and last × last only — the classic (x + 3)(x − 2) = x² − 6.
  if (br.a.length === 2 && br.b.length === 2 && equal(typed, polyOf([first.product, last.product]))) {
    return { key: 'first-last-only', say: 'You multiplied the first terms and the last terms only. Every term in the first bracket multiplies every term in the second: four pieces.' };
  }
  // The two numbers added instead of multiplied.
  const lx = br.a[br.a.length - 1], ly = br.b[br.b.length - 1];
  const added: Term = { coef: lx.coef + ly.coef, vars: {} };
  if (!Object.keys(lx.vars).length && !Object.keys(ly.vars).length
    && equal(typed, add(sub(want, polyOf([last.product])), polyOf([added])))) {
    return { key: 'added-last', say: `The last piece is a product, not a sum: ${times(lx, ly)}.` };
  }
  // One piece with the wrong sign.
  for (const p of ps) {
    if (equal(typed, sub(want, scale(polyOf([p.product]), 2)))) {
      return { key: 'sign', say: `Check the sign of one piece: ${times(p.x, p.y)}.` };
    }
  }
  // One piece left out.
  for (const p of ps) {
    if (equal(typed, sub(want, polyOf([p.product])))) {
      return { key: 'missing-piece', say: `One piece is missing: ${times(p.x, p.y)}.` };
    }
  }
  // The four pieces right, the collecting wrong: same top and bottom, a different middle.
  const diff = termsOf(sub(typed, want));
  const spread = ps.map(p => p.product);
  if (diff.length === 1 && spread.filter(t => sameLetters(t, diff[0])).length >= 2) {
    const like = spread.filter(t => sameLetters(t, diff[0]));
    return { key: 'collecting', say: `The pieces to collect are $${sumTex(like)}$. Add them again.` };
  }
  return { key: 'other', say: 'Go through the working line by line and find where yours changes.' };
}

function sameLetters(a: Term, b: Term): boolean {
  const ka = Object.keys(a.vars), kb = Object.keys(b.vars);
  return ka.length === kb.length && ka.every(v => a.vars[v] === b.vars[v]);
}

export function mark(question: string, typedRaw: string): Verdict {
  const br = parseBrackets(question);
  const typed = parseExpr(typedRaw);
  if (!br) return { kind: 'unreadable', say: 'This question could not be loaded.' };
  if (!typed) return { kind: 'unreadable', say: 'That could not be read. Type it like x² + 5x − 6.' };
  const want = expansion(br);
  if (equal(typed.poly, want)) {
    if (typed.hasBrackets) return { kind: 'unfinished', say: 'That is still in brackets. Expand it fully.' };
    if (!isCollected(typed)) return { kind: 'unfinished', say: 'Right so far. Now collect the like terms.' };
    return { kind: 'correct' };
  }
  return { kind: 'wrong', slip: diagnose(br, typed.poly) };
}

// ── The five, and the end of a session ───────────────────────────────────────

export interface FiveResult { right: number; passed: boolean; watch: Slip | null }

/** The score of a five, and the one thing to watch: the slip made most often (the first made wins a tie). */
export function fiveResult(slips: (Slip | null)[]): FiveResult {
  const right = slips.filter(s => s === null).length;
  const counts = new Map<string, { slip: Slip; n: number }>();
  for (const s of slips) {
    if (!s) continue;
    const had = counts.get(s.key);
    if (had) had.n++;
    else counts.set(s.key, { slip: s, n: 1 });
  }
  let watch: Slip | null = null, best = 0;
  for (const { slip, n } of counts.values()) if (n > best) { best = n; watch = slip; }
  return { right, passed: right >= PASS_MARK, watch };
}

/** The set a student gets on their n-th five (0-based); the sets go round. */
export function setFor(step: ReviseStep, attempt: number): string[] {
  const n = step.sets.length;
  return step.sets[((attempt % n) + n) % n];
}

/** Every question in a step, for the content test. */
export function allQuestions(step: ReviseStep): string[] {
  return [step.example, step.tryOne, ...step.sets.flat()];
}
