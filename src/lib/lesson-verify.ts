// Deterministic verification for animated-lesson scripts (data/lessons/*.json)
// — the pure half of scripts/lessons/verify-lesson.mjs, the phase-2 authoring
// gate. Everything here is a judgement that needs no I/O: which TeX must
// render, which numbers the author asserted and whether they hold, whether a
// graph morph's window actually shows its curves, and the craft rules the
// Binomial pilot established (short token lines, teach before checking, close
// on a caption). The script supplies KaTeX and the bank rows; the tests
// exercise every rule directly.
//
// Author-side `verify` lists (ignored by the validator and the player) carry
// the numeric claims a lesson makes, so "C(5,3)·2²·3³ = 1080" is machine
// checked instead of eyeballed:
//
//   "verify": [
//     { "expr": "C(5,3) * 2^2 * 3^3", "equals": 1080 },
//     { "expr": "-3(x-2)^2 + 8", "equiv": "-3x^2 + 12x - 4" },      // identity in x
//     { "expr": "(x-2)^2 - 4", "state": 2 }                        // graph-morph: = states[2]
//   ]
//
// Expressions are plain arithmetic (never TeX): + - * / ^ (or **), brackets,
// implicit multiplication (2x, 3(x-2)), sqrt/abs/C/choose/nCr/fact/min/max,
// pi. They go through evalExpr's own parser — nothing is ever eval'd.

import type { LessonScript, Scene, GraphMorphScene, CheckScene } from './lesson-script';
import { getTopicsForPaperLevel } from './canonical-topics';
import { usableCheckAnswer, type CheckQuestionRow } from './lesson-load';
import { practiceEligibility } from './portal-find';
import { checkTypedAnswer, normalizeAnswer, asNumber, asPoint, stripLead } from './notebook';

export type Severity = 'error' | 'warn' | 'info';
export interface Issue { severity: Severity; where: string; message: string }

const issue = (severity: Severity, where: string, message: string): Issue => ({ severity, where, message });

// ── TeX units ────────────────────────────────────────────────────────────────

export interface TexUnit { where: string; tex: string; display: boolean }

/**
 * The `$…$` / `$$…$$` fragments of a prose string, in order, plus whether a
 * dollar was left unclosed (the player would render the rest of the line as
 * math). `\$` is a literal dollar, not a delimiter.
 */
export function mathFragments(text: string): { fragments: { tex: string; display: boolean }[]; unclosed: boolean } {
  const fragments: { tex: string; display: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch !== '$') { i += 1; continue; }
    const display = text.startsWith('$$', i);
    const open = display ? '$$' : '$';
    const start = i + open.length;
    let j = start;
    let closed = -1;
    while (j < text.length) {
      if (text[j] === '\\') { j += 2; continue; }
      if (text.startsWith(open, j)) { closed = j; break; }
      j += 1;
    }
    if (closed === -1) return { fragments, unclosed: true };
    fragments.push({ tex: text.slice(start, closed), display });
    i = closed + open.length;
  }
  return { fragments, unclosed: false };
}

/**
 * Every KaTeX render the player will attempt for this script: bare token
 * `tex` (rendered directly) and the `$…$` fragments of every MathText/markdown
 * field. Fields the player prints as PLAIN text (lesson title, scene titles
 * and headings, placeholders, axis labels) are deliberately not here — see
 * craftIssues, which flags a `$` in those.
 */
