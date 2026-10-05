// ▶ Watch it — an animated solution for ONE science MCQ (5 Oct 2026, Adrian:
// "build the watch it animations for kinematics and chemical calculations …
// gate keep it to me"). The same player and chalk board as the one-minute
// explanation (lib/explain-clip): a page that plays, never a rendered video.
//
// A clip is written ONCE per question as a small SPEC (data/watch-it/*.json,
// authored by plan-billed agents from the question's own worked solution) and
// turned into a LessonScript here, at request time:
//   · graph — a speed–time / distance–time graph drawn from the question's
//     numbers (the `motion-graph` scene): segments drawn on, the gradient's
//     triangle, the area under it filled with its value, the working under it.
//   · moles — the chemical equation with the ratio boxed, and the chain
//     mass → moles → ratio → moles → mass/volume written step by step, a road
//     map along the top lighting up as each stop is reached.
//
// The clip never says anything the written solution does not: `checkWatchSpec`
// refuses a spec whose numbers (board lines, spoken lines, labels, the graph's
// points) do not come from the question or its solution — or from arithmetic
// the spec declares and this module re-does — and whose answer is not the
// bank's letter and that option's own value. Pure: no I/O.

import { validateLessonScript, type Beat, type BeatAction, type CharacterPose, type EquationStep, type EquationStepsScene, type GraphPiece, type LessonScript, type MotionGraphScene, type StepToken } from './lesson-script';
import { mcqKey } from './science-levels';

// ── The spec ─────────────────────────────────────────────────────────────────

export const WATCH_STAGES = ['mass', 'mr', 'moles', 'ratio', 'volume', 'concentration', 'percent', 'other'] as const;
export type WatchStage = (typeof WATCH_STAGES)[number];

/** Arithmetic a line claims — re-done by the checker. `expr` uses + - * / ^ ( ) and numbers only. */
export interface WatchCheck { expr: string; value: number }

export interface WatchLine {
  /** The board line — bare KaTeX (no dollars). */
  tex: string;
  /** chem: the chain stop this line reaches (lights the road map). `mr` / `other` light nothing. */
  stage?: WatchStage;
  /** A short note under the line, from the solution (inline `$…$` allowed). */
  why?: string;
  check?: WatchCheck[];
}

export interface WatchBeat {
  /** Spoken, plain English, no TeX — one idea. */
  say: string;
  /** graph: pieces shown in this beat, in order. */
  piece?: number[];
  /** A working line written in this beat. */
  line?: WatchLine;
  /** moles: box these two species of the equation (indices over lhs then rhs). */
  ratio?: [number, number];
}

export interface WatchSpecies { coef: number; tex: string }

interface WatchBase {
  qid: string;
  topic: string;
  /** The MCQ letter — must be the bank's answer. */
  answer: string;
  /** The answer's value as KaTeX ("30.3\\ \\text{g}") — must be that option's own number. */
  answerText: string;
  /** Heading on the board (one short line). */
  heading: string;
  /** Numbers the clip needs that the text does not print (a unit conversion …), each with its arithmetic. */
  derived?: WatchCheck[];
  /** Values PRINTED on the question's own figure (a graph's labelled times and speeds) — only
   *  for a question that has one; the author read them off the image. */
  figure?: number[];
  beats: WatchBeat[];
}

export interface GraphWatch extends WatchBase {
  kind: 'graph';
  xLabel: string;
  yLabel: string;
  points: [number, number][];
  pieces: GraphPiece[];
}

export interface MolesWatch extends WatchBase {
  kind: 'moles';
  /** The quantity the question gives (the road map's first stop): mass, volume, concentration … */
  start?: WatchStage;
  equation?: { lhs: WatchSpecies[]; rhs: WatchSpecies[] };
}

export type WatchSpec = GraphWatch | MolesWatch;

/** What the checker needs of the bank row. */
export interface WatchSource { question_text: string; solution: string | null; answer: string | null; image?: string | null }

