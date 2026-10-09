// One revision step — "revise a topic in full" (SPEC-SELF-LEARNING.md §4):
// a worked example shown one line a tap → try one with the next step on tap →
// five on your own, typed and checked at once, pass = 4 of 5; not passed → the
// example again → a new five. This file is the pure part for the expansion
// steps: the working is DERIVED from the two brackets, so an answer can never
// disagree with its question, and a wrong answer is matched against the slips
// students actually make. No model call anywhere.

import {
  add, equal, isCollected, mul, mulTerm, parseExpr, polyOf, polyTex, scale, sub, sumTex, termTex,
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
  /** The worked example and the guided try, as typed brackets: "(x+3)(x-2)" or "2(a+3b)". */
  example: string;
  tryOne: string;
  /** Sets of five for "on your own"; a not-passed student gets the next set. */
  sets: string[][];
  /** What comes after this step, in plain words, and its slug once it is built. */
  next?: string;
  nextSlug?: string;
}

export interface Brackets { a: Term[]; b: Term[] }

/**
 * "(x+3)(x-2)" → the two brackets, terms in the order written; "2(a+3b)" → one
 * term outside and the bracket (a has one term). Null when it is neither.
 */
export function parseBrackets(q: string): Brackets | null {
  const two = /^\s*\(([^()]+)\)\s*\(([^()]+)\)\s*$/.exec(q);
  if (two) {
    const a = parseExpr(two[1])?.flat, b = parseExpr(two[2])?.flat;
    if (!a || !b || a.length < 2 || b.length < 2) return null;
    return { a, b };
  }
  const one = /^\s*([^()]+)\(([^()]+)\)\s*$/.exec(q);
  if (!one) return null;
  const a = parseExpr(one[1])?.flat, b = parseExpr(one[2])?.flat;
  if (!a || !b || a.length !== 1 || b.length < 2) return null;
  return { a, b };
}

/** One term outside a bracket, as in 2(a + 3b). */
export function isSingle(br: Brackets): boolean { return br.a.length === 1; }

export function questionTex(br: Brackets): string {
  return isSingle(br) ? `${termTex(br.a[0])}(${sumTex(br.b)})` : `(${sumTex(br.a)})(${sumTex(br.b)})`;
}

/** The four (or more) pieces, in the order they are multiplied out. */
export function pieces(br: Brackets): { x: Term; y: Term; product: Term }[] {
  const out: { x: Term; y: Term; product: Term }[] = [];
  for (const x of br.a) for (const y of br.b) out.push({ x, y, product: mulTerm(x, y) });
  return out;
}

export function expansion(br: Brackets): Poly { return mul(polyOf(br.a), polyOf(br.b)); }

export interface WorkLine { tex: string; why?: string }

/**
 * The working the way Adrian teaches it (9 Oct 2026, his "Rainbow" example):
 * an arrow from each term of the first bracket to each term of the second,
 * numbered in the order they are multiplied, then
 *   = x² − 2x + 3x − 6      (one piece per arrow)
 *   = x² + x − 6            ← Add up like terms
 * The arrows are drawn by the page over the question line; this is the chain
 * under them. The last line is dropped when there is nothing to collect.
 */
export function working(br: Brackets): WorkLine[] {
  const spread = pieces(br).map(p => p.product);
  const lines: WorkLine[] = [
    { tex: questionTex(br) },
    { tex: `= ${sumTex(spread)}`, why: 'One piece for each arrow. Watch the signs.' },
  ];
  if (hasLikeTerms(br)) lines.push({ tex: `= ${polyTex(expansion(br))}`, why: 'Add up like terms' });
  return lines;
}

/** How many taps the working takes: one per arrow, then one to add up like terms (when there are any). */
export function workingTaps(br: Brackets): number {
  const n = pieces(br).length;
  return n + (hasLikeTerms(br) ? 1 : 0);
}

/** True when two of the pieces are like terms, so there is a line of adding up to do. */
export function hasLikeTerms(br: Brackets): boolean {
  return expansion(br).size < pieces(br).filter(p => p.product.coef !== 0).length;
}

/** The answer as the working leaves it: the pieces in arrow order when nothing collects, else in reading order. */
export function answerTex(br: Brackets): string {
  return hasLikeTerms(br) ? polyTex(expansion(br)) : sumTex(pieces(br).map(p => p.product));
}

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
  // One term outside: only the first term inside was multiplied — 2(a + 3b) = 2a + 3b.
  if (isSingle(br) && equal(typed, polyOf([first.product, ...br.b.slice(1)]))) {
    const p = ps[1];
    return { key: 'first-only', say: `The term outside multiplies every term inside the bracket: ${times(p.x, p.y)}.` };
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
