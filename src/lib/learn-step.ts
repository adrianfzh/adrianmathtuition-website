// One LEARN step (SPEC-SELF-LEARNING.md §4, §4a) — the idea taught from the
// start, in the order and the way of Adrian's own notes: a worked example shown
// one line a tap → try one with the next step on tap → five on your own, typed
// and checked at once, pass = 4 of 5; not passed → the example again → a new five.
// (LEARN is not REVISE: revising starts from exam questions and is built
// separately.) This file is the pure part. No model call anywhere.
//
// A question is the expression as typed — "(a+b)(a-3b)", "4a-2(4a+5b)". Its
// answer is WORKED OUT from it (lib/poly), so an answer can never disagree with
// its question. The working shown is:
//   · one term outside a bracket, or two brackets → his "Rainbow" (numbered arrows);
//   · a bracket squared → his formula lines, (a ± b)² = a² ± 2ab + b²;
//   · anything else → the lines written for it in the step, with his margin words.

import {
  add, equal, isCollected, mul, mulTerm, parseExpr, polyOf, polyTex, scale, sub, sumTex, termBodyTex, termTex,
  termTexBracketed, termsOf, type Poly, type Term,
} from './poly';

export const FIVE = 5;
export const PASS_MARK = 4;

export interface WorkLine { tex: string; why?: string }

/**
 * A question: the expression as typed, with its working lines when it has no
 * drawn method of its own; or a question in words whose answer is a number
 * ("Given that ab = −6 and a² + b² = 30, find the value of (a + b)²").
 */
export type Question = string | { q: string; lines: WorkLine[] } | NumberQuestion;
export interface NumberQuestion { prompt: string; answer: number; lines: WorkLine[] }
const isNumber = (x: Question): x is NumberQuestion => typeof x !== 'string' && 'prompt' in x;
/** What tells one question from another: the typed expression, or the words. */
export const qOf = (x: Question): string => (typeof x === 'string' ? x : isNumber(x) ? x.prompt : x.q);

export interface LearnStep {
  slug: string;
  /** Position in the chapter of his notes, for "Step 3 of 11". */
  index: number;
  of: number;
  title: string;
  /** What the question asks: "Expand" or "Expand and simplify". */
  ask: string;
  /** The idea, two short lines. */
  idea: [string, string];
  /** The mistake that loses marks here — said under a wrong answer no known slip explains. */
  trap?: string;
  /** The one-minute clip for this step (a lesson slug, docs/LESSONS.md), when one exists. */
  clipSlug?: string;
  example: Question;
  tryOne: Question;
  /** Sets of five for "on your own"; a not-passed student gets the next set. */
  sets: Question[][];
  /** What comes after this step, in plain words, and its slug once it is built. */
  next?: string;
  nextSlug?: string;
}

// ── The shapes that are drawn ────────────────────────────────────────────────

/** `squared` = the question is written (2p + 3q)². */
export interface Brackets { a: Term[]; b: Term[]; squared?: boolean }

/**
 * "(x+3)(x-2)" → the two brackets, terms in the order written; "(x+3)^2" → the
 * same bracket twice; "2(a+3b)" → one term outside and the bracket (a has one
 * term). Null when it is none of these.
 */