export function texUnits(script: LessonScript): { units: TexUnit[]; issues: Issue[] } {
  const units: TexUnit[] = [];
  const issues: Issue[] = [];
  const prose = (where: string, text: string | undefined) => {
    if (!text) return;
    const { fragments, unclosed } = mathFragments(text);
    if (unclosed) issues.push(issue('error', where, 'unclosed $ — everything after it would render as math'));
    fragments.forEach((f, k) => units.push({ where: `${where} $${k + 1}`, tex: f.tex, display: f.display }));
  };
  const bare = (where: string, tex: string) => units.push({ where, tex, display: false });

  script.scenes.forEach((s, i) => {
    const at = `scenes[${i}] (${s.type})`;
    switch (s.type) {
      case 'title':
        prose(`${at}.promise`, s.promise);
        break;
      case 'caption':
        prose(`${at}.text`, s.text);
        break;
      case 'equation-steps':
        prose(`${at}.intro`, s.intro);
        s.steps.forEach((st, si) => {
          st.tokens.forEach((t, ti) => bare(`${at}.steps[${si}].tokens[${ti}]`, t.tex));
          prose(`${at}.steps[${si}].note`, st.note);
        });
        break;
      case 'graph-morph':
        prose(`${at}.caption`, s.caption);
        s.states.forEach((st, si) => prose(`${at}.states[${si}].label`, st.label));
        break;
      case 'annotate':
        prose(`${at}.intro`, s.intro);
        s.tokens.forEach((t, ti) => bare(`${at}.tokens[${ti}]`, t.tex));
        s.callouts.forEach((c, ci) => prose(`${at}.callouts[${ci}].label`, c.label));
        break;
      case 'check':
        prose(`${at}.prompt`, s.prompt);
        prose(`${at}.why`, s.why);
        break;
    }
  });
  return { units, issues };
}

// ── Safe arithmetic evaluator ────────────────────────────────────────────────

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    const num = src.slice(i).match(/^(\d+(?:\.\d+)?|\.\d+)/);
    if (num) {
      const after = src[i + num[0].length];
      if (after !== undefined && /[\d.]/.test(after)) throw new Error(`malformed number at ${i}`);
      toks.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) { toks.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    if (src.startsWith('**', i)) { toks.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/^(),'.includes(c)) { toks.push({ t: 'op', v: c }); i += 1; continue; }
    if (c === '×' || c === '·') { toks.push({ t: 'op', v: '*' }); i += 1; continue; }
    if (c === '−') { toks.push({ t: 'op', v: '-' }); i += 1; continue; }
    if (c === '÷') { toks.push({ t: 'op', v: '/' }); i += 1; continue; }
    throw new Error(`unexpected "${c}" at ${i}`);
  }
  return toks;
}

function binomial(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
    throw new Error(`C(${n},${r}) needs integers with 0 ≤ r ≤ n`);
  }
  let out = 1;
  for (let k = 1; k <= Math.min(r, n - r); k++) out = (out * (n - Math.min(r, n - r) + k)) / k;
  return Math.round(out);
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error(`fact(${n}) out of range`);
  let out = 1;
  for (let k = 2; k <= n; k++) out *= k;
  return out;
}

