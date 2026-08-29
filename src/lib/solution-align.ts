// ─── Equals-sign alignment for the transcript's worked solutions ────────────────
//
// The red-pen footer on the annotated PHOTO has aligned consecutive equation steps
// at the equals sign since July (bot ai/pen-math.js groupAlignedTex); the typeset
// transcript sheet never did, so the same solution read ragged there ("sometimes
// equations not aligned at equal sign?" — Adrian, 26 Aug 2026). This lib is the
// server-side twin of the bot's rules, applied in render-marking.ts AFTER
// repairMarkingLatex and BEFORE the payload reaches the template: qualifying runs
// of equation steps are merged into single `$\begin{aligned}…\end{aligned}$` lines
// (KaTeX typesets those with one shared alignment column), everything else passes
// through untouched. The template's own STEP_RE never splits inside a merged block
// — `aligned` rows are separated by `\\`, and the splitter only breaks on `\n`.
//
// The qualification rules are the bot's, verbatim in spirit (a step qualifies only
// if the WHOLE line is one $…$ run with a top-level `=`, no \text{…} on the left,
// and a short left-hand side) — drift between the two surfaces is exactly what the
// alignment exists to remove, so change these numbers in BOTH places or neither.

import { SOLUTION_STEP_RE } from './latex-repair';

// Past this the LHS is a sentence that happens to contain an equals sign, and
// pulling it to the alignment column drags the whole block right.
const ALIGN_LHS_MAX = 26;
// Past this many TeX chars a multi-equality chain stops being one readable thought
// and becomes one row per equals sign.
const CHAIN_SPLIT_MIN = 34;

/** The whole line is exactly one `$…$` maths run → its inner TeX, else null. */
function oneMathRun(line: string): string | null {
  const m = /^\s*\$([^$]+)\$\s*$/.exec(line);
  return m ? m[1].trim() : null;
}

type Rel = '=' | '\\approx' | '\\le' | '\\ge' | '<' | '>';

/** First top-level relation (`=`, `\approx`/`≈`, `\le`/`\ge`/`≤`/`≥`, bare `<`/`>`;
 *  not `<=`/`>=`/`!=`/`:=`/`==`/`->`), split there. */
export function splitAtRelation(src: string): { lhs: string; rhs: string; rel: Rel } | null {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      // `\approx` and the inequalities are relations too — an inequality chain
      // ("$4x - 5 < 15$ … $x < 5$") sat ragged beside its aligned `=` siblings
      // (Adrian, 29 Aug 2026, Kayla's Q1 footer). Mirrored from the bot's
      // ai/pen-math.js — change both or neither. The lookahead keeps `\left`
      // and `\geqslant` safe: a longer command name never matches.
      const m = /^\\(approx|leq?|geq?)(?![a-zA-Z])/.exec(src.slice(i));
      if (m && depth === 0) {
        const rel: Rel = m[1] === 'approx' ? '\\approx' : m[1][0] === 'l' ? '\\le' : '\\ge';
        return { lhs: src.slice(0, i).trim(), rhs: src.slice(i + m[0].length).trim(), rel };
      }
      i += 1; continue;
    }
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth--; continue; }
    if (c === '≈' && depth === 0) {
      return { lhs: src.slice(0, i).trim(), rhs: src.slice(i + 1).trim(), rel: '\\approx' };
    }
    if ((c === '≤' || c === '≥') && depth === 0) {
      return { lhs: src.slice(0, i).trim(), rhs: src.slice(i + 1).trim(), rel: c === '≤' ? '\\le' : '\\ge' };
    }
    if ((c === '<' || c === '>') && depth === 0) {
      // `<=`, `>=`, `<<`, `>>`, `->`, `=>` are not this relation.
      if (src[i + 1] === '=' || src[i + 1] === c) return null;
      if (i > 0 && '<>-='.includes(src[i - 1])) return null;
      return { lhs: src.slice(0, i).trim(), rhs: src.slice(i + 1).trim(), rel: c };
    }
    if (c === '=' && depth === 0) {
      if (i > 0 && '<>!:='.includes(src[i - 1])) return null;
      return { lhs: src.slice(0, i).trim(), rhs: src.slice(i + 1).trim(), rel: '=' };
    }
  }
  return null;
}

type RhsSeg = { tex: string; rel: Rel };

/** Parse one step into subject + every top-level relation segment, each carrying
 *  the relation that precedes it (`$a=b≈c$` → lhs a, rhss [{b,=},{c,≈}]). */
function equationParts(line: string): { lhs: string; rhss: RhsSeg[] } | null {
  const tex = oneMathRun(line);
  if (tex == null) return null;
  const split = splitAtRelation(tex);
  if (!split) return null;
  if (/\\text\s*\{/.test(split.lhs)) return null;
  if (split.lhs.length > ALIGN_LHS_MAX) return null;
  const rhss: RhsSeg[] = [];
  let rel = split.rel;
  let rest = split.rhs;
  for (let more = splitAtRelation(rest); more; more = splitAtRelation(rest)) {
    rhss.push({ tex: more.lhs, rel });
    rel = more.rel;
    rest = more.rhs;
  }
  rhss.push({ tex: rest, rel });
  return { lhs: split.lhs, rhss };
}

// A comma outside every group/bracket means SEVERAL statements share the line
// ("x = 4, y = -2.5 or x = -5, y = 2") — breaking such a line at each relation
// shreds it into nonsense rows ("x &= 4, y" / "&= -2.5 or x"), which is exactly
// how Alessi's simultaneous-equations footer printed (2026-08-29). `\,` is a
// spacing command, and commas inside (), [], {} — coordinates, intervals,
// function arguments — are not statement separators.
function hasTopLevelComma(src: string): boolean {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i += 1; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ',' && depth <= 0) return true;
  }
  return false;
}

