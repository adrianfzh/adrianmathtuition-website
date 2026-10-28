// EXPLAIN A QUESTION — the P&C coach's method, from a question's spec
// (SPEC-SELF-LEARNING.md §4c, 28 Oct 2026). The method is the one in Adrian's notes
// ("12 Permutations and Combinations 1.pdf"): boxes for positions, ⁿPᵣ, ⁿCᵣ, divide
// by p! for identical letters, group the ones together, slot the ones apart, fix the
// ends, (n − 1)! round a table, cases. Each step has its count, and the picture is a
// `pc_arrange` figure (the bot's figure library draws it and recomputes every count).
//
// FAIL CLOSED: the method's total is checked against the exact counter (lib/pc-count);
// a method that disagrees is never shown. A set-up too big to count one by one is
// shown with `checked: false` (admin page only — every learn-step question is checked
// by the test).

import { count, factorial, nCr, nPr, baseLabel, type PcRule, type PcSpec } from './pc-count';

export interface ExplainLine { tex: string; why?: string }

/** One step of a method: its working, its count, and its piece of the pc_arrange picture. */
interface Step { tex: string; count: number; why?: string; pc?: Record<string, unknown> | null }
interface Case { title?: string; sign: 1 | -1; steps: Step[] }

export interface Explained {
  ok: true;
  /** One idea per line, his margin words beside. The last line is the total. */
  lines: ExplainLine[];
  total: number;
  /** The exact counter agreed (false only when the set-up was too big to list). */
  checked: boolean;
  /** The pc_arrange spec for the picture, or null when this method has no picture. */
  picture: Record<string, unknown> | null;
  /** The positions picture of his first examples (one box per position, ↑, "26 ways"). */
  boxes?: { label: string; ways: number }[];
}
export type ExplainResult = Explained | { ok: false; reason: string; exact?: number };

// ── counting pieces (the same arithmetic the picture checks) ──────────────────

