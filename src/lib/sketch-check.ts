// 📈 The graph-sketch checker — the website's PURE half (SPEC-SKETCH-CHECK.md,
// 5 Oct 2026; Adrian: "build … the graph sketch checker").
//
// A JC H2 student picks a "sketch the curve" question (our list of school
// prelim / promo / mid-year questions with a fully numeric function —
// data/sketch-check/questions.json, never a national row) or types the function
// they were given, sketches on paper and photographs it. The bot computes every
// feature from the function (asymptotes, intercepts, turning points, how each
// piece ends) and verifies them through the figure registry's own gate, reads
// the photo BLIND, and judges it in code: ✓ / ✗ beside each feature, "label it"
// notes, the correct sketch beside the photo, a plain checklist, and what a
// mark scheme would take off. Practice — no mark is kept.
//
// This file: the question list, the typed-function reader, the daily cap, and
// the report's shape for the page. No I/O.
import questionsJson from '../../data/sketch-check/questions.json';

export type SketchGroup = 'asymptotes' | 'intercepts' | 'turning';
export const SKETCH_GROUPS: readonly SketchGroup[] = ['asymptotes', 'intercepts', 'turning'];

export interface SketchQuestion {
  id: string;
  questionId: string | null;
  source: string;
  marks: number | null;
  /** The function in the bot's function-graph grammar. */
  expr: string;
  /** LaTeX for the page. */
  shown: string;
  ask: string;
  asks: SketchGroup[];
  exact: boolean;
  domain?: [number | null, number | null] | null;
}

/** Checks a student may run per Singapore day — each is one vision call (~US$0.02). */
export const DAILY_SKETCH_CAP = 10;
export const SKETCH_CAP_MESSAGE = `That is ${DAILY_SKETCH_CAP} sketches checked today. The next one goes in tomorrow.`;

export function sketchQuestions(): SketchQuestion[] {
  const list = (questionsJson as { questions: SketchQuestion[] }).questions;
  return list.map(q => ({ ...q, asks: q.asks.filter(g => (SKETCH_GROUPS as readonly string[]).includes(g)) }));
}

export function sketchQuestionById(id: string | null | undefined): SketchQuestion | null {
  if (!id) return null;
  return sketchQuestions().find(q => q.id === id) ?? null;
}

// ── a typed function ────────────────────────────────────────────────────────
// The student types what the paper printed: "y = (x²+4x−5)/(x−5)", "f(x)=3+|(2x+1)/(x-1)|",
// "ln x / x". This turns it into the bot's grammar (numbers, x, + - * / ^, brackets,
// sin cos tan asin acos atan exp ln sqrt abs, pi, e) or says plainly what is wrong.
// The bot's parser is the final judge; this only catches what we can name here.

const FUNCS = ['asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan', 'sin', 'cos', 'tan', 'exp', 'ln', 'sqrt', 'abs'];

export type TypedFunction = { ok: true; expr: string } | { ok: false; error: string };