export function parseBrackets(q: string): Brackets | null {
  const sq = /^\s*\(([^()]+)\)\s*(?:\^\s*2|²)\s*$/.exec(q);
  if (sq) {
    const a = parseExpr(sq[1])?.flat;
    if (!a || a.length !== 2) return null;
    return { a, b: a, squared: true };
  }
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

export function bracketsTex(br: Brackets): string {
  if (br.squared) return `(${sumTex(br.a)})^{2}`;
  return isSingle(br) ? `${termTex(br.a[0])}(${sumTex(br.b)})` : `(${sumTex(br.a)})(${sumTex(br.b)})`;
}

/** The pieces, in the order the arrows are numbered. */
export function pieces(br: Brackets): { x: Term; y: Term; product: Term }[] {
  const out: { x: Term; y: Term; product: Term }[] = [];
  for (const x of br.a) for (const y of br.b) out.push({ x, y, product: mulTerm(x, y) });
  return out;
}

export function expansion(br: Brackets): Poly { return mul(polyOf(br.a), polyOf(br.b)); }

/** True when two of the pieces are like terms, so there is a line of adding up to do. */
export function hasLikeTerms(br: Brackets): boolean {
  return expansion(br).size < pieces(br).filter(p => p.product.coef !== 0).length;
}

/** The Rainbow's chain: the question, one piece per arrow, then "Add up like terms" when there are any. */
export function rainbowLines(br: Brackets): WorkLine[] {
  const spread = pieces(br).map(p => p.product);
  const lines: WorkLine[] = [{ tex: bracketsTex(br) }, { tex: `= ${sumTex(spread)}` }];
  if (hasLikeTerms(br)) lines.push({ tex: `= ${polyTex(expansion(br))}`, why: 'Add up like terms' });
  return lines;
}

/**
 * A bracket squared, his way (notes §4, "Very Important"): the formula, with
 * each term kept in its own bracket, then worked out.
 *   (2p + 3q)² = (2p)² + 2(2p)(3q) + (3q)² = 4p² + 12pq + 9q²
 */
export function squareLines(br: Brackets): WorkLine[] {
  const [a, b] = br.a;
  const minus = b.coef < 0;
  const A = termTex(a), B = termBodyTex(b);
  const wrap = (t: string) => (/^[0-9]+$/.test(t) || /^[a-zA-Z]$/.test(t) ? t : `(${t})`);
  return [
    { tex: bracketsTex(br) },
    {
      tex: `= ${wrap(A)}^{2} ${minus ? '-' : '+'} 2(${A})(${B}) + ${wrap(B)}^{2}`,
      why: minus ? '(a − b)² = a² − 2ab + b²' : '(a + b)² = a² + 2ab + b²',
    },
    { tex: `= ${polyTex(expansion(br))}` },
  ];
}

// ── Any question ─────────────────────────────────────────────────────────────

/** A typed expression set out for reading: "4a-2(4a+5b)" → 4a - 2(4a + 5b). */
export function exprTex(q: string): string {
  const s = q.replace(/\s+/g, '').replace(/²/g, '^2').replace(/[−–]/g, '-');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], prev = s[i - 1];
    if (c === '^') {
      let j = i + 1;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      out += `^{${s.slice(i + 1, j)}}`;
      i = j - 1;
    } else if ((c === '+' || c === '-') && prev !== undefined && prev !== '(') out += ` ${c} `;
    else if (c === '*') out += ' \\times ';
    else out += c;
  }
  return out;
}

export type Shape = 'rainbow' | 'square' | 'lines' | 'none';

export interface Worked {
  shape: Shape;
  /** The brackets, for the drawn shapes. */
  br: Brackets | null;
  questionTex: string;
  answerTex: string;
  /** The chain under (or instead of) the picture; empty when a question has no working of its own. */
  lines: WorkLine[];
  /** Taps to show it all: one per arrow then one to add up (Rainbow), else one per line after the first. */
  taps: number;
  want: Poly;
  /** A question in words: shown instead of `questionTex`, and every line of `lines` is working. */
  prompt?: string;
}

/** Everything the page needs to show a question and its working. Null when the question cannot be read. */
export function work(x: Question): Worked | null {
  if (isNumber(x)) {
    return {
      shape: x.lines.length ? 'lines' : 'none', br: null, prompt: x.prompt, questionTex: '', lines: x.lines,
      answerTex: String(x.answer), taps: x.lines.length, want: polyOf([{ coef: x.answer, vars: {} }]),
    };
  }
  const q = qOf(x);
  const want = parseExpr(q)?.poly;
  if (!want) return null;
  const br = parseBrackets(q);
  if (br && !br.squared) {
    const lines = rainbowLines(br);
    const collected = hasLikeTerms(br);
    return {
      shape: 'rainbow', br, questionTex: bracketsTex(br), lines, want,
      // The pieces in arrow order when nothing collects — his 12 + 23k − 9k², not −9k² + 23k + 12.
      answerTex: collected ? polyTex(expansion(br)) : sumTex(pieces(br).map(p => p.product)),
      taps: pieces(br).length + (collected ? 1 : 0),
    };
  }
  if (br?.squared) {
    const lines = squareLines(br);
    return { shape: 'square', br, questionTex: bracketsTex(br), lines, want, answerTex: polyTex(want), taps: lines.length - 1 };
  }
  const lines = typeof x === 'string' ? [] : x.lines;
  const last = lines[lines.length - 1]?.tex.replace(/^=\s*/, '');
  return {
    shape: lines.length ? 'lines' : 'none', br: null, questionTex: exprTex(q), lines, want,
    answerTex: last ?? polyTex(want), taps: Math.max(0, lines.length - 1),
  };
}

