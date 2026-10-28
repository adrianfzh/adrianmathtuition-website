// The P&C coach's EXACT COUNTER (SPEC-SELF-LEARNING.md §4c, built 28 Oct 2026, Adrian:
// "Yes, go"). A small Permutations & Combinations set-up is written as a spec (the
// objects, how they are placed, the rules); this file LISTS every outcome and counts the
// ones that keep the rules. No formula is trusted here: the method a student or a page
// uses is checked against this count (lib/pc-explain), and a wrong number is explained
// by finding the outcomes a wrong method counts twice or misses (whereWrong).
//
// Pure: no model, no database. Big set-ups are refused politely (CAP).

/** Identical objects share a label: the letters of APPLE are ['A','P','P','L','E']. */
export type PcMode =
  | 'row'      // r of the objects in a row (order matters)
  | 'circle'   // all the objects round a table (turning the table gives the same seating)
  | 'choose'   // r of the objects, order does not matter
  | 'boxes'    // one object per position, each position from its own list (repeats allowed unless said)
  | 'split';   // the objects into groups of the given sizes

export type PcRule =
  /** All copies of these labels side by side, as one block. `ordered`: the block only in the order listed. */
  | { t: 'together'; items: string[]; ordered?: boolean }
  /** No two of these side by side (in a split: no two in the same group). */
  | { t: 'apart'; items: string[] }
  | { t: 'start'; item: string }
  | { t: 'end'; item: string }
  /** Exactly k objects between a and b. */
  | { t: 'between'; a: string; b: string; k: number }
  /** How many objects with these labels are used / chosen. */
  | { t: 'count'; items: string[]; min?: number; max?: number }
  | { t: 'any'; rules: PcRule[] }
  | { t: 'not'; rule: PcRule };

export interface PcSpec {
  mode: PcMode;
  items: string[];
  /** How many to place or choose (row, choose); every object when left out. */
  r?: number;
  /** boxes: each position's own list. Left out: r positions, each from `items`. */
  positions?: string[][];
  /** boxes: a name for each position, for the picture ("1st letter", "S/T/F/G/M"). */
  labels?: string[];
  /** boxes: may an object be used twice? Default true. */
  repeat?: boolean;
  /** split: the group sizes; `labelled` when the groups have names (box A, box B…). */
  sizes?: number[];
  labelled?: boolean;
  /** circle: the seats are numbered, so turning the table gives a new seating. */
  numbered?: boolean;
  rules?: PcRule[];
}

/** An outcome: a sequence of labels (row, circle, boxes, choose) or groups of labels (split). */
export type Outcome = string[] | string[][];

export const CAP = 4_000_000;

export type CountResult =
  | { ok: true; count: number; how: 'listed' | 'positions'; listed: number }
  | { ok: false; reason: string };

// ── small helpers ────────────────────────────────────────────────────────────

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const subscript = (n: number) => String(n).split('').map(d => SUB[Number(d)]).join('');
/** 'P₂' → 'P' (the label before a copy number was added). */
export const baseLabel = (s: string) => s.replace(/[₀-₉]+$/, '');

