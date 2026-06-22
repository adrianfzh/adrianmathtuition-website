// Question-bank rendering-defect fixers + KaTeX verification.
// Server-safe (no DOM). Used by the one-time /api/admin/qb-fix-render migration and
// (later) by the import pipeline so new papers come in clean.
//
// Each fixer is a pure string->string transform. They are conservative: a fix is only
// committed per-question if it does NOT introduce new KaTeX render errors (see the gate
// in the route). Real `\\` line-breaks inside arrays are preserved.

import katex from 'katex';

const SENT1 = String.fromCharCode(1); // sentinel for backslash-pair protection
const SENT2 = String.fromCharCode(2); // sentinel for escaped-dollar protection

// Calculator functions that are NOT LaTeX commands — must be wrapped in \text{}.
const CALC_FNS = [
  'binomcdf', 'binompdf', 'normalcdf', 'normalpdf',
  'poissoncdf', 'poissonpdf', 'invNorm', 'geometcdf', 'geometpdf',
];

/**
 * Collapse a doubled command backslash `\\cmd` -> `\cmd` (e.g. `\\times` -> `\times`),
 * while preserving genuine `\\` row/line breaks. A real break is `\\` followed by a
 * space, newline, another backslash, `[`, `&` or end — never directly by a letter.
 * Uses a sentinel so 3-backslash sequences (`\\\hline` = break + command) are untouched.
 */
export function fixOverEscapeCommands(s: string): string {
  if (!s) return s;
  let t = s.replace(/\\\\/g, SENT1);                          // pair consecutive backslashes, L->R
  t = t.replace(new RegExp(SENT1 + '([A-Za-z])', 'g'), '\\$1'); // SENT+letter = over-escape -> single
  t = t.split(SENT1).join('\\\\');                            // restore remaining (real breaks)
  return t;
}

/** `\\%` -> `\%` (a bare % is a LaTeX comment, so `\\%` is always a mistake). */
export function fixOverEscapePercent(s: string): string {
  return s ? s.split('\\\\%').join('\\%') : s;
}

/** Wrap calculator functions in \text{} so KaTeX renders them instead of erroring. */
export function fixCalcFns(s: string): string {
  if (!s) return s;
  let t = s;
  for (const fn of CALC_FNS) {
    t = t.replace(new RegExp('\\\\' + fn + '(?![A-Za-z{])', 'g'), '\\text{' + fn + '}');
  }
  return t;
}

/** All mechanical fixers, applied in order. */
export function applyAllFixes(s: string): string {
  if (!s) return s;
  return fixCalcFns(fixOverEscapePercent(fixOverEscapeCommands(s)));
}

/** Extract math spans honouring `\$` escapes. Returns LaTeX bodies + display flag. */
export function extractMathSpans(text: string): Array<{ body: string; display: boolean }> {
  if (!text) return [];
  const safe = text.replace(/\\\$/g, SENT2);
  const spans: Array<{ body: string; display: boolean }> = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    spans.push({ body: (m[1] ?? m[2]).split(SENT2).join('\\$'), display: m[1] !== undefined });
  }
  return spans;
}

/** Count KaTeX render errors across every math span in a text. */
export function countRenderErrors(text: string | null | undefined): number {
  if (!text) return 0;
  let errs = 0;
  for (const sp of extractMathSpans(text)) {
    try { katex.renderToString(sp.body, { throwOnError: true, displayMode: sp.display }); }
    catch { errs++; }
  }
  return errs;
}

// ── Question-level walk ─────────────────────────────────────────────────────
type Sub = { text?: string | null; solution?: string | null; answer?: string | null; [k: string]: unknown };
type Part = Sub & { subparts?: Sub[] };
export interface QuestionFields {
  question_text: string | null;
  solution: string | null;
  answer: string | null;
  parts: Part[] | null;
}

const FIELD_KEYS = ['text', 'solution', 'answer'] as const;

/** Concatenate every math-bearing string in a question (for error counting). */
function allText(q: QuestionFields): string {
  const bits: string[] = [q.question_text ?? '', q.solution ?? '', q.answer ?? ''];
  for (const p of q.parts ?? []) {
    for (const k of FIELD_KEYS) if (typeof p[k] === 'string') bits.push(p[k] as string);
    for (const sp of p.subparts ?? []) {
      for (const k of FIELD_KEYS) if (typeof sp[k] === 'string') bits.push(sp[k] as string);
    }
  }
  return bits.join('\n');
}

/**
 * Apply all fixers to every text field of a question. Returns the new field set, whether
 * anything changed, and KaTeX error counts before/after (the route uses these as a gate:
 * only write when errAfter <= errBefore).
 */
export function fixQuestion(q: QuestionFields): {
  next: QuestionFields; changed: boolean; errBefore: number; errAfter: number;
} {
  const errBefore = countRenderErrors(allText(q));
  const fixStr = (v: string | null | undefined) => (typeof v === 'string' ? applyAllFixes(v) : v ?? null);

  const nextParts = (q.parts ?? []).map((p) => {
    const np: Part = { ...p };
    for (const k of FIELD_KEYS) if (typeof p[k] === 'string') np[k] = fixStr(p[k] as string);
    if (Array.isArray(p.subparts)) {
      np.subparts = p.subparts.map((sp) => {
        const nsp: Sub = { ...sp };
        for (const k of FIELD_KEYS) if (typeof sp[k] === 'string') nsp[k] = fixStr(sp[k] as string);
        return nsp;
      });
    }
    return np;
  });

  const next: QuestionFields = {
    question_text: fixStr(q.question_text),
    solution: fixStr(q.solution),
    answer: fixStr(q.answer),
    parts: q.parts ? nextParts : null,
  };

  const changed = JSON.stringify([q.question_text, q.solution, q.answer, q.parts])
    !== JSON.stringify([next.question_text, next.solution, next.answer, next.parts]);
  const errAfter = changed ? countRenderErrors(allText(next)) : errBefore;
  return { next, changed, errBefore, errAfter };
}

/**
 * Heuristic flags for STRUCTURAL / content defects that can't be auto-fixed and need
 * re-extraction from source (flattened tables, extraction notes). Returned in the report
 * for human review — never auto-changed.
 */
export function structuralFlags(q: QuestionFields): string[] {
  const flags: string[] = [];
  const text = `${q.question_text ?? ''}\n${(q.parts ?? []).map((p) => p.text ?? '').join('\n')}`;
  const hasTable = /\\begin\{array\}|<table|\|\s*-{3,}/.test(text);
  if (/mean[\s\S]{0,40}standard\s+deviation/i.test(text) && !hasTable) flags.push('flattened_table');
  if (/\[[^\]]*(note|not (fully )?extract|illegible|missing|could not)[^\]]*\]/i.test(text)
      || /not (fully )?extract|illegible|missing (from|in) the (source|document)/i.test(text)) {
    flags.push('extraction_note');
  }
  return flags;
}