// ── Questions whose answer is a number (his notes §5) ────────────────────────

/**
 * His Example 5a: given ab and a² + b², find (a ± b)². The working is the
 * formula, regrouped, then the two known values put in.
 */
export function squareFromSumAndProduct(x: string, y: string, sum: number, prod: number, sign: '+' | '-'): NumberQuestion {
  const answer = sign === '+' ? sum + 2 * prod : sum - 2 * prod;
  const sq = `${x}^{2} + ${y}^{2}`;
  return {
    prompt: `Given that $${x}${y} = ${prod}$ and $${sq} = ${sum}$, find the value of $(${x} ${sign} ${y})^{2}$.`,
    answer,
    lines: [
      { tex: `(${x} ${sign} ${y})^{2} = ${x}^{2} ${sign} 2${x}${y} + ${y}^{2}`, why: 'we can use the formula' },
      { tex: `= ${sq} ${sign} 2${x}${y}` },
      { tex: `= ${sum} ${sign} 2(${prod})`, why: `we know the value of ${x}² + ${y}² and ${x}${y}` },
      { tex: `= ${answer}` },
    ],
  };
}

/**
 * His Example 5b, the other way round: given (a ± b)² and ab, find a² + b².
 */
export function sumFromSquareAndProduct(x: string, y: string, square: number, prod: number, sign: '+' | '-'): NumberQuestion {
  const answer = sign === '+' ? square - 2 * prod : square + 2 * prod;
  const sq = `${x}^{2} + ${y}^{2}`;
  // 2ab moves to the other side, changing sign.
  const move = sign === '+' ? -2 * prod : 2 * prod;
  return {
    prompt: `Given that $(${x} ${sign} ${y})^{2} = ${square}$ and $${x}${y} = ${prod}$, find the value of $${sq}$.`,
    answer,
    lines: [
      { tex: `(${x} ${sign} ${y})^{2} = ${square}` },
      { tex: `${x}^{2} ${sign} 2${x}${y} + ${y}^{2} = ${square}`, why: 'we can use the formula' },
      { tex: `${sq} ${sign} 2(${prod}) = ${square}`, why: `sub ${x}${y} as ${prod}` },
      { tex: `${sq} = ${square} ${move < 0 ? '-' : '+'} ${Math.abs(move)}` },
      { tex: `= ${answer}` },
    ],
  };
}

/**
 * His Example 5c: a square worked without a calculator — 399² = (400 − 1)².
 * The round number is the nearest one with a single leading digit.
 */
export function evaluateSquare(n: number): NumberQuestion {
  const unit = 10 ** (String(n).length - 1);
  const base = Math.round(n / unit) * unit;
  const d = Math.abs(n - base);
  const sign = n < base ? '-' : '+';
  return {
    prompt: `Without using a calculator, find the value of $${n}^{2}$.`,
    answer: n * n,
    lines: [
      { tex: `${n}^{2}`, why: `rewrite ${n} as ${base} ${sign === '-' ? '−' : '+'} ${d}` },
      { tex: `= (${base} ${sign} ${d})^{2}`, why: `this is of the form (a ${sign === '-' ? '−' : '+'} b)², where a = ${base} and b = ${d}` },
      { tex: `= ${base}^{2} ${sign} 2(${base})(${d}) + ${d}^{2}`, why: sign === '-' ? '(a − b)² = a² − 2ab + b²' : '(a + b)² = a² + 2ab + b²' },
      { tex: `= ${base * base} ${sign} ${2 * base * d} + ${d * d}`, why: 'evaluate' },
      { tex: `= ${n * n}` },
    ],
  };
}

