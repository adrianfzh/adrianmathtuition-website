// "WHERE DID I COUNT WRONG" — the P&C coach's help under a wrong number
// (SPEC-SELF-LEARNING.md §4c, 28 Oct 2026). A wrong count is nearly always the right
// count of a slightly wrong set-up: the identical letters treated as different, order
// counted in a choice, a row counted for a round table, a rule forgotten. Each of those
// is a spec here; the one whose exact count equals the student's number is the slip,
// and comparing its outcomes with the true ones gives the concrete examples — two
// arrangements counted as two that are one, or one that was missed.
// Pure: no model, no database.

import {
  baseLabel, count, keeps, labelCopies, outcomeKey, outcomes, repeats, ruleWords, showOutcome,
  type Outcome, type PcRule, type PcSpec,
} from './pc-count';

export interface WrongModel {
  key: string;
  /** What went wrong, in plain words (shown above the examples). */
  say: string;
  spec: PcSpec;
}

export interface Comparison {
  /** Two outcomes the other count has as two, that are the same one. */
  doubles: [string, string][];
  /** Counted, but not allowed. */
  extras: string[];
  /** Allowed, but not counted. */
  missing: string[];
}

export type WhereWrong =
  | { kind: 'right' }
  | { kind: 'found'; key: string; say: string; theirs: number; right: number; examples: Comparison }
  | { kind: 'ratio'; say: string; theirs: number; right: number }
  | { kind: 'unknown'; say: string; theirs: number; right: number }
  | { kind: 'cannot'; reason: string };

const COMPARE_CAP = 300_000;

/**
 * Compare a different count (`other`) with the true one, as the TRUE spec tells
 * outcomes apart: up to `max` examples of each kind.
 */
export function compareSpecs(truth: PcSpec, other: PcSpec, max = 2): Comparison | null {
  const t = count(truth), o = count(other);
  if (!t.ok || !o.ok || t.count > COMPARE_CAP || o.count > COMPARE_CAP) return null;
  const truthKeys = new Set<string>();
  const truthShow = new Map<string, Outcome>();
  for (const x of outcomes(truth)) { const k = outcomeKey(truth, x); truthKeys.add(k); if (truthShow.size < 5000) truthShow.set(k, x); }
  const firstOf = new Map<string, Outcome>();
  const doubles: [string, string][] = [];
  const extras: string[] = [];
  const otherKeys = new Set<string>();
  for (const x of outcomes(other)) {
    const k = outcomeKey(truth, x);
    otherKeys.add(k);
    if (!truthKeys.has(k)) { if (extras.length < max) extras.push(showOutcome(other, x)); continue; }
    const had = firstOf.get(k);
    if (had) { if (doubles.length < max) doubles.push([showOutcome(other, had), showOutcome(other, x)]); }
    else firstOf.set(k, x);
  }
  const missing: string[] = [];
  for (const x of outcomes(truth)) {
    if (missing.length >= max) break;
    if (!otherKeys.has(outcomeKey(truth, x))) missing.push(showOutcome(truth, x));
  }
  return { doubles, extras, missing };
}

/** The same rules, with every label in `from` also matching its numbered copies (they do already, by baseLabel). */
const withRules = (spec: PcSpec, rules: PcRule[]): PcSpec => ({ ...spec, rules });

/** The wrong set-ups worth trying for this spec, most common slip first. */
export function wrongModels(spec: PcSpec): WrongModel[] {
  const out: WrongModel[] = [];
  const rules = spec.rules ?? [];
  const reps = repeats(spec.items);
  if (reps.length && spec.mode !== 'boxes') {
    const names = reps.map(([l, c]) => `${c} ${l}'s`).join(' and ');
    out.push({
      key: 'identical-as-different',
      say: `You counted the identical letters as different (${names}). Swapping two identical ones gives the same thing, so it was counted more than once. Divide by ${reps.map(([, c]) => `${c}!`).join(' and ')}.`,
      spec: { ...spec, items: labelCopies(spec.items) },
    });
  }
  if (spec.mode === 'choose') {
    const r = spec.r ?? spec.items.length;
    out.push({
      key: 'order-counted',
      say: `Order does not matter in a choice: the same ${r} in a different order is the same choice. You counted each one ${r}! times. Use ⁿCᵣ.`,
      spec: { ...spec, mode: 'row', r },
    });
  }
  if (spec.mode === 'row' && (spec.r ?? spec.items.length) > 1) {
    out.push({
      key: 'order-ignored',
      say: 'Order matters here: the same objects in a different order is a different arrangement. Use ⁿPᵣ, not ⁿCᵣ.',
      spec: { ...spec, mode: 'choose' },
    });
  }
  if (spec.mode === 'circle' && !spec.numbered) {
    out.push({
      key: 'circle-as-row',
      say: `Turning everyone round the table gives the same seating, so a row's count has each seating ${spec.items.length} times. Use (n − 1)!.`,
      spec: { ...spec, mode: 'row', r: spec.items.length },
    });
  }
  if (spec.mode === 'circle' && spec.numbered) {
    out.push({
      key: 'numbered-as-circle',
      say: `The seats are numbered, so turning everyone one seat round gives a NEW seating. Multiply by the number of seats.`,
      spec: { ...spec, numbered: false },
    });
  }
  if (spec.mode === 'split' && !spec.labelled) {
    out.push({
      key: 'groups-named',
      say: 'The groups have no names, so swapping two groups of the same size gives the same split. Divide by m! for m groups of the same size.',
      spec: { ...spec, labelled: true },
    });
  }
  if (spec.mode === 'boxes') {
    out.push(spec.repeat === false
      ? { key: 'repeat-allowed', say: 'Nothing may be used twice here, but your count lets a position reuse one already used.', spec: { ...spec, repeat: true } }
      : { key: 'repeat-forbidden', say: 'Repeats are allowed here: every position has the full list.', spec: { ...spec, repeat: false } });
  }
  rules.forEach((rule, i) => {
    const rest = rules.filter((_, j) => j !== i);
    if (rule.t === 'together' && !rule.ordered && new Set(rule.items.map(baseLabel)).size > 1) {
      out.push({
        key: 'block-fixed',
        say: `Inside the block, ${[...new Set(rule.items)].join(', ')} can swap places. Multiply by the arrangements inside the block.`,
        spec: withRules(spec, [...rest.slice(0, i), { ...rule, ordered: true }, ...rest.slice(i)]),
      });
    }
    if (rule.t === 'apart' && spec.items.filter(x => rule.items.includes(baseLabel(x))).length >= 3) {
      out.push({
        key: 'apart-by-complement',
        say: '"Total − all together" still counts arrangements where just two of them touch. Use the gaps: arrange the others, then slot these into different gaps.',
        spec: withRules(spec, [...rest.slice(0, i), { t: 'not', rule: { t: 'together', items: rule.items } }, ...rest.slice(i)]),
      });
    }
    out.push({
      key: `dropped-${i}`,
      say: `Your count includes some that break the rule: ${ruleWords(rule)}.`,
      spec: withRules(spec, rest),
    });
    if (rule.t === 'any' && rule.rules.length === 2) {
      // "A or B" counted as A + B, forgetting to take away the ones that are both.
      out.push({ key: `or-overlap-${i}`, say: 'The ones that are BOTH were counted twice: once in each case. Take them away once.', spec });
    }
  });
  return out;
}