const FUNCS: Record<string, (args: number[]) => number> = {
  sqrt: ([a]) => Math.sqrt(a),
  abs: ([a]) => Math.abs(a),
  C: ([n, r]) => binomial(n, r),
  choose: ([n, r]) => binomial(n, r),
  nCr: ([n, r]) => binomial(n, r),
  fact: ([n]) => factorial(n),
  min: (xs) => Math.min(...xs),
  max: (xs) => Math.max(...xs),
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/**
 * Evaluate plain arithmetic with an explicit grammar — never eval. Unary minus
 * binds looser than ^ (so -2^2 = -4, as on paper); ^ is right-associative;
 * juxtaposition multiplies (2x, 3(x-1), (x+1)(x-1)). Throws on anything else.
 */
export function evalExpr(expr: string, env: Record<string, number> = {}): number {
  const toks = tokenize(expr);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = peek(); return t !== undefined && t.t === 'op' && t.v === v; };
  const take = (v: string) => { if (!isOp(v)) throw new Error(`expected "${v}"`); p += 1; };

  function parseExpr(): number {
    let v = parseTerm();
    while (isOp('+') || isOp('-')) {
      const op = (peek() as { v: string }).v; p += 1;
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function startsFactor(): boolean {
    const t = peek();
    return t !== undefined && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '('));
  }
  function parseTerm(): number {
    let v = parseUnary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = (peek() as { v: string }).v; p += 1;
        const r = parseUnary();
        v = op === '*' ? v * r : v / r;
      } else if (startsFactor()) {
        v *= parsePower(); // implicit multiplication — never swallows a leading sign
      } else return v;
    }
  }
  function parseUnary(): number {
    if (isOp('-')) { p += 1; return -parseUnary(); }
    if (isOp('+')) { p += 1; return parseUnary(); }
    return parsePower();
  }
  function parsePower(): number {
    const base = parseAtom();
    if (isOp('^')) { p += 1; return base ** parseUnary(); }
    return base;
  }
  function parseAtom(): number {
    const t = peek();
    if (t === undefined) throw new Error('unexpected end of expression');
    if (t.t === 'num') { p += 1; return t.v; }
    if (t.t === 'id') {
      p += 1;
      if (isOp('(')) {
        const fn = FUNCS[t.v];
        if (!fn) throw new Error(`unknown function "${t.v}"`);
        p += 1;
        const args: number[] = [];
        if (!isOp(')')) {
          args.push(parseExpr());
          while (isOp(',')) { p += 1; args.push(parseExpr()); }
        }
        take(')');
        return fn(args);
      }
      if (t.v in env) return env[t.v];
      if (t.v in CONSTS) return CONSTS[t.v];
      throw new Error(`unknown symbol "${t.v}"`);
    }
    if (t.t === 'op' && t.v === '(') {
      p += 1;
      const v = parseExpr();
      take(')');
      return v;
    }
    throw new Error(`unexpected "${t.v}"`);
  }

  const value = parseExpr();
  if (p !== toks.length) throw new Error(`unexpected "${(toks[p] as { v: unknown }).v}" after expression`);
  return value;
}

/** y = Σ coeffs[i]·x^i — the player's polynomial convention (constant first). */
export function polyAt(coeffs: number[], x: number): number {
  let y = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) y = y * x + coeffs[i];
  return y;
}

/** Sample points for identity checks — mixed signs, halves, and a few large x. */
export const SAMPLE_POINTS = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5.5, 7];