/**
 * His Practice 5b, Q6 and Q7: "By using a suitable identity, evaluate
 * 65² + 650 + 25" — spot a² ± 2ab + b² in the numbers and fold it into a square.
 * A small b is printed as its square (25), a large one as written (113²).
 */
export function foldIntoSquare(a: number, b: number, sign: '+' | '-'): NumberQuestion {
  const mid = 2 * a * b;
  const last = b <= 12 ? String(b * b) : `${b}^{2}`;
  const total = sign === '+' ? a + b : a - b;
  const s = sign === '-' ? '−' : '+';
  return {
    prompt: `By using a suitable identity, find the value of $${a}^{2} ${sign} ${mid} + ${last}$.`,
    answer: total * total,
    lines: [
      { tex: `${a}^{2} ${sign} ${mid} + ${last}` },
      { tex: `= ${a}^{2} ${sign} 2(${a})(${b}) + ${b}^{2}`, why: `${mid} = 2 × ${a} × ${b}${b <= 12 ? `, and ${b * b} = ${b}²` : ''}` },
      { tex: `= (${a} ${sign} ${b})^{2}`, why: `a² ${s} 2ab + b² = (a ${s} b)²` },
      { tex: `= ${total}^{2}` },
      { tex: `= ${total * total}` },
    ],
  };
}

/**
 * His Practice 5b, Q3: (a) simplify a² − (a + b)(a − b); (b) hence find
 * 2018² − 2023 × 2013. The typed answer is part (b).
 */
export function henceProduct(n: number, d: number): NumberQuestion {
  return {
    prompt: `(a) Simplify $a^{2} - (a + b)(a - b)$.\n\n(b) Hence find the value of $${n}^{2} - ${n + d} \\times ${n - d}$, without using a calculator.`,
    answer: d * d,
    lines: [
      { tex: 'a^{2} - (a + b)(a - b)', why: 'part (a)' },
      { tex: '= a^{2} - (a^{2} - ab + ab - b^{2})', why: 'Expand. Note the minus sign in front' },
      { tex: '= a^{2} - a^{2} + b^{2}' },
      { tex: '= b^{2}' },
      { tex: `${n}^{2} - ${n + d} \\times ${n - d}`, why: 'part (b)' },
      { tex: `= ${n}^{2} - (${n} + ${d})(${n} - ${d})`, why: `compare with part (a): a = ${n} and b = ${d}` },
      { tex: `= ${d}^{2}`, why: 'from part (a), the answer is b²' },
      { tex: `= ${d * d}` },
    ],
  };
}

/**
 * His Practice 5b, Q4: (a) simplify (x − y)² + 2xy; (b) hence find 299² + 2(300).
 */