/** The count a wrong model gives (`or-overlap` adds the two cases without taking the overlap away). */
function modelCount(spec: PcSpec, m: WrongModel): number | null {
  if (m.key.startsWith('or-overlap-')) {
    const i = Number(m.key.slice('or-overlap-'.length));
    const rule = (spec.rules ?? [])[i];
    if (!rule || rule.t !== 'any') return null;
    const rest = (spec.rules ?? []).filter((_, j) => j !== i);
    let total = 0;
    for (const part of rule.rules) {
      const c = count({ ...spec, rules: [...rest, part] });
      if (!c.ok) return null;
      total += c.count;
    }
    return total;
  }
  const c = count(m.spec);
  return c.ok ? c.count : null;
}

function overlapExamples(spec: PcSpec, i: number): Comparison {
  const rule = (spec.rules ?? [])[i] as Extract<PcRule, { t: 'any' }>;
  const rest = (spec.rules ?? []).filter((_, j) => j !== i);
  const both: PcSpec = { ...spec, rules: [...rest, ...rule.rules] };
  const ex: [string, string][] = [];
  for (const o of outcomes(both)) {
    const s = showOutcome(spec, o);
    ex.push([`${s} (in "${ruleWords(rule.rules[0])}")`, `${s} (in "${ruleWords(rule.rules[1])}")`]);
    if (ex.length >= 1) break;
  }
  return { doubles: ex, extras: [], missing: [] };
}

/**
 * The student typed `theirs`; find where the count went wrong. Their own method,
 * written as a spec, can be passed as `theirSpec` (admin page): it is compared directly.
 */
export function whereWrong(spec: PcSpec, theirs: number, theirSpec?: PcSpec): WhereWrong {
  const truth = count(spec);
  if (!truth.ok) return { kind: 'cannot', reason: truth.reason };
  const right = truth.count;
  if (theirs === right) return { kind: 'right' };
  if (theirSpec) {
    const ex = compareSpecs(spec, theirSpec);
    if (ex) return { kind: 'found', key: 'their-method', say: 'Comparing your method with the one that counts each once:', theirs, right, examples: ex };
  }
  for (const m of wrongModels(spec)) {
    const c = modelCount(spec, m);
    if (c !== theirs) continue;
    let examples: Comparison | null;
    if (m.key.startsWith('or-overlap-')) examples = overlapExamples(spec, Number(m.key.slice('or-overlap-'.length)));
    else examples = compareSpecs(spec, m.spec);
    if (examples && (examples.doubles.length || examples.extras.length || examples.missing.length)) {
      return { kind: 'found', key: m.key, say: m.say, theirs, right, examples };
    }
    return { kind: 'found', key: m.key, say: m.say, theirs, right, examples: { doubles: [], extras: [], missing: [] } };
  }
  if (theirs > 0 && theirs > right && Number.isInteger(theirs / right)) {
    return { kind: 'ratio', theirs, right, say: `Your answer is exactly ${theirs / right} times too big: each one was counted ${theirs / right} times. Look for things that can swap without making a new one.` };
  }
  if (theirs > 0 && theirs < right && Number.isInteger(right / theirs)) {
    return { kind: 'ratio', theirs, right, say: `Your answer is exactly ${right / theirs} times too small. Look for things that can swap and DO make a new one, and count those orders too.` };
  }
  return {
    kind: 'unknown', theirs, right,
    say: theirs > right ? 'Your count is too big: some were counted twice, or some break a rule.' : 'Your count is too small: some were missed.',
  };
}

/** Plain lines for a WhereWrong result (the learn step and the admin page both show these). */
export function whereWrongLines(w: WhereWrong): string[] {
  if (w.kind !== 'found') return w.kind === 'right' ? [] : w.kind === 'cannot' ? [] : [w.say];
  const lines = [w.say];
  for (const [a, b] of w.examples.doubles) lines.push(`Counted twice: ${a} and ${b} are the same one.`);
  for (const x of w.examples.extras) lines.push(`Counted, but not allowed: ${x}.`);
  for (const x of w.examples.missing) lines.push(`Missed: ${x}.`);
  return lines;
}

export { keeps };