/** One step → its aligned rows (a long relation chain becomes one row per relation). */
function alignedRowsForStep(line: string): { tex: string; raw: string }[] | null {
  const eq = equationParts(line);
  if (!eq) return null;
  const texLen = eq.lhs.length + eq.rhss.reduce((n, r) => n + r.tex.length + 3, 0);
  // Multi-statement lines (top-level comma, or prose via \text between the
  // relations) must never chain-split — each "rhs" is really the next
  // statement's opening, not a continuation of this one.
  const multiStatement =
    hasTopLevelComma(eq.lhs) ||
    eq.rhss.some((r) => hasTopLevelComma(r.tex) || /\\text\s*\{/.test(r.tex));
  if (eq.rhss.length === 1 || texLen <= CHAIN_SPLIT_MIN || multiStatement) {
    const tail = eq.rhss.map((r, i) => (i === 0 ? r.tex : `${r.rel} ${r.tex}`)).join(' ');
    return [{ tex: `${eq.lhs} &${eq.rhss[0].rel} ${tail}`, raw: line }];
  }
  return eq.rhss.map((r, i) => ({
    tex: `${i === 0 ? eq.lhs : ''} &${r.rel} ${r.tex}`,
    raw: i === 0 ? `$${eq.lhs} ${r.rel} ${r.tex}$` : `$${r.rel} ${r.tex}$`,
  }));
}

// `$\text{(b) } 2y + 1 = 5$` — a part label welded inside the maths run both
// defeats the alignment (a \text{…} LHS never joins a block) and buries which
// part the working belongs to on a multi-part footer (Adrian, 29 Aug 2026:
// Kayla's Q27 "Correct solution" ran two parts together with no labels). Lift
// the label out as its own heading line and align what remains. Mirrored in the
// bot's ai/pen-math.js — change both or neither.
const PART_LABEL_RE = /^\$\s*\\text\{\s*\(([a-z]{1,3}|[A-Z])\)\s*([^{}]*?)\s*\}\s*(.*)\$\s*$/;
function liftPartLabel(line: string): { label: string; rest: string | null } | null {
  const m = PART_LABEL_RE.exec(line.trim());
  if (!m) return null;
  const rest = [m[2] ? `\\text{${m[2]} }` : '', m[3]].filter(Boolean).join(' ').trim();
  return { label: `(${m[1]})`, rest: rest ? `$${rest}$` : null };
}

/**
 * Merge runs of ≥2 consecutive equation steps into single `$\begin{aligned}…$`
 * lines, joined back with real newlines. A lone equation stays a normal line so
 * it can still word-wrap; prose and mixed lines pass through untouched.
 */
export function groupAlignedSteps(src: string): string {
  const steps = String(src ?? '').split(SOLUTION_STEP_RE).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  let run: { tex: string; raw: string }[] = [];
  const flush = () => {
    if (run.length >= 2) {
      out.push(`$\\begin{aligned}${run.map((r) => r.tex).join(' \\\\ ')}\\end{aligned}$`);
    } else {
      for (const r of run) out.push(r.raw);
    }
    run = [];
  };
  for (const step of steps) {
    const lifted = liftPartLabel(step);
    if (lifted) {
      flush();                       // a part label starts a fresh alignment group
      out.push(lifted.label);
      if (lifted.rest) {
        const rows = alignedRowsForStep(lifted.rest);
        if (rows) { run.push(...rows); continue; }
        out.push(lifted.rest);
      }
      continue;
    }
    const rows = alignedRowsForStep(step);
    if (rows) { run.push(...rows); continue; }
    flush();
    out.push(step);
  }
  flush();
  return out.join('\n');
}

type Branches = {
  before_latex?: string | null;
  after_latex?: string | null;
  cases?: Array<{ case?: string | null; steps_latex?: string | null } | null> | null;
} | null;

type Alignable = { correct?: { full_solution_latex?: string; solution_branches?: Branches } | null };

/** Apply the alignment to every solution field of a marking payload, on a copy. */
export function alignMarkingSolutions<T extends Alignable>(marking: T): T {
  const out = { ...marking } as T & Alignable;
  if (!out.correct) return out as T;
  const correct = { ...out.correct };
  if (correct.full_solution_latex) correct.full_solution_latex = groupAlignedSteps(correct.full_solution_latex);
  const b = correct.solution_branches;
  if (b && typeof b === 'object' && Array.isArray(b.cases)) {
    correct.solution_branches = {
      ...b,
      before_latex: b.before_latex ? groupAlignedSteps(b.before_latex) : b.before_latex,
      after_latex: b.after_latex ? groupAlignedSteps(b.after_latex) : b.after_latex,
      cases: b.cases.map((c) => c && typeof c === 'object' && c.steps_latex
        ? { ...c, steps_latex: groupAlignedSteps(c.steps_latex) }
        : c),
    };
  }
  out.correct = correct;
  return out as T;
}