export function numbersClose(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Two single-variable expressions agree at every sample point where both are
 * finite (a division by zero at one point is skipped, not failed). Polynomials
 * and rational expressions that agree at 16 points are the same expression.
 */
export function sampledEqual(
  lhs: (x: number) => number, rhs: (x: number) => number,
): { ok: boolean; detail: string } {
  let valid = 0;
  for (const x of SAMPLE_POINTS) {
    let a: number, b: number;
    try { a = lhs(x); b = rhs(x); } catch (e) { return { ok: false, detail: `at x=${x}: ${(e as Error).message}` }; }
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    valid += 1;
    if (!numbersClose(a, b)) return { ok: false, detail: `differs at x=${x}: ${a} vs ${b}` };
  }
  if (valid < 6) return { ok: false, detail: `only ${valid} finite sample points — not enough to compare` };
  return { ok: true, detail: `equal at ${valid} sample points` };
}

// ── Author assertions (`verify` lists) ───────────────────────────────────────

export interface Assertion {
  expr: string;
  /** Numeric claim: expr evaluates to this (a number, or an expression string like "-17/16"). */
  equals?: number | string;
  /** Identity claim: expr and equiv agree as functions of `var` (default x). */
  equiv?: string;
  /** graph-morph only: expr(x) is the polynomial of states[state]. */
  state?: number;
  var?: string;
  /** Fixed values for other symbols, e.g. { "n": 5 }. */
  at?: Record<string, number>;
  note?: string;
}

export interface AssertionResult { where: string; ok: boolean; detail: string; assertion: Assertion }

function readAssertions(scene: Scene): unknown[] | null {
  const v = (scene as unknown as { verify?: unknown }).verify;
  if (v === undefined) return null;
  return Array.isArray(v) ? v : [v];
}

function runOne(a: Assertion, scene: Scene): { ok: boolean; detail: string } {
  const env = { ...(a.at ?? {}) };
  const x = a.var ?? 'x';
  const claims = (['equals', 'equiv', 'state'] as const).filter(k => a[k] !== undefined);
  if (claims.length !== 1) return { ok: false, detail: 'needs exactly one of equals / equiv / state' };

  if (a.equals !== undefined) {
    const lhs = evalExpr(a.expr, env);
    const rhs = typeof a.equals === 'number' ? a.equals : evalExpr(String(a.equals), env);
    return { ok: numbersClose(lhs, rhs), detail: `${a.expr} = ${lhs}${numbersClose(lhs, rhs) ? '' : ` (claimed ${rhs})`}` };
  }
  if (a.equiv !== undefined) {
    const equiv = a.equiv;
    return sampledEqual(
      v => evalExpr(a.expr, { ...env, [x]: v }),
      v => evalExpr(equiv, { ...env, [x]: v }),
    );
  }
  if (scene.type !== 'graph-morph') return { ok: false, detail: '"state" assertions only apply to graph-morph scenes' };
  const st = scene.states[a.state as number];
  if (!st) return { ok: false, detail: `no states[${a.state}]` };
  const r = sampledEqual(v => evalExpr(a.expr, { ...env, [x]: v }), v => polyAt(st.coeffs, v));
  return { ok: r.ok, detail: `${a.expr} vs states[${a.state}] [${st.coeffs.join(', ')}]: ${r.detail}` };
}

/** Run every `verify` entry in the script; malformed entries fail loudly. */
export function runAssertions(script: LessonScript): AssertionResult[] {
  const out: AssertionResult[] = [];
  script.scenes.forEach((scene, i) => {
    const list = readAssertions(scene);
    if (!list) return;
    list.forEach((raw, k) => {
      const where = `scenes[${i}].verify[${k}]`;
      if (!raw || typeof raw !== 'object' || typeof (raw as Assertion).expr !== 'string') {
        out.push({ where, ok: false, detail: 'assertion must be an object with a string "expr"', assertion: { expr: String(raw) } });
        return;
      }
      const a = raw as Assertion;
      try {
        const r = runOne(a, scene);
        out.push({ where, ok: r.ok, detail: r.detail, assertion: a });
      } catch (e) {
        out.push({ where, ok: false, detail: `${a.expr}: ${(e as Error).message}`, assertion: a });
      }
    });
  });
  return out;
}

// ── graph-morph sanity ───────────────────────────────────────────────────────

const GRAPH_SAMPLES = 121;

/** Does the window actually show each state's curve, and is it a sane size? */
export function graphIssues(scene: GraphMorphScene, where: string): Issue[] {
  const out: Issue[] = [];
  const { xMin, xMax, yMin, yMax } = scene.window;
  const lens = new Set(scene.states.map(s => s.coeffs.length));
  if (lens.size > 1) out.push(issue('info', where, 'states have different coefficient counts — the player pads with zeros'));
  // The player draws a gridline per integer x and every 1–2 units of y.
  if (xMax - xMin > 12) out.push(issue('warn', `${where}.window`, `x-range ${xMax - xMin} is wide — one gridline per integer gets crowded (aim ≤ 12)`));
  if (yMax - yMin > 24) out.push(issue('warn', `${where}.window`, `y-range ${yMax - yMin} is tall — gridlines every 2 units get crowded (aim ≤ 24)`));
  if (scene.states.length > 6) out.push(issue('warn', where, `${scene.states.length} states — more than ~6 beats stops reading as one idea`));

  scene.states.forEach((st, si) => {
    const at = `${where}.states[${si}]`;
    if (!st.coeffs.every(Number.isFinite)) { out.push(issue('error', at, 'non-finite coefficient')); return; }
    let inside = 0;
    for (let i = 0; i < GRAPH_SAMPLES; i++) {
      const x = xMin + ((xMax - xMin) * i) / (GRAPH_SAMPLES - 1);
      const y = polyAt(st.coeffs, x);
      if (y >= yMin && y <= yMax) inside += 1;
    }
    const share = inside / GRAPH_SAMPLES;
    if (inside === 0) out.push(issue('error', at, 'curve never enters the window — nothing to see'));
    else if (share < 0.25) out.push(issue('warn', at, `only ${Math.round(share * 100)}% of the curve is inside the window`));

    // A quadratic's turning point is its teaching object — it belongs on screen.
    const trimmed = [...st.coeffs];
    while (trimmed.length > 1 && trimmed[trimmed.length - 1] === 0) trimmed.pop();
    if (trimmed.length === 3 && trimmed[2] !== 0) {
      const xv = -trimmed[1] / (2 * trimmed[2]);
      const yv = polyAt(trimmed, xv);
      if (xv < xMin || xv > xMax || yv < yMin || yv > yMax) {
        out.push(issue('warn', at, `turning point (${round(xv)}, ${round(yv)}) is outside the window`));
      }
    }
  });
  return out;
}

const round = (v: number) => Math.round(v * 100) / 100;

// ── Craft rules ──────────────────────────────────────────────────────────────

export const MAX_TOKENS_PER_LINE = 6;
const MAX_STEPS = 7;
const MAX_NOTE_CHARS = 170;
const MAX_CAPTION_CHARS = 520;
const MAX_HEADING_CHARS = 64;
const MAX_CALLOUTS = 4;
const MIN_SCENES = 8;
const MAX_SCENES = 16;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Fields the player prints as plain text — a `$` there shows up literally. */
function plainTextFields(script: LessonScript): { where: string; text: string | undefined }[] {
  const out: { where: string; text: string | undefined }[] = [{ where: 'title', text: script.title }];
  script.scenes.forEach((s, i) => {
    const at = `scenes[${i}]`;
    if (s.type === 'title') out.push({ where: `${at}.title`, text: s.title });
    if ('heading' in s) out.push({ where: `${at}.heading`, text: s.heading });
    if (s.type === 'check') out.push({ where: `${at}.placeholder`, text: s.placeholder });
    if (s.type === 'graph-morph') {
      out.push({ where: `${at}.xLabel`, text: s.xLabel }, { where: `${at}.yLabel`, text: s.yLabel });
    }
  });
  return out;
}

/** Fields that go through MathText: markdown only kicks in when the text has a `$`. */
function mathTextFields(script: LessonScript): { where: string; text: string | undefined }[] {
  const out: { where: string; text: string | undefined }[] = [];
  script.scenes.forEach((s, i) => {
    const at = `scenes[${i}]`;
    switch (s.type) {
      case 'title': out.push({ where: `${at}.promise`, text: s.promise }); break;
      case 'equation-steps':
        out.push({ where: `${at}.intro`, text: s.intro });
        s.steps.forEach((st, si) => out.push({ where: `${at}.steps[${si}].note`, text: st.note }));
        break;
      case 'graph-morph':
        out.push({ where: `${at}.caption`, text: s.caption });
        s.states.forEach((st, si) => out.push({ where: `${at}.states[${si}].label`, text: st.label }));
        break;
      case 'annotate':
        out.push({ where: `${at}.intro`, text: s.intro });
        s.callouts.forEach((c, ci) => out.push({ where: `${at}.callouts[${ci}].label`, text: c.label }));
        break;
      case 'check':
        out.push({ where: `${at}.prompt`, text: s.prompt }, { where: `${at}.why`, text: s.why });
        break;
      default: break;
    }
  });
  return out;
}

/**
 * The pilot's craft rules, as warnings (errors only where the player would
 * visibly misrender). Passing a script that trips several is possible; a
 * verifier run should read clean before Adrian sees it.
 */
export function craftIssues(script: LessonScript): Issue[] {
  const out: Issue[] = [];

  // Level + topic must be exactly canonical — the practice CTA and deep links match verbatim.
  const canonical = getTopicsForPaperLevel(script.level).flatMap(c => c.topics);
  if (canonical.length === 0) out.push(issue('error', 'level', `"${script.level}" is not a bank level (AM / EM / JC / S1 / S2)`));
  else if (!canonical.includes(script.topic)) {
    out.push(issue('error', 'topic', `"${script.topic}" is not a canonical ${script.level} topic (lib/canonical-topics.ts) — must match verbatim`));
  }

  const n = script.scenes.length;
  if (n < MIN_SCENES || n > MAX_SCENES) out.push(issue('warn', 'scenes', `${n} scenes — the pilot shape is ${MIN_SCENES}–${MAX_SCENES}`));
  if (script.scenes[0]?.type !== 'title') out.push(issue('warn', 'scenes[0]', 'open on a title scene'));
  const last = script.scenes[n - 1];
  if (last && last.type !== 'caption') out.push(issue('warn', `scenes[${n - 1}]`, 'close on a caption — the closer is what they carry away (never end on a check)'));

  for (const f of plainTextFields(script)) {
    if (f.text && f.text.includes('$')) out.push(issue('error', f.where, 'renders as plain text — no $…$ math here (rewrite in words, or use the intro/text field)'));
    if (f.text && f.where.endsWith('heading') && f.text.length > MAX_HEADING_CHARS) out.push(issue('warn', f.where, `heading is ${f.text.length} chars — keep it to one line`));
  }
  for (const f of mathTextFields(script)) {
    if (!f.text) continue;
    if (!f.text.includes('$') && /\*\*|`/.test(f.text)) {
      out.push(issue('warn', f.where, 'markdown (**bold**/`code`) only renders in this field when it also contains $ math — it will show literally'));
    }
    if (f.text.includes('\n')) out.push(issue('info', f.where, 'line breaks collapse in this field (only caption text keeps paragraphs)'));
  }

  const checkIdx: number[] = [];
  script.scenes.forEach((s, i) => {
    const at = `scenes[${i}]`;
    switch (s.type) {
      case 'caption':
        if (s.text.length > MAX_CAPTION_CHARS) out.push(issue('warn', `${at}.text`, `${s.text.length} chars — a caption is one idea, not a page (aim ≤ ${MAX_CAPTION_CHARS})`));
        break;
      case 'equation-steps': {
        if (s.steps.length > MAX_STEPS) out.push(issue('warn', at, `${s.steps.length} steps — split the scene (aim ≤ ${MAX_STEPS})`));
        const declared = new Set<string>();
        const referenced = new Set<string>();
        s.steps.forEach((st, si) => {
          if (st.tokens.length > MAX_TOKENS_PER_LINE) {
            out.push(issue('warn', `${at}.steps[${si}]`, `${st.tokens.length} tokens on one line — merge glyphs that move together (aim ≤ ${MAX_TOKENS_PER_LINE})`));
          }
          if (st.note && st.note.length > MAX_NOTE_CHARS) out.push(issue('warn', `${at}.steps[${si}].note`, `${st.note.length} chars — one plain sentence per line`));
          for (const t of st.tokens) {
            if (t.id) declared.add(t.id);
            if (t.from) referenced.add(t.from);
          }
        });
        for (const id of declared) if (!referenced.has(id)) out.push(issue('info', at, `token id "${id}" is never flown from`));
        if (s.steps.length > 1 && referenced.size === 0) out.push(issue('info', at, 'no moved-term animation — add `from` where a substitution assembles'));
        break;
      }
      case 'annotate':
        if (s.callouts.length > MAX_CALLOUTS) out.push(issue('warn', at, `${s.callouts.length} callouts — name at most ${MAX_CALLOUTS} parts per expression`));
        break;
      case 'check':
        checkIdx.push(i);
        if (!s.placeholder) out.push(issue('info', at, 'no placeholder — "k = ?" tells the student what shape the answer takes'));
        break;
      default: break;
    }
  });

  if (checkIdx.length === 0) out.push(issue('warn', 'scenes', 'no check scene — a lesson without a pause-predict never finds out what landed'));
  if (checkIdx.length > 3) out.push(issue('warn', 'scenes', `${checkIdx.length} checks — two is the shape (each costs a daily grade slot)`));
  if (checkIdx.length > 0 && checkIdx[0] < 4) out.push(issue('warn', `scenes[${checkIdx[0]}]`, 'first check arrives before scene 4 — teach the move (worked steps) before testing it'));
  for (let k = 1; k < checkIdx.length; k++) {
    if (checkIdx[k] - checkIdx[k - 1] === 1) out.push(issue('warn', `scenes[${checkIdx[k]}]`, 'two checks back to back — put a teaching beat between them'));
  }

  const est = estimateMinutes(script);
  if (script.minutes > est * 2 || script.minutes < est / 2) {
    out.push(issue('warn', 'minutes', `declared ${script.minutes} min but the scenes pace to ≈ ${est} min`));
  } else out.push(issue('info', 'minutes', `scenes pace to ≈ ${est} min (declared ${script.minutes})`));

  return out;
}

/**
 * Honest running time: the player's autoplay beats plus ~45 s of thinking per
 * check. Coarse on purpose — the entry-point chip says "4 min", not "3:52".
 */
export function estimateMinutes(script: LessonScript): number {
  let ms = 0;
  for (const s of script.scenes) {
    switch (s.type) {
      case 'title': ms += 3200; break;
      case 'caption': ms += Math.min(9000, 2200 + s.text.length * 26); break;
      case 'equation-steps':
        for (const st of s.steps) ms += 2400 + (st.note ? Math.min(2400, st.note.length * 22) : 0);
        break;
      case 'graph-morph': ms += 2600 * s.states.length; break;
      case 'annotate': ms += 2200 + 2600 * s.callouts.length; break;
      case 'check': ms += 45000; break;
    }
  }
  return Math.max(1, Math.round(ms / 60000));
}

// ── Narration ────────────────────────────────────────────────────────────────

const NARRATION_MIN_WORDS = 6;
const NARRATION_MAX_WORDS = 90;

/**
 * Spoken-English lines per scene (`narration`, an optional key the narration
 * layer reads). Missing narration is a warning until that layer lands
 * (`require` turns it into an error); TeX in narration is always an error —
 * it is read aloud, never rendered.
 */
export function narrationIssues(script: LessonScript, opts: { require?: boolean } = {}): Issue[] {
  const out: Issue[] = [];
  script.scenes.forEach((s, i) => {
    const at = `scenes[${i}].narration`;
    const n = (s as unknown as { narration?: unknown }).narration;
    if (n === undefined) { out.push(issue(opts.require ? 'error' : 'warn', at, 'missing — every scene needs a spoken line')); return; }
    if (typeof n !== 'string' || !n.trim()) { out.push(issue('error', at, 'must be a non-empty string')); return; }
    if (/[$\\]/.test(n)) out.push(issue('error', at, 'contains $ or a backslash — narration is spoken English, no TeX'));
    const words = wordCount(n);
    if (words < NARRATION_MIN_WORDS) out.push(issue('warn', at, `${words} words — too thin to carry the scene`));
    if (words > NARRATION_MAX_WORDS) out.push(issue('warn', at, `${words} words — over ~35 s spoken; split the idea or trim`));
  });
  return out;
}

// ── Check scenes against the bank ────────────────────────────────────────────

export type AnswerClass = 'number' | 'point' | 'expression' | 'multi' | 'pm' | 'shown';

/** What kind of answer a bank row carries — which decides how it grades. */
export function answerClass(answer: string): AnswerClass {
  const raw = answer.trim();
  if (/\\pm|±/.test(raw)) return 'pm';
  if (/\((?:[a-z]|i{1,3}|iv)\)/i.test(raw) || raw.includes(';') || /\bor\b/i.test(raw)) return 'multi';
  const norm = normalizeAnswer(raw);
  if (/^(shown|proved?|proof|qed)|^(hence|since|explain)/.test(norm)) return 'shown';
  if (asNumber(stripLead(norm)) !== null) return 'number';
  if (asPoint(norm)) return 'point';
  return 'expression';
}

export type CheckRow = CheckQuestionRow & { level?: string | null; topics?: unknown };

/**
 * Every check scene resolved against its bank row, exactly the way the server
 * page will resolve it — plus the authoring-time judgements the page doesn't
 * make (does the official answer grade against itself, is it single-valued,
 * is the question on the lesson's level/topic).
 */
export function checkIssues(script: LessonScript, rows: Map<string, CheckRow>): Issue[] {
  const out: Issue[] = [];
  script.scenes.forEach((s, i) => {
    if (s.type !== 'check') return;
    const scene: CheckScene = s;
    const at = `scenes[${i}] (check ${scene.qid})`;
    const row = rows.get(scene.qid);
    if (!row) { out.push(issue('error', at, 'question not found in the bank')); return; }
    const elig = practiceEligibility(row);
    if (!elig.ok) { out.push(issue('error', at, `fails the practice eligibility gate: ${elig.reason}`)); return; }
    const official = usableCheckAnswer(row);
    if (!official) { out.push(issue('error', at, 'eligible, but no top-level `answer` — lesson checks grade only against the short official answer')); return; }
    if (checkTypedAnswer(official, official) !== 'correct') {
      out.push(issue('error', at, `official answer "${official}" does not grade against itself — pick another question`));
    }
    const cls = answerClass(official);
    if (cls === 'multi') out.push(issue('error', at, `official answer is multi-part ("${official}") — a check takes one typed answer`));
    else if (cls === 'pm') out.push(issue('error', at, `official answer carries ± ("${official}") — the checker has no ± normaliser yet`));
    else if (cls === 'shown') out.push(issue('error', at, `"${official}" is a show/explain answer — nothing to type`));
    else if (cls === 'expression') out.push(issue('warn', at, `official answer "${official}" is symbolic — only an exact match grades, anything else reads "unclear"`));
    if (row.level && row.level !== script.level) out.push(issue('error', at, `question is level ${row.level}, lesson is ${script.level}`));
    if (Array.isArray(row.topics) && !row.topics.includes(script.topic)) {
      out.push(issue('warn', at, `question topics [${(row.topics as string[]).join(', ')}] do not include "${script.topic}"`));
    }
    if (Array.isArray(row.parts) && row.parts.length > 1) out.push(issue('warn', at, `${row.parts.length} parts — the student must answer the whole question with one line`));
    if (row.has_image || (typeof row.image_url === 'string' && row.image_url.trim() && row.image_url.trim() !== '[]')) {
      out.push(issue('info', at, 'question carries a figure — check it renders inside the card'));
    }
    if (scene.placeholder && cls === 'point' && !scene.placeholder.includes(',')) {
      out.push(issue('info', at, 'coordinate answer — a placeholder like "(h, k)" shows the shape to type'));
    }
  });
  return out;
}

// ── Roll-up ──────────────────────────────────────────────────────────────────

export function summarize(issues: Issue[]): { errors: number; warnings: number; infos: number } {
  return {
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warn').length,
    infos: issues.filter(i => i.severity === 'info').length,
  };
}