export function parseTypedFunction(input: string): TypedFunction {
  let s = String(input ?? '').trim();
  if (!s) return { ok: false, error: 'Type the function first.' };
  if (s.length > 160) return { ok: false, error: 'That is too long for one function.' };
  // drop "y =", "f(x) =", "C: y ="
  s = s.replace(/^\s*(?:[A-Za-z]\d?\s*:\s*)?(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
  s = s
    .replace(/[−–—]/g, '-')
    .replace(/[×·∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([0-9.]+|x)/g, 'sqrt($1)')
    .replace(/\be\s*\^\s*\(/g, 'exp(')
    .replace(/\b(ln|sin|cos|tan|exp|sqrt|abs|arcsin|arccos|arctan|asin|acos|atan)\s+([0-9.]*x)\b/gi, '$1($2)')
    .replace(/\\/g, '');
  // |…| → abs(…): bars pair up left to right; an odd count cannot be read
  const bars = (s.match(/\|/g) || []).length;
  if (bars % 2) return { ok: false, error: 'A | is missing its partner.' };
  let open = true;
  s = s.replace(/\|/g, () => { const t = open ? 'abs(' : ')'; open = !open; return t; });
  s = s.replace(/\s+/g, '');
  // what is left must be the grammar's own letters
  // Each run of letters must split into the grammar's own names ("2xln(x)" = x · ln).
  const NAMES = [...FUNCS, 'pi', 'x', 'e'].sort((a, b) => b.length - a.length);
  for (const w of s.match(/[A-Za-z]+/g) || []) {
    let rest = w.toLowerCase();
    while (rest) {
      const name = NAMES.find(n => rest.startsWith(n));
      if (!name) return { ok: false, error: `"${w}" is not something the checker can draw. Use numbers and x only.` };
      rest = rest.slice(name.length);
    }
  }
  if (/[^0-9A-Za-z+\-*/^().,]/.test(s)) return { ok: false, error: 'Use numbers, x, + − × ÷ ^ and brackets.' };
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return { ok: false, error: 'A bracket closes before it opens.' };
  }
  if (depth !== 0) return { ok: false, error: 'A bracket is not closed.' };
  if (!/x/i.test(s)) return { ok: false, error: 'The function needs an x.' };
  return { ok: true, expr: s.replace(/arcsin/gi, 'asin').replace(/arccos/gi, 'acos').replace(/arctan/gi, 'atan') };
}

/** "x > 0" style domain from two optional boxes; null when both are empty. */
export function parseDomain(lo: unknown, hi: unknown): [number | null, number | null] | null {
  const n = (v: unknown) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const x = Number(String(v).replace(/[−–]/g, '-'));
    return Number.isFinite(x) ? x : null;
  };
  const a = n(lo), b = n(hi);
  if (a === null && b === null) return null;
  if (a !== null && b !== null && a >= b) return null;
  return [a, b];
}

// ── the report, as the bot writes it on the row ────────────────────────────
export type SketchStatus = 'ok' | 'unlabelled' | 'wrong' | 'rough' | 'half' | 'missing' | 'not-exact' | 'extra' | 'check';
export interface SketchItem {
  id: string; group: string; kind: string; status: SketchStatus;
  want: string | null; wrote: string | null; at: [number, number] | null; note: string;
  /** Since 5 Oct 2026 (later rows): the feature as TeX, its name and a two-word status. */
  tex?: string | null; name?: string; short?: string;
}
export interface SketchSummaryLine { ok: boolean; check?: boolean; text: string; fix: string }
export interface SketchReport {
  items: SketchItem[];
  summary: SketchSummaryLine[];
  deductions: string[];
  groups: Record<string, { ok: boolean; count: number; wrong: number }>;
  features: { id: string; kind: string; text: string; verified: boolean }[];
  refused: string[];
}

export type SketchRowStatus = 'queued' | 'checking' | 'checked' | 'failed';

/** The one line at the top of a result. */
export function headline(report: SketchReport | null, status: SketchRowStatus): string {
  if (status === 'queued' || status === 'checking') return 'Checking your sketch…';
  if (status === 'failed' || !report) return 'This sketch could not be checked.';
  const lost = report.deductions.length;
  if (lost === 0) return 'Every feature is there and labelled.';
  return lost === 1 ? 'One mark would go.' : `${lost} marks would go.`;
}

export interface ChecklistLine { mark: '✓' | '✗' | '?'; name: string; tex: string | null; text: string; short: string }

/**
 * One short line per point (Adrian, 5 Oct 2026: "be less verbose"): ✗ first, then
 * ?, then ✓. The maths is TeX for the page's KaTeX; a point that is two features
 * (the y-intercept that is the maximum) is one line.
 */
export function checklist(report: SketchReport): ChecklistLine[] {
  const items = report.items ?? [];
  if (!items.some(i => i.short !== undefined)) {
    // a row from before the short form: the old summary, unchanged
    return report.summary.map(l => ({ mark: l.ok ? '✓' : l.check ? '?' : '✗', name: '', tex: null, text: l.text, short: '' }));
  }
  const seen = new Map<string, ChecklistLine>();
  for (const it of items) {
    const mark = it.status === 'ok' ? '✓' : it.status === 'check' ? '?' : '✗';
    if (it.kind === 'shape') {
      const text = it.note || 'Shape right';
      const key = `shape|${mark}|${it.note ? it.id : 'ok'}`;
      if (!seen.has(key)) seen.set(key, { mark, name: '', tex: null, text, short: '' });
      continue;
    }
    const key = `${it.tex ?? it.want}|${mark}`;
    const prev = seen.get(key);
    if (prev) { if (it.name && !prev.name.includes(it.name)) prev.name = `${prev.name} · ${it.name}`; continue; }
    seen.set(key, { mark, name: it.name ?? '', tex: it.tex ?? null, text: it.want ?? it.wrote ?? '', short: it.short ?? '' });
  }
  const rank = { '✗': 0, '?': 1, '✓': 2 } as const;
  return [...seen.values()].sort((a, b) => rank[a.mark] - rank[b.mark]);
}

/** What a scheme would take off, in one line. */
export function deductionLine(report: SketchReport): string {
  if (!report.deductions.length) return 'No marks lost.';
  const list = report.deductions.map(d => d.replace(/ — .*$/, '').replace(/^the /, ''));
  return `Marks lost: ${list.join(' · ')}.`;
}