// ── Arithmetic (a tiny, safe evaluator) ──────────────────────────────────────

/** + - * / ^ and parentheses over decimal numbers; null on anything else. */
export function evalArith(expr: string): number | null {
  const src = String(expr ?? '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  if (!src || !/^[0-9.+\-*/^()eE]+$/.test(src)) return null;
  let i = 0;
  const peek = () => src[i];
  const num = (): number | null => {
    const m = /^(\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const atom = (): number | null => {
    if (peek() === '(') { i++; const v = sum(); if (peek() !== ')') return null; i++; return v; }
    if (peek() === '-') { i++; const v = power(); return v === null ? null : -v; }
    if (peek() === '+') { i++; return power(); }
    return num();
  };
  const power = (): number | null => {
    const b = atom();
    if (b === null) return null;
    if (peek() === '^') { i++; const e = power(); return e === null ? null : Math.pow(b, e); }
    return b;
  };
  const product = (): number | null => {
    let v = power();
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = src[i++]; const r = power();
      if (r === null) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  function sum(): number | null {
    let v = product();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = src[i++]; const r = product();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const v = sum();
  return v !== null && i === src.length && Number.isFinite(v) ? v : null;
}

/** Half a unit in the last written place of `n` — how far a rounded value may sit from the exact one. */
function halfUlp(text: string): number {
  const d = /\.(\d+)/.exec(text)?.[1]?.length ?? 0;
  return 0.5 * Math.pow(10, -d);
}

/** Two numbers agree when either, rounded as written, is the other. */
export function sameNumber(a: number, aText: string, b: number, bText: string): boolean {
  const tol = Math.max(halfUlp(aText), halfUlp(bText)) * 1.0001 + 1e-9 * Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= tol;
}

// ── Reading numbers out of text ──────────────────────────────────────────────

/**
 * The numbers a reader SEES in a line of text / TeX: subscripts and powers
 * (CO₂, cm³, m/s², 10⁻³ exponents) are not values and are dropped, as are
 * thousands commas; `\frac{a}{b}` reads as a and b.
 */
export function numbersIn(text: string): { value: number; text: string }[] {
  let t = String(text ?? '');
  t = t.replace(/[₀-₉⁰-⁹]/g, ' ')
    .replace(/_\s*\{[^{}]*\}/g, ' ').replace(/_\s*\d/g, ' ')
    .replace(/\^\s*\{[^{}]*\}/g, ' ').replace(/\^\s*-?\d/g, ' ')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    .replace(/\\[a-zA-Z]+/g, ' ');
  // A chemical formula's atom counts (H2O, C2H4, (NH4)2SO4, CF2Cl2) are not values either.
  t = t.replace(/([A-Z][a-z]?|\))\d+/g, '$1 ');
  const out: { value: number; text: string }[] = [];
  for (const m of t.matchAll(/\d+(?:\.\d+)?|\.\d+/g)) out.push({ value: Number(m[0]), text: m[0] });
  return out;
}

/** The option text of one MCQ letter ("A) 3.0 km", "**B**  9.8 m", "| B | …"). */
export function optionText(question: string, letter: string): string | null {
  const L = letter.toUpperCase();
  for (const raw of String(question ?? '').split('\n')) {
    const line = raw.trim();
    const m = new RegExp(`^(?:\\*\\*\\(?${L}\\)?\\*\\*|\\(?${L}\\)|${L}[.):]|\\|\\s*${L}\\s*\\|)\\s*(.*)$`).exec(line);
    if (m) return m[1];
  }
  // Options on one line: "A) 25 m  B) 50 m  C) 125 m  D) 250 m".
  const inline = new RegExp(`(?:^|\\s)\\(?${L}\\)\\s*(.+?)(?=\\s+\\(?[A-D]\\)\\s|\\n|$)`).exec(String(question ?? ''));
  return inline ? inline[1].trim() : null;
}

/** Constants a clip may use without the text printing them (unit conversions, the molar volume, a half). */
const FREE_NUMBERS = [0, 1, 2, 100, 1000, 60, 3600, 24, 24000, 22.4, 22400, 10, 0.5];

const TEX_LIKE = /[$\\^_{}]/;

/** Area under the points from..to down to y = 0 (trapezia; a crossing below 0 counts negative — the spec should split there). */
export function areaUnder(points: [number, number][], from: number, to: number): number {
  let a = 0;
  for (let k = from; k < to; k++) a += ((points[k + 1][0] - points[k][0]) * (points[k][1] + points[k + 1][1])) / 2;
  return a;
}

export function gradient(points: [number, number][], from: number, to: number): number {
  return (points[to][1] - points[from][1]) / (points[to][0] - points[from][0]);
}

// ── The checker ──────────────────────────────────────────────────────────────

/**
 * Every reason the spec may not ship (empty = it may). Run by the authoring
 * script after every write and by the store's test over the committed files.
 */
export function checkWatchSpec(spec: WatchSpec, src: WatchSource): string[] {
  const errors: string[] = [];
  const key = mcqKey(src.answer);
  if (!key) errors.push('the bank row is not an MCQ (no answer letter)');
  else if (String(spec.answer).trim().toUpperCase() !== key) errors.push(`answer ${spec.answer} is not the bank's ${key}`);

  // The numbers the clip may show: the question's, the solution's, and arithmetic re-done here.
  const allowed: { value: number; text: string }[] = [
    ...numbersIn(src.question_text), ...numbersIn(src.solution ?? ''),
    ...FREE_NUMBERS.map(v => ({ value: v, text: String(v) })),
  ];
  const checks = (list: WatchCheck[] | undefined, where: string) => {
    for (const c of list ?? []) {
      const v = evalArith(c.expr);
      if (v === null) { errors.push(`${where}: cannot evaluate "${c.expr}"`); continue; }
      if (typeof c.value !== 'number' || !Number.isFinite(c.value)) { errors.push(`${where}: check value must be a number`); continue; }
      if (!sameNumber(v, String(v), c.value, String(c.value))) errors.push(`${where}: ${c.expr} = ${+v.toPrecision(8)}, not ${c.value}`);
      for (const n of numbersIn(c.expr)) if (!known(n)) errors.push(`${where}: ${n.text} in "${c.expr}" is not in the question or solution`);
      allowed.push({ value: c.value, text: String(c.value) }, { value: v, text: String(+v.toPrecision(10)) });
    }
  };
  const known = (n: { value: number; text: string }) => allowed.some(a => sameNumber(a.value, a.text, n.value, n.text));
  const needKnown = (text: string | undefined, where: string) => {
    for (const n of numbersIn(text ?? '')) if (!known(n)) errors.push(`${where}: ${n.text} is not in the question, the solution or a declared check`);
  };

  if (spec.figure?.length) {
    if (!src.image) errors.push('figure values on a question with no figure');
    else for (const v of spec.figure) allowed.push({ value: v, text: String(v) });
  }
  checks(spec.derived, 'derived');
  spec.beats.forEach((b, i) => checks(b.line?.check, `beats[${i}].line.check`));

  if (spec.kind === 'graph') {
    const n = spec.points?.length ?? 0;
    if (n < 2) errors.push('a graph needs at least two points');
    spec.points?.forEach((p, i) => { for (const v of p) needKnown(String(v), `points[${i}]`); });
    spec.pieces?.forEach((pc, i) => {
      const to = pc.to ?? pc.from;
      if (pc.from < 0 || pc.from >= n || to >= n || (pc.kind !== 'value' && to <= pc.from)) { errors.push(`pieces[${i}]: bad point indices`); return; }
      if (pc.kind === 'area') {
        const a = areaUnder(spec.points, pc.from, to);
        allowed.push({ value: a, text: String(+a.toPrecision(10)) });
        if (spec.points.slice(pc.from, to + 1).some(p => p[1] < 0)) errors.push(`pieces[${i}]: an area below the axis — split it`);
      }
      if (pc.kind === 'slope') { const g = gradient(spec.points, pc.from, to); allowed.push({ value: Math.abs(g), text: String(+Math.abs(g).toPrecision(10)) }); }
    });
    spec.pieces?.forEach((pc, i) => needKnown(pc.label, `pieces[${i}].label`));
    const shown = new Set<number>();
    spec.beats.forEach((b, i) => (b.piece ?? []).forEach(k => {
      if (k < 0 || k >= (spec.pieces?.length ?? 0)) errors.push(`beats[${i}]: piece ${k} does not exist`);
      shown.add(k);
    }));
    spec.pieces?.forEach((_, k) => { if (!shown.has(k)) errors.push(`pieces[${k}] is never shown by a beat`); });
  } else {
    const species = [...(spec.equation?.lhs ?? []), ...(spec.equation?.rhs ?? [])];
    spec.beats.forEach((b, i) => {
      if (b.ratio && (!spec.equation || b.ratio.some(k => k < 0 || k >= species.length) || b.ratio[0] === b.ratio[1])) errors.push(`beats[${i}]: ratio names species that are not in the equation`);
    });
    for (const sp of species) if (!Number.isInteger(sp.coef) || sp.coef < 1) errors.push(`equation: coefficient ${sp.coef} must be a positive whole number`);
  }

  spec.beats.forEach((b, i) => {
    if (!b.say || !b.say.trim()) errors.push(`beats[${i}]: say is empty`);
    else if (TEX_LIKE.test(b.say)) errors.push(`beats[${i}]: say carries TeX — spell it out`);
    else if (b.say.length > 220) errors.push(`beats[${i}]: say is ${b.say.length} chars (≤ 220)`);
    needKnown(b.say, `beats[${i}].say`);
    if (b.line) { needKnown(b.line.tex, `beats[${i}].line.tex`); needKnown(b.line.why, `beats[${i}].line.why`); }
    if (b.line?.stage && !(WATCH_STAGES as readonly string[]).includes(b.line.stage)) errors.push(`beats[${i}]: stage "${b.line.stage}" is not one of ${WATCH_STAGES.join('/')}`);
  });
  if (!spec.beats.some(b => b.line)) errors.push('no working line — a clip carries the working');

  // The answer's value is the option's own number.
  if (key) {
    const opt = optionText(src.question_text, key);
    const want = numbersIn(spec.answerText);
    if (opt !== null && want.length) {
      const have = numbersIn(opt);
      for (const n of want) if (!have.some(h => sameNumber(h.value, h.text, n.value, n.text))) errors.push(`answerText ${n.text} is not in option ${key} ("${opt.slice(0, 60)}")`);
    }
  }
  needKnown(spec.heading, 'heading');

  if (!errors.length) {
    const v = validateLessonScript(buildWatchScript(spec));
    if (!v.ok) errors.push(...v.errors.map(e => `script: ${e}`));
  }
  return errors;
}

// ── The script ───────────────────────────────────────────────────────────────

const pose = (p: CharacterPose, at: number): BeatAction => ({ do: 'character', pose: p, at });

const line = (tex: string, id: string, note?: string, hl?: StepToken['hl']): EquationStep => {
  const t: StepToken = { tex, id };
  if (hl) t.hl = hl;
  return note ? { tokens: [t], note } : { tokens: [t] };
};

function answerLine(spec: WatchSpec): string {
  return `\\textbf{Answer: ${spec.answer.toUpperCase()}}\\;\\; ${spec.answerText}`;
}

function graphScene(spec: GraphWatch): MotionGraphScene {
  const steps: EquationStep[] = [];
  const beats: Beat[] = [];
  let lines = 0;
  spec.beats.forEach((b, i) => {
    const doList: BeatAction[] = [pose(i === 0 ? 'point' : b.line ? 'think' : 'point', 0.02)];
    (b.piece ?? []).forEach((k, j) => doList.push({ do: 'write', piece: k, at: Math.min(0.85, 0.08 + j * 0.25) }));
    if (b.line) {
      const id = `w${lines}`;
      steps.push(line(b.line.tex, id, b.line.why));
      doList.push({ do: 'write', step: lines, at: (b.piece?.length ? 0.45 : 0.1) });
      lines++;
    }
    beats.push({ say: b.say, do: doList });
  });
  steps.push(line(answerLine(spec), 'ans', undefined, 'emerald'));
  beats.push({ say: `So the answer is ${spec.answer.toUpperCase()}.`, do: [pose('cheer', 0.05), { do: 'write', step: lines, at: 0.15 }, { do: 'sticker', kind: 'confetti', at: 0.3 }] });
  return { type: 'motion-graph', heading: spec.heading, xLabel: spec.xLabel, yLabel: spec.yLabel, points: spec.points, pieces: spec.pieces, steps, beats };
}

/** The road map's stops: the given quantity, then each line's stop in order (consecutive repeats
 *  folded), with a second "moles" after the first when the equation's ratio is used — the ratio
 *  is the arrow between them. */
export function roadStops(spec: MolesWatch): WatchStage[] {
  const out: WatchStage[] = spec.start ? [spec.start] : [];
  for (const b of spec.beats) {
    const s = b.line?.stage;
    if (!s || s === 'mr' || s === 'other' || s === 'ratio') continue;
    if (out[out.length - 1] !== s) out.push(s);
  }
  // The ratio is the arrow between two "moles" stops: mass → moles →(ratio)→ moles → mass.
  if (spec.beats.some(b => b.ratio || b.line?.stage === 'ratio')) {
    const i = out.indexOf('moles');
    if (i >= 0 && out[i + 1] !== 'moles') out.splice(i + 1, 0, 'moles');
  }
  return out;
}

const STOP_TEX: Record<WatchStage, string> = {
  mass: '\\text{mass}', mr: 'M_r', moles: '\\text{moles}', ratio: '\\text{ratio}', volume: '\\text{volume}',
  concentration: '\\text{concentration}', percent: '\\text{percentage}', other: '\\text{…}',
};
/** The arrow between two stops, with what it does on it. */
function arrowTex(a: WatchStage, b: WatchStage): string {
  const on = a === 'mass' && b === 'moles' ? '\\div M_r'
    : a === 'moles' && b === 'mass' ? '\\times M_r'
    : a === 'volume' && b === 'moles' ? '\\div 24'
    : a === 'moles' && b === 'volume' ? '\\times 24'
    : a === 'concentration' && b === 'moles' ? '\\times V'
    : a === 'moles' && b === 'concentration' ? '\\div V'
    : a === 'moles' && b === 'moles' ? '\\text{ratio}'
    : '';
  return on ? `\\xrightarrow{${on}}` : '\\to';
}

function molesScene(spec: MolesWatch): EquationStepsScene {
  const steps: EquationStep[] = [];
  const beats: Beat[] = [];
  const eq = spec.equation;
  const species = eq ? [...eq.lhs, ...eq.rhs] : [];
  // Line 0: the equation, one token per species so the ratio can be boxed.
  let eqLine = -1;
  if (eq) {
    const tokens: StepToken[] = [];
    const side = (list: WatchSpecies[], offset: number) => list.forEach((sp, k) => {
      if (k) tokens.push({ tex: '+' });
      tokens.push({ tex: `${sp.coef > 1 ? `${sp.coef}\\,` : ''}${sp.tex}`, id: `e${offset + k}` });
    });
    side(eq.lhs, 0);
    tokens.push({ tex: '\\longrightarrow' });
    side(eq.rhs, eq.lhs.length);
    steps.push({ tokens });
    eqLine = 0;
  }
  // The road map: one token per stop and per arrow, each written when the chain reaches it.
  const stops = roadStops(spec);
  const road: StepToken[] = [];
  stops.forEach((s, k) => {
    if (k) road.push({ tex: `\\footnotesize ${arrowTex(stops[k - 1], s)}`, id: `a${k}` });
    road.push({ tex: `\\footnotesize ${STOP_TEX[s]}`, id: `r${k}`, hl: 'sky' });
  });
  if (road.length) steps.push({ tokens: road });
  let reached = -1;
  /** Light the road up to the next stop of this kind (a ratio step lights "ratio" and the moles after it). */
  const reach = (stage: WatchStage | undefined, isRatio: boolean): BeatAction[] => {
    const kind = isRatio ? 'moles' : stage;
    if (!road.length || !kind || kind === 'mr' || kind === 'other' || kind === 'ratio') return [];
    // a ratio step always moves on to the NEXT moles stop; any other line stays when its stop is lit
    if (!isRatio && reached >= 0 && stops[reached] === kind) return [];
    const target = stops.indexOf(kind, reached + 1);
    if (target < 0) return [];
    const out: BeatAction[] = [];
    for (let k = reached + 1; k <= target; k++) {
      if (k) out.push({ do: 'write', token: `a${k}`, at: 0.05 + 0.04 * (k - reached - 1) });
      out.push({ do: 'write', token: `r${k}`, at: 0.08 + 0.04 * (k - reached - 1) });
    }
    reached = target;
    out.push({ do: 'highlight', token: `r${target}`, at: 0.35 });
    return out;
  };

  let lines = 0;
  const firstLine = steps.length;
  spec.beats.forEach((b, i) => {
    const doList: BeatAction[] = [];
    if (i === 0) {
      doList.push(pose('point', 0.02));
      if (eqLine >= 0) doList.push({ do: 'write', step: eqLine, at: 0.05 });
      if (road.length) { doList.push({ do: 'write', token: 'r0', at: 0.08 }); reached = 0; }
    } else doList.push(pose(b.ratio ? 'think' : 'nod', 0.02));
    if (b.ratio) {
      doList.push({ do: 'mark', kind: 'box', token: `e${b.ratio[0]}`, at: 0.18 }, { do: 'mark', kind: 'box', token: `e${b.ratio[1]}`, at: 0.24 });
      const [p, q] = b.ratio.map(k => species[k]);
      if (p && q) doList.push({ do: 'note', text: `${p.coef} : ${q.coef}`, near: `e${b.ratio[1]}`, at: 0.3 });
    }
    doList.push(...reach(b.line?.stage, !!b.ratio || b.line?.stage === 'ratio'));
    if (b.line) {
      // The road map says what each step does, so a chem line carries no note of its own
      // (a short board beats a crowded one); only a step off the road keeps its why.
      steps.push(line(b.line.tex, `w${lines}`, b.line.stage === 'other' ? b.line.why : undefined));
      doList.push({ do: 'write', step: firstLine + lines, at: 0.4 });
      lines++;
    }
    // listed order must not run backwards in `at`
    doList.sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
    beats.push({ say: b.say, do: doList });
  });
  steps.push(line(answerLine(spec), 'ans', undefined, 'emerald'));
  beats.push({ say: `So the answer is ${spec.answer.toUpperCase()}.`, do: [pose('cheer', 0.05), { do: 'write', step: firstLine + lines, at: 0.15 }, { do: 'sticker', kind: 'confetti', at: 0.3 }] });
  return { type: 'equation-steps', heading: spec.heading, steps, beats };
}

/** The clip for one spec — a one-scene chalk lesson the player plays like the explain clip. */
export function buildWatchScript(spec: WatchSpec): LessonScript {
  const scene = spec.kind === 'graph' ? graphScene(spec) : molesScene(spec);
  return {
    slug: `watch-${spec.qid.slice(0, 8).toLowerCase()}`,
    title: spec.topic,
    level: spec.kind === 'graph' ? 'PHYS' : 'CHEM',
    topic: spec.topic,
    minutes: 1,
    theme: 'chalk',
    character: 'tutor-picture',
    scenes: [scene],
  };
}