export function henceSquare(x: number): NumberQuestion {
  return {
    prompt: `(a) Simplify $(x - y)^{2} + 2xy$.\n\n(b) Hence find the value of $${x - 1}^{2} + 2(${x})$, without using a calculator.`,
    answer: x * x + 1,
    lines: [
      { tex: '(x - y)^{2} + 2xy', why: 'part (a)' },
      { tex: '= x^{2} - 2xy + y^{2} + 2xy', why: '(a − b)² = a² − 2ab + b²' },
      { tex: '= x^{2} + y^{2}', why: 'Add up like terms' },
      { tex: `${x - 1}^{2} + 2(${x})`, why: 'part (b)' },
      { tex: `= (${x} - 1)^{2} + 2(${x})(1)`, why: `compare with part (a): x = ${x} and y = 1` },
      { tex: `= ${x}^{2} + 1^{2}`, why: 'from part (a), the answer is x² + y²' },
      { tex: `= ${x * x + 1}` },
    ],
  };
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

function sameLetters(a: Term, b: Term): boolean {
  const ka = Object.keys(a.vars), kb = Object.keys(b.vars);
  return ka.length === kb.length && ka.every(v => a.vars[v] === b.vars[v]);
}

/** Which slip turns the right answer into what was typed? The first match wins; null when none does. */
export function diagnose(br: Brackets, typed: Poly): Slip | null {
  const want = expansion(br);
  const ps = pieces(br);
  const first = ps[0], last = ps[ps.length - 1];

  // First × first and last × last only — (x + 3)(x − 2) = x² − 6, (2p + 3q)² = 4p² + 9q².
  if (br.a.length === 2 && br.b.length === 2 && equal(typed, polyOf([first.product, last.product]))) {
    if (br.squared) {
      return { key: 'first-last-only', say: `The middle term is missing: twice the product, $2(${termTex(br.a[0])})(${termBodyTex(br.a[1])})$.` };
    }
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
  // A square with only one of the two middle pieces — (x + 3)² = x² + 3x + 9.
  if (br.squared && equal(typed, sub(want, polyOf([ps[1].product])))) {
    return { key: 'half-middle', say: `The middle term is twice the product: $2(${termTex(br.a[0])})(${termBodyTex(br.a[1])})$.` };
  }
  // One piece with the wrong sign.
  for (const p of ps) {
    if (equal(typed, sub(want, scale(polyOf([p.product]), 2)))) {
      return { key: 'sign', say: `Check the sign of one piece: ${times(p.x, p.y)}.` };
    }
  }
  // A square with the middle term's sign wrong: both middle pieces flipped.
  if (br.squared && equal(typed, sub(want, scale(polyOf([ps[1].product, ps[2].product]), 2)))) {
    return { key: 'sign', say: `Check the sign of the middle term: it follows the sign inside the bracket.` };
  }
  // One piece left out.
  for (const p of ps) {
    if (equal(typed, sub(want, polyOf([p.product])))) {
      return { key: 'missing-piece', say: `One piece is missing: ${times(p.x, p.y)}.` };
    }
  }
  // The pieces right, the collecting wrong: a different middle only.
  const diff = termsOf(sub(typed, want));
  const spread = ps.map(p => p.product);
  if (diff.length === 1 && spread.filter(t => sameLetters(t, diff[0])).length >= 2) {
    const like = spread.filter(t => sameLetters(t, diff[0]));
    return { key: 'collecting', say: `The pieces to collect are $${sumTex(like)}$. Add them again.` };
  }
  return null;
}

const GENERAL = 'Go through the working line by line and find where yours changes.';

/** Mark what was typed. `trap` is the step's own warning, used when no known slip explains a wrong answer. */
export function mark(x: Question, typedRaw: string, trap?: string): Verdict {
  const w = work(x);
  const typed = parseExpr(typedRaw);
  if (!w) return { kind: 'unreadable', say: 'This question could not be loaded.' };
  if (w.prompt !== undefined) {
    // An answer that is a number: digits and a minus sign only.
    const t = typedRaw.replace(/[−–]/g, '-').replace(/[\s,]/g, '');
    if (!/^-?[0-9]+$/.test(t)) return { kind: 'unreadable', say: 'Type the number only.' };
    return equal(polyOf([{ coef: Number(t), vars: {} }]), w.want)
      ? { kind: 'correct' }
      : { kind: 'wrong', slip: trap ? { key: 'trap', say: trap } : { key: 'other', say: GENERAL } };
  }
  if (!typed) return { kind: 'unreadable', say: 'That could not be read. Type it like x² + 5x − 6.' };
  if (equal(typed.poly, w.want)) {
    if (typed.hasBrackets) return { kind: 'unfinished', say: 'That is still in brackets. Expand it fully.' };
    if (!isCollected(typed)) return { kind: 'unfinished', say: 'Right so far. Now add up the like terms.' };
    return { kind: 'correct' };
  }
  const known = w.br ? diagnose(w.br, typed.poly) : null;
  return { kind: 'wrong', slip: known ?? (trap ? { key: 'trap', say: trap } : { key: 'other', say: GENERAL }) };
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
export function setFor(step: LearnStep, attempt: number): Question[] {
  const n = step.sets.length;
  return step.sets[((attempt % n) + n) % n];
}

/** Every question in a step, for the content test. */
export function allQuestions(step: LearnStep): Question[] {
  return [step.example, step.tryOne, ...step.sets.flat()];
}