export function factorial(n: number): number { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
export function nCr(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  let x = 1;
  for (let i = 1; i <= r; i++) x = (x * (n - r + i)) / i;
  return Math.round(x);
}
export function nPr(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  let x = 1;
  for (let i = 0; i < r; i++) x *= n - i;
  return x;
}

function tally(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return m;
}

/** Distinct sequences of length r from a multiset: r! × [x^r] Π (Σ x^j / j!). An estimate in floats, for the cap. */
export function sequencesOf(items: string[], r: number): number {
  let poly = [1];
  for (const c of tally(items).values()) {
    const next = new Array(Math.min(r, poly.length - 1 + c) + 1).fill(0);
    for (let i = 0; i < poly.length; i++) for (let j = 0; j <= c && i + j <= r; j++) next[i + j] += poly[i] / factorial(j);
    poly = next;
  }
  return Math.round((poly[r] ?? 0) * factorial(r));
}

function rotateMin(seq: string[]): string {
  let best: string | null = null;
  for (let i = 0; i < seq.length; i++) {
    const k = [...seq.slice(i), ...seq.slice(0, i)].join('|');
    if (best === null || k < best) best = k;
  }
  return best ?? '';
}

// ── the rules ────────────────────────────────────────────────────────────────

const inSet = (items: string[]) => { const s = new Set(items); return (tok: string) => s.has(baseLabel(tok)) || s.has(tok); };

function seqRule(rule: PcRule, seq: string[], ring: boolean): boolean {
  const n = seq.length;
  switch (rule.t) {
    case 'together': {
      const hit = inSet(rule.items);
      const at = seq.map((t, i) => (hit(t) ? i : -1)).filter(i => i >= 0);
      if (at.length <= 1) return true;
      let block: number[] | null = null;
      if (!ring) block = at[at.length - 1] - at[0] === at.length - 1 ? at : null;
      else {
        // Contiguous round the ring: some start s with s..s+k-1 (mod n) all hits.
        for (const s of at) {
          const run = Array.from({ length: at.length }, (_, j) => (s + j) % n);
          if (run.every(i => hit(seq[i]))) { block = run; break; }
        }
      }
      if (!block) return false;
      if (rule.ordered) {
        const got = block.map(i => baseLabel(seq[i]));
        if (got.join('|') !== rule.items.join('|')) return false;
      }
      return true;
    }
    case 'apart': {
      const hit = inSet(rule.items);
      for (let i = 0; i + 1 < n; i++) if (hit(seq[i]) && hit(seq[i + 1])) return false;
      if (ring && n > 2 && hit(seq[n - 1]) && hit(seq[0])) return false;
      return true;
    }
    case 'start': return n > 0 && inSet([rule.item])(seq[0]);
    case 'end': return n > 0 && inSet([rule.item])(seq[n - 1]);
    case 'between': {
      const a = seq.findIndex(inSet([rule.a])), b = seq.findIndex(inSet([rule.b]));
      if (a < 0 || b < 0) return false;
      return Math.abs(a - b) - 1 === rule.k;
    }
    case 'count': {
      const c = seq.filter(inSet(rule.items)).length;
      return (rule.min === undefined || c >= rule.min) && (rule.max === undefined || c <= rule.max);
    }
    case 'any': return rule.rules.some(x => seqRule(x, seq, ring));
    case 'not': return !seqRule(rule.rule, seq, ring);
  }
}

function splitRule(rule: PcRule, groups: string[][]): boolean {
  switch (rule.t) {
    case 'together': { const hit = inSet(rule.items); return groups.filter(g => g.some(hit)).length <= 1; }
    case 'apart': { const hit = inSet(rule.items); return groups.every(g => g.filter(hit).length <= 1); }
    case 'any': return rule.rules.some(x => splitRule(x, groups));
    case 'not': return !splitRule(rule.rule, groups);
    default: return seqRule(rule, groups.flat(), false);
  }
}

export function keeps(spec: PcSpec, o: Outcome): boolean {
  const rules = spec.rules ?? [];
  if (spec.mode === 'split') return rules.every(r => splitRule(r, o as string[][]));
  return rules.every(r => seqRule(r, o as string[], spec.mode === 'circle'));
}

// ── the outcomes ─────────────────────────────────────────────────────────────

/** The key that tells two outcomes apart under this spec (a circle by its turning, a choice by its contents). */
export function outcomeKey(spec: PcSpec, o: Outcome): string {
  if (spec.mode === 'split') {
    const gs = (o as string[][]).map(g => [...g].map(baseLabel).sort().join(''));
    return (spec.labelled ? gs : [...gs].sort()).join('|');
  }
  const seq = (o as string[]).map(baseLabel);
  if (spec.mode === 'choose') return [...seq].sort().join('|');
  if (spec.mode === 'circle' && !spec.numbered) return rotateMin(seq);
  return seq.join('|');
}

/** How many outcomes must be listed (before the rules), or Infinity when it cannot be said. */
export function listSize(spec: PcSpec): number {
  const n = spec.items.length;
  switch (spec.mode) {
    case 'row': return sequencesOf(spec.items, spec.r ?? n);
    case 'circle': {
      if (spec.numbered) return sequencesOf(spec.items, n);
      // One copy of the rarest label is seated first; the rest are listed.
      const t = tally(spec.items);
      const rare = [...t.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
      const rest = [...spec.items]; rest.splice(rest.indexOf(rare), 1);
      return sequencesOf(rest, rest.length);
    }
    case 'choose': {
      // Count vectors: Π (c_i + 1) is an upper bound.
      let x = 1; for (const c of tally(spec.items).values()) x *= c + 1; return x;
    }
    case 'boxes': return boxPools(spec).reduce((a, p) => a * p.length, 1);
    case 'split': {
      const sizes = spec.sizes ?? [];
      let left = n, x = 1;
      for (const s of sizes) { x *= nCr(left, s); left -= s; }
      return x;
    }
  }
}

function boxPools(spec: PcSpec): string[][] {
  if (spec.positions?.length) return spec.positions;
  const pool = [...new Set(spec.items)];
  return Array.from({ length: spec.r ?? 1 }, () => pool);
}

/** Every outcome that keeps the rules, each once (by outcomeKey). Throws past the cap. */
export function* outcomes(spec: PcSpec): Generator<Outcome> {
  const size = listSize(spec);
  if (!(size <= CAP)) throw new TooBig(size);
  const n = spec.items.length;
  const seen = new Set<string>();
  // Rows, boxes and choices are distinct as listed; a circle (turning) and a split (group order) are not.
  const dedupe = (spec.mode === 'circle' && !spec.numbered) || spec.mode === 'split';
  const emit = function* (o: Outcome) {
    if (!keeps(spec, o)) return;
    if (!dedupe) { yield o; return; }
    const k = outcomeKey(spec, o);
    if (seen.has(k)) return;
    seen.add(k);
    yield o;
  };
  if (spec.mode === 'row' || (spec.mode === 'circle')) {
    const r = spec.mode === 'row' ? spec.r ?? n : n;
    const counts = tally(spec.items);
    const keys = [...counts.keys()];
    const seq: string[] = [];
    let first: string | null = null;
    if (spec.mode === 'circle' && !spec.numbered && n > 0) {
      first = [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
      counts.set(first, counts.get(first)! - 1);
      seq.push(first);
    }
    const target = r;
    function* rec(): Generator<string[]> {
      if (seq.length === target) { yield [...seq]; return; }
      for (const k of keys) {
        const c = counts.get(k)!;
        if (!c) continue;
        counts.set(k, c - 1); seq.push(k);
        yield* rec();
        seq.pop(); counts.set(k, c);
      }
    }
    // A circle needs dedupe by turning, so every leaf goes through emit; a row's leaves are already distinct.
    for (const s of rec()) yield* emit(s);
    return;
  }
  if (spec.mode === 'choose') {
    const r = spec.r ?? n;
    const entries = [...tally(spec.items).entries()];
    const pick: string[] = [];
    function* rec(i: number, left: number): Generator<string[]> {
      if (left === 0) { yield [...pick]; return; }
      if (i >= entries.length) return;
      const [k, c] = entries[i];
      for (let j = Math.min(c, left); j >= 0; j--) {
        for (let x = 0; x < j; x++) pick.push(k);
        yield* rec(i + 1, left - j);
        for (let x = 0; x < j; x++) pick.pop();
      }
    }
    for (const s of rec(0, r)) yield* emit(s);
    return;
  }
  if (spec.mode === 'boxes') {
    const pools = boxPools(spec);
    const repeat = spec.repeat !== false;
    const seq: string[] = [];
    const used = new Set<string>();
    function* rec(i: number): Generator<string[]> {
      if (i === pools.length) { yield [...seq]; return; }
      for (const t of pools[i]) {
        if (!repeat && used.has(t)) continue;
        seq.push(t); used.add(t);
        yield* rec(i + 1);
        seq.pop(); if (!seq.includes(t)) used.delete(t);
      }
    }
    for (const s of rec(0)) yield* emit(s);
    return;
  }
  // split: the objects are told apart by position in `items` (copies get numbers so a choice is a set of indices).
  const sizes = spec.sizes ?? [];
  const groups: string[][] = [];
  const left = spec.items.map((x, i) => ({ x, i }));
  function* rec(g: number, pool: { x: string; i: number }[]): Generator<string[][]> {
    if (g === sizes.length) { if (!pool.length) yield groups.map(x => [...x]); return; }
    const s = sizes[g];
    const idx: number[] = [];
    function* comb(start: number): Generator<string[][]> {
      if (idx.length === s) {
        const chosen = idx.map(j => pool[j]);
        groups.push(chosen.map(c => c.x));
        yield* rec(g + 1, pool.filter((_, j) => !idx.includes(j)));
        groups.pop();
        return;
      }
      for (let j = start; j < pool.length; j++) { idx.push(j); yield* comb(j + 1); idx.pop(); }
    }
    yield* comb(0);
  }
  for (const s of rec(0, left)) yield* emit(s);
}

export class TooBig extends Error {
  constructor(public size: number) { super(`too big: about ${Math.round(size).toLocaleString('en-US')} outcomes to list`); }
}

/** A spec's own problems, in plain words; null when it can be counted. */
export function specProblem(spec: PcSpec): string | null {
  if (!spec || !Array.isArray(spec.items)) return 'The set-up has no objects.';
  const n = spec.items.length;
  if (spec.mode !== 'boxes' && n === 0) return 'The set-up has no objects.';
  if (n > 40) return 'More than 40 objects: too many to list.';
  if (spec.r !== undefined && (!Number.isInteger(spec.r) || spec.r < 0 || (spec.mode !== 'boxes' && spec.r > n))) return `Cannot take ${spec.r} of ${n} objects.`;
  if (spec.mode === 'split') {
    const s = spec.sizes ?? [];
    if (!s.length || s.reduce((a, b) => a + b, 0) !== n) return 'The group sizes must add up to the number of objects.';
  }
  if (spec.mode === 'boxes' && !(spec.positions?.length || spec.r)) return 'Say how many positions there are.';
  return null;
}

/**
 * Count exactly. Boxes with repeats allowed and no rules are counted position by
 * position (each position is its own choice, so the count is the product — exact,
 * and it is how 10⁸ telephone numbers are counted). Everything else is listed.
 */
export function count(spec: PcSpec): CountResult {
  const bad = specProblem(spec);
  if (bad) return { ok: false, reason: bad };
  if (spec.mode === 'boxes' && spec.repeat !== false && !(spec.rules ?? []).length) {
    const c = boxPools(spec).reduce((a, p) => a * p.length, 1);
    if (Number.isSafeInteger(c)) return { ok: true, count: c, how: 'positions', listed: 0 };
  }
  try {
    let c = 0;
    for (const _ of outcomes(spec)) c++;
    return { ok: true, count: c, how: 'listed', listed: c };
  } catch (e) {
    if (e instanceof TooBig) {
      return { ok: false, reason: `Too big to count one by one (about ${Math.round(e.size).toLocaleString('en-US')} to list; the counter stops at ${CAP.toLocaleString('en-US')}).` };
    }
    throw e;
  }
}

// ── showing an outcome ───────────────────────────────────────────────────────

export function showOutcome(spec: PcSpec, o: Outcome): string {
  if (spec.mode === 'split') return (o as string[][]).map(g => `[${g.join(' ')}]`).join(' ');
  const seq = o as string[];
  const tight = seq.every(t => t.length === 1);
  const body = seq.join(tight ? '' : ' ');
  if (spec.mode === 'choose') return `{${seq.join(', ')}}`;
  if (spec.mode === 'circle') return `${seq.join(' ')} (round the table, clockwise)`;
  return body;
}

/** Number the copies of each repeated label: P, P → P₁, P₂ (so identical objects are told apart). */
export function labelCopies(items: string[]): string[] {
  const t = tally(items);
  const seen = new Map<string, number>();
  return items.map(x => {
    if ((t.get(x) ?? 0) < 2) return x;
    const k = (seen.get(x) ?? 0) + 1;
    seen.set(x, k);
    return `${x}${subscript(k)}`;
  });
}

/** Labels that appear more than once, with how often. */
export function repeats(items: string[]): [string, number][] {
  return [...tally(items).entries()].filter(([, c]) => c > 1);
}

export function ruleWords(rule: PcRule): string {
  const list = (xs: string[]) => [...new Set(xs)].join(', ');
  switch (rule.t) {
    case 'together': return `${list(rule.items)} side by side`;
    case 'apart': return `no two of ${list(rule.items)} side by side`;
    case 'start': return `starts with ${rule.item}`;
    case 'end': return `ends with ${rule.item}`;
    case 'between': return `exactly ${rule.k} between ${rule.a} and ${rule.b}`;
    case 'count': {
      const what = list(rule.items);
      if (rule.min !== undefined && rule.min === rule.max) return `exactly ${rule.min} of ${what}`;
      if (rule.min !== undefined && rule.max !== undefined) return `${rule.min} to ${rule.max} of ${what}`;
      if (rule.min !== undefined) return rule.min === 1 && rule.items.length === 1 ? `${what} is in` : `at least ${rule.min} of ${what}`;
      if (rule.max === 0) return rule.items.length === 1 ? `${what} is left out` : `none of ${what}`;
      return `at most ${rule.max} of ${what}`;
    }
    case 'any': return rule.rules.map(ruleWords).join(' or ');
    case 'not': return `not (${ruleWords(rule.rule)})`;
  }
}