function tally(xs: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** n!/(p!q!…) for a list of keys, with its tex ('' when it is 1). */
export function multiPerm(keys: string[]): { count: number; tex: string } {
  const n = keys.length;
  const reps = [...tally(keys).values()].filter(c => c > 1).sort((a, b) => b - a);
  let c = factorial(n);
  for (const r of reps) c /= factorial(r);
  c = Math.round(c);
  const tex = c > 1 ? (reps.length ? `\\frac{${n}!}{${reps.map(r => `${r}!`).join('\\,')}}` : `${n}!`) : '';
  return { count: c, tex };
}

const times = (xs: string[]) => xs.filter(Boolean).join(' \\times ') || '1';
const unitPc = (u: Unit) => (u.letters.length > 1
  ? { group: u.letters.every(l => l.length === 1) ? u.letters.join('') : u.letters, inner: 'all' }
  : u.letters[0]);

interface Unit { letters: string[]; key: string; inner: { count: number; tex: string } }
const single = (l: string): Unit => ({ letters: [l], key: l, inner: { count: 1, tex: '' } });
const block = (ls: string[]): Unit => ({ letters: ls, key: `[${[...ls].sort().join('')}]`, inner: multiPerm(ls) });

/** Short pc labels: a unit label is at most 3 characters in the picture. */
const fitsPc = (labels: string[]) => labels.every(l => l.length >= 1 && l.length <= 3 && !/[$<>"&\\]/.test(l));

// ── planners ─────────────────────────────────────────────────────────────────

function planBoxes(spec: PcSpec): { cases: Case[]; boxes: { label: string; ways: number }[] } | null {
  if ((spec.rules ?? []).length) return null;
  const pools = spec.positions?.length ? spec.positions : Array.from({ length: spec.r ?? 0 }, () => [...new Set(spec.items)]);
  const repeat = spec.repeat !== false;
  if (!repeat && !pools.every(p => p.join('|') === pools[0].join('|'))) return null;
  const ways = pools.map((p, i) => (repeat ? p.length : p.length - i));
  if (ways.some(w => w <= 0)) return null;
  const labels = pools.map((_, i) => spec.labels?.[i] ?? `${ordinal(i + 1)}`);
  // Runs of equal boxes are written as a power: 26 × 26 × 26 × 26 = 26⁴.
  const parts: string[] = [];
  const pcSteps: Record<string, unknown>[] = [];
  for (let i = 0; i < ways.length;) {
    let j = i;
    while (repeat && j + 1 < ways.length && ways[j + 1] === ways[i]) j++;
    const k = j - i + 1;
    parts.push(k > 1 ? `${ways[i]}^{${k}}` : `${ways[i]}`);
    if (repeat) pcSteps.push({ do: 'choose', n: ways[i], r: 1, times: k, count: ways[i] ** k });
    i = j + 1;
  }
  const total = ways.reduce((a, b) => a * b, 1);
  const product = ways.join(' \\times ');
  const steps: Step[] = [{
    tex: parts.length < ways.length ? `${product} = ${parts.join(' \\times ')}` : product,
    count: total,
    why: repeat ? 'AND → multiply: every position has its full list' : 'AND → multiply: one fewer for each position, no repeats',
    pc: null,
  }];
  if (!repeat) steps[0].pc = { do: 'choose', n: pools[0].length, r: pools.length, arrange: true, count: total };
  const pcOk = repeat ? pcSteps.length <= 4 && pcSteps.every(s => (s.n as number) <= 60 && (s.times as number) <= 6) : pools[0].length <= 60;
  if (repeat && pcOk) steps[0].pc = { __multi: pcSteps };
  if (!pcOk) steps[0].pc = null;
  return { cases: [{ sign: 1, steps }], boxes: labels.map((label, i) => ({ label, ways: ways[i] })) };
}

function ordinal(n: number): string {
  const s = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${s}`;
}

/** A row of all the objects with together / apart / fixed-end rules. */
function planRowRules(items: string[], rules: PcRule[], circle: boolean): Case | null {
  let rest = [...items];
  const fixed: { start?: string; end?: string } = {};
  const blocks: Unit[] = [];
  let apart: string[] | null = null;
  for (const rule of rules) {
    if (rule.t === 'start' || rule.t === 'end') {
      if (circle) return null;
      const i = rest.findIndex(x => baseLabel(x) === rule.item);
      if (i < 0 || fixed[rule.t]) return null;
      fixed[rule.t] = rest[i];
      rest.splice(i, 1);
    }
  }
  for (const rule of rules) {
    if (rule.t === 'together') {
      if (rule.ordered) return null;
      const set = new Set(rule.items);
      const ls = rest.filter(x => set.has(baseLabel(x)));
      if (ls.length < 2) return null;
      rest = rest.filter(x => !set.has(baseLabel(x)));
      blocks.push(block(ls));
    } else if (rule.t === 'apart') {
      if (apart) return null;
      const set = new Set(rule.items);
      apart = rest.filter(x => set.has(baseLabel(x)));
      rest = rest.filter(x => !set.has(baseLabel(x)));
      if (apart.length < 2) return null;
    } else if (rule.t !== 'start' && rule.t !== 'end') return null;
  }
  const units = [...blocks, ...rest.map(single)];
  if (!units.length) return null;
  const steps: Step[] = [];
  const fixedPc = fixed.start || fixed.end ? { fixed: { ...(fixed.start ? { start: fixed.start } : {}), ...(fixed.end ? { end: fixed.end } : {}) } } : {};
  const pcLabelsOk = fitsPc([...units.flatMap(u => u.letters), ...(apart ?? []), ...(fixed.start ? [fixed.start] : []), ...(fixed.end ? [fixed.end] : [])])
    && units.length <= 10 && blocks.every(b => b.letters.length <= 7) && (apart?.length ?? 0) <= 4;

  // Arranging the units (a circle: (u − 1)!, every unit different).
  let rowCount: number, rowTex: string;
  if (circle) {
    if (new Set(units.map(u => u.key)).size !== units.length) return null;
    rowCount = factorial(units.length - 1); rowTex = `(${units.length}-1)!`;
  } else {
    const mp = multiPerm(units.map(u => u.key)); rowCount = mp.count; rowTex = mp.tex;
  }
  const inner = blocks.filter(b => b.inner.count > 1);
  const arrangeCount = inner.reduce((a, b) => a * b.inner.count, rowCount);
  const arrangeTex = times([rowTex, ...inner.map(b => b.inner.tex)]);
  const why = [
    blocks.length ? `group ${blocks.map(b => b.letters.join('')).join(', ')} as ${blocks.length === 1 ? 'one block' : 'blocks'}` : '',
    circle ? `${units.length} units round the table` : `arrange ${units.length} ${apart ? 'others' : 'units'}`,
    inner.length ? 'then arrange inside each block' : '',
    fixed.start || fixed.end ? 'the fixed ends stay put' : '',
  ].filter(Boolean).join('; ');
  if (!apart) {
    steps.push({
      tex: arrangeTex, count: arrangeCount, why,
      pc: pcLabelsOk ? { do: 'arrange', units: units.map(unitPc), ...fixedPc, ...(circle ? { circle: true } : {}), count: arrangeCount } : null,
    });
    return { sign: 1, steps };
  }
  // Slotting (his "Slotting" technique): the others are arranged, the separated ones go into different gaps.
  const g = circle ? units.length : units.length + 1;
  const ip = multiPerm(apart);
  const slotCount = nCr(g, apart.length) * ip.count;
  const slotTex = times([`{}^{${g}}C_{${apart.length}}`, ip.tex]);
  if (blocks.length || circle || !pcLabelsOk) {
    steps.push({ tex: arrangeTex, count: arrangeCount, why, pc: pcLabelsOk ? { do: 'arrange', units: units.map(unitPc), ...fixedPc, ...(circle ? { circle: true } : {}), count: arrangeCount } : null });
    steps.push({
      tex: slotTex, count: slotCount, why: `out of ${g} gaps choose ${apart.length}${ip.count > 1 ? `, then arrange ${apart.join('')}` : ''}`,
      pc: pcLabelsOk ? { do: 'slot', base: 'previous', items: apart, count: slotCount } : null,
    });
  } else {
    // One picture, as in his REARRANGE example: the others in a row with ↓ in every gap.
    const total = arrangeCount * slotCount;
    steps.push({ tex: arrangeTex, count: arrangeCount, why, pc: { __skip: true } });
    steps.push({
      tex: slotTex, count: slotCount, why: `out of ${g} gaps choose ${apart.length}${ip.count > 1 ? `, then arrange ${apart.join('')}` : ''}`,
      pc: { do: 'slot', base: units.map(unitPc), items: apart, arrange_base: true, ...fixedPc, count: total },
    });
  }
  return { sign: 1, steps };
}

function planChoose(spec: PcSpec): Case[] | null {
  if (new Set(spec.items).size !== spec.items.length) return null;
  const r = spec.r ?? spec.items.length;
  let pool = [...spec.items];
  let need = r;
  const groups: { items: string[]; lo: number; hi: number; label: string }[] = [];
  const included: string[] = [];
  for (const rule of spec.rules ?? []) {
    if (rule.t !== 'count') return null;
    const set = new Set(rule.items);
    const mine = pool.filter(x => set.has(x) || set.has(baseLabel(x)));
    if (!mine.length) return null;
    const lo = rule.min ?? 0, hi = Math.min(rule.max ?? mine.length, mine.length);
    if (mine.length === 1 && lo === 1) { included.push(mine[0]); pool = pool.filter(x => x !== mine[0]); need--; continue; }
    if (hi === 0) { pool = pool.filter(x => !mine.includes(x)); continue; }
    groups.push({ items: mine, lo, hi, label: mine.length <= 3 ? mine.join(', ') : `${mine.length}` });
    pool = pool.filter(x => !mine.includes(x));
  }
  if (need < 0) return null;
  const rest = pool;
  const chooseStep = (n: number, k: number, label: string, why: string): Step => ({
    tex: `{}^{${n}}C_{${k}}`, count: nCr(n, k), why, pc: n <= 60 && k >= 1 ? { do: 'choose', n, r: k, ...(label ? { label: label.slice(0, 24) } : {}), count: nCr(n, k) } : null,
  });
  const lead: Step[] = [];
  const incWhy = included.length ? `${included.join(', ')} already in, so choose ${need} more` : '';
  if (!groups.length) {
    const s = chooseStep(rest.length, need, '', incWhy || `choose ${need} of ${rest.length}, order does not matter`);
    return [{ sign: 1, steps: [...lead, s] }];
  }
  // Every way to split `need` between the groups (inside their ranges) and the rest.
  const splits: number[][] = [];
  const rec = (i: number, left: number, acc: number[]) => {
    if (i === groups.length) { if (left >= 0 && left <= rest.length) splits.push([...acc, left]); return; }
    for (let k = groups[i].lo; k <= Math.min(groups[i].hi, left); k++) rec(i + 1, left - k, [...acc, k]);
  };
  rec(0, need, []);
  if (!splits.length || splits.length > 4) return null;
  const groupWord = (gi: number) => `from the ${groups[gi].items.length}`;
  return splits.map((ks, ci) => {
    const steps: Step[] = [];
    ks.forEach((k, gi) => {
      const isRest = gi === groups.length;
      const n = isRest ? rest.length : groups[gi].items.length;
      if (isRest && (n === 0 || k === 0) && steps.length) return;
      if (!isRest && k === 0 && groups[gi].items.length >= 0 && ks.length > 1) return;
      steps.push(chooseStep(n, k, isRest ? 'others' : '', isRest ? `${k} of the other ${n}` : `${k} ${groupWord(gi)}`));
    });
    if (!steps.length) steps.push(chooseStep(rest.length, 0, '', ''));
    return { title: splits.length > 1 ? `Case ${ci + 1}` : undefined, sign: 1 as const, steps };
  });
}

function planSplit(spec: PcSpec): Case | null {
  if (new Set(spec.items).size !== spec.items.length || (spec.rules ?? []).length) return null;
  const sizes = spec.sizes ?? [];
  let left = spec.items.length;
  const parts: string[] = [];
  let c = 1;
  for (const s of sizes) { parts.push(`{}^{${left}}C_{${s}}`); c *= nCr(left, s); left -= s; }
  const same = spec.labelled ? [] : [...tally(sizes.map(String)).values()].filter(k => k > 1);
  let div = 1;
  for (const k of same) div *= factorial(k);
  const tex = div > 1 ? `\\frac{${parts.join(' \\times ')}}{${same.map(k => `${k}!`).join('\\,')}}` : parts.join(' \\times ');
  return {
    sign: 1,
    steps: [{
      tex, count: c / div, pc: null,
      why: div > 1 ? `choose each group in turn; divide by ${same.map(k => `${k}!`).join(' and ')} as the groups of the same size have no names` : 'choose each group in turn',
    }],
  };
}

function plan(spec: PcSpec): { cases: Case[]; boxes?: { label: string; ways: number }[] } | null {
  const n = spec.items.length;
  const rules = spec.rules ?? [];
  switch (spec.mode) {
    case 'boxes': return planBoxes(spec);
    case 'choose': { const c = planChoose(spec); return c ? { cases: c } : null; }
    case 'split': { const c = planSplit(spec); return c ? { cases: [c] } : null; }
    case 'circle': {
      if (new Set(spec.items).size !== n) return null;
      const c = planRowRules(spec.items, rules, true);
      if (!c) return null;
      if (spec.numbered) c.steps.push({ tex: `${n}`, count: n, why: 'the seats are numbered: each seating can be turned to any of the seats', pc: null });
      return { cases: [c] };
    }
    case 'row': {
      const r = spec.r ?? n;
      if (r < n) {
        if (rules.length || new Set(spec.items).size !== n) return null;
        return { cases: [{ sign: 1, steps: [{ tex: `{}^{${n}}P_{${r}}`, count: nPr(n, r), why: `arrange ${r} of the ${n}: order matters`, pc: n <= 60 ? { do: 'choose', n, r, arrange: true, count: nPr(n, r) } : null }] }] };
      }
      if (rules.length === 1 && rules[0].t === 'between') {
        const { a, b, k } = rules[0];
        if (new Set(spec.items).size !== n || a === b) return null;
        const others = n - 2;
        const chooseC = nPr(others, k);
        const unitsLeft = others - k + 1;
        const arrange = factorial(unitsLeft) * 2;
        const blockLetters = [a, ...Array.from({ length: k }, () => '_'), b];
        const rest = spec.items.filter(x => x !== a && x !== b).slice(k).map(String);
        return {
          cases: [{
            sign: 1, steps: [
              { tex: `{}^{${others}}P_{${k}}`, count: chooseC, why: `choose and arrange the ${k} that go between ${a} and ${b}`, pc: others <= 60 ? { do: 'choose', n: others, r: k, arrange: true, label: `between ${a} and ${b}`.slice(0, 24), count: chooseC } : null },
              { tex: `${unitsLeft}! \\times 2!`, count: arrange, why: `the block ${a}…${b} with the other ${unitsLeft - 1}; ${a} and ${b} can swap ends`, pc: blockLetters.length <= 7 && fitsPc(rest) && rest.length + 1 <= 10 ? { do: 'arrange', units: [{ group: blockLetters.join(''), inner: 'ends' }, ...rest], count: arrange } : null },
            ],
          }],
        };
      }
      if (rules.length === 1 && rules[0].t === 'any' && rules[0].rules.length === 2 && rules[0].rules.every(x => x.t === 'start' || x.t === 'end')) {
        const [x, y] = rules[0].rules;
        const one = (rs: PcRule[], title: string, sign: 1 | -1): Case | null => { const c = planRowRules(spec.items, rs, false); return c ? { ...c, title, sign } : null; };
        const c1 = one([x], cap(ruleTitle(x)), 1), c2 = one([y], cap(ruleTitle(y)), 1), c3 = x.t !== y.t ? one([x, y], 'Both', -1) : null;
        if (!c1 || !c2 || !c3) return null;
        return { cases: [c1, c2, c3] };
      }
      const c = planRowRules(spec.items, rules, false);
      return c ? { cases: [c] } : null;
    }
  }
}

const ruleTitle = (r: PcRule) => (r.t === 'start' ? `start with ${r.item}` : r.t === 'end' ? `end with ${r.item}` : '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── the pc_arrange picture ───────────────────────────────────────────────────

function pcSpecOf(cases: Case[], total: number): Record<string, unknown> | null {
  const pcCases: Record<string, unknown>[] = [];
  for (const c of cases) {
    const steps: Record<string, unknown>[] = [];
    for (const s of c.steps) {
      if (!s.pc) return null;
      if ((s.pc as { __skip?: boolean }).__skip) continue;
      if (Array.isArray((s.pc as { __multi?: unknown }).__multi)) steps.push(...((s.pc as { __multi: Record<string, unknown>[] }).__multi));
      else steps.push(s.pc);
    }
    if (!steps.length || steps.length > 4) return null;
    const cnt = c.steps.reduce((a, s) => a * s.count, 1);
    pcCases.push({ ...(c.title ? { title: c.title } : {}), ...(c.sign < 0 ? { sign: '-' } : {}), steps, count: cnt });
  }
  if (!pcCases.length || pcCases.length > 4) return null;
  return pcCases.length === 1 && !(cases[0].title)
    ? { kind: 'pc_arrange', steps: pcCases[0].steps, total }
    : { kind: 'pc_arrange', cases: pcCases, total };
}

// ── explain ──────────────────────────────────────────────────────────────────

/** The method for a spec, checked against the exact count. */
export function explain(spec: PcSpec): ExplainResult {
  const exact = count(spec);
  const p = plan(spec);
  if (!p) return { ok: false, reason: 'No method picture for this kind of question yet.', ...(exact.ok ? { exact: exact.count } : {}) };
  const caseCount = (c: Case) => c.steps.reduce((a, s) => a * s.count, 1);
  const total = p.cases.reduce((a, c) => a + c.sign * caseCount(c), 0);
  if (exact.ok && exact.count !== total) {
    // Fail closed: a method that does not give the exact count is never shown.
    return { ok: false, reason: `The method gives ${total} but the exact count is ${exact.count}.`, exact: exact.count };
  }
  const lines: ExplainLine[] = [];
  const multi = p.cases.length > 1;
  for (const c of p.cases) {
    const cc = caseCount(c);
    if (multi) lines.push({ tex: `\\text{${c.title ?? 'Case'}: } ${times(c.steps.map(s => s.tex))} = ${cc}`, why: c.steps.map(s => s.why).filter(Boolean).join('; ') || undefined });
    else for (const s of c.steps) lines.push({ tex: `${s.tex} = ${s.count}`, why: s.why });
  }
  if (multi) {
    lines.push({ tex: `\\text{Total} = ${p.cases.map((c, i) => `${i === 0 ? '' : c.sign < 0 ? '- ' : '+ '}${caseCount(c)}`).join(' ')} = ${total}`, why: p.cases.some(c => c.sign < 0) ? 'take away the ones counted in both' : 'OR → add the cases' });
  } else if (p.cases[0].steps.length > 1) {
    lines.push({ tex: `\\text{Total} = ${times(p.cases[0].steps.map(s => s.tex))} = ${total}`, why: 'AND → multiply' });
  }
  return {
    ok: true, lines, total, checked: exact.ok,
    picture: pcSpecOf(p.cases, total),
    ...(p.boxes ? { boxes: p.boxes } : {}),
  };
}
