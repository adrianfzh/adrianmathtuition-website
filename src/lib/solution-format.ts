// Legible rendering of bank question / solution text for the portal practice
// page (Adrian, 2026-08-21: "solutions are formatted in a way it is very hard
// to read — have the lines on their own, aligned by equal sign").
//
// Two pure transforms, unit-tested in solution-format.test.ts:
//
//  normalizeMathDelimiters — the AI-generated rows (and a handful of extracted
//    ones) carry LaTeX \( … \) / \[ … \] delimiters, which remark-math does NOT
//    recognise (it only parses $ … $ / $$ … $$), so the raw backslashes showed
//    up verbatim on the page. Rewrites them to dollar delimiters.
//
//  formatSolution — stored solutions are newline-separated working, but a
//    single newline is a soft break in markdown, so every step ran together in
//    one paragraph. This puts each stored line in its own block, and turns runs
//    of pure-math lines into one KaTeX `aligned` environment, breaking at the
//    top-level `=` signs (and ⇒ chains) so the equals signs line up the way
//    handwritten working does. Mixed text+math lines stay as plain paragraphs.

const ARROWS = new Set(['Rightarrow', 'implies', 'Longrightarrow']);
const RELATIONS = new Set([
  'le', 'ge', 'leq', 'geq', 'ne', 'neq', 'approx', 'equiv', 'sim', 'propto',
  'lt', 'gt', 'Leftrightarrow', 'iff', 'therefore', 'because',
]);

export function normalizeMathDelimiters(text: string, opts: { display?: 'block' | 'inline' } = {}): string {
  if (!text) return '';
  // Display first, so the inner content of \[ … \] isn't re-touched below.
  // 'block' (default) puts $$ on its own lines — remark-math block math.
  // 'inline' keeps $$…$$ on the same line, for text that is split per line
  // afterwards (formatSolution).
  const display = opts.display === 'inline'
    ? (inner: string) => `$$${inner.trim()}$$`
    : (inner: string) => `\n\n$$\n${inner.trim()}\n$$\n\n`;
  return text
    .replace(/(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g, (_m, inner: string) => display(inner))
    .replace(/(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)/g, (_m, inner: string) => `$${inner.trim()}$`);
}

type Token =
  | { kind: 'char'; ch: string; depth: number }
  | { kind: 'cmd'; name: string; depth: number };

// Tokenise a LaTeX string tracking bracket depth so we only split at TOP-LEVEL
// `=` / arrows — never inside \frac{…}{…}, \binom{}{}, (…) or \text{…}.
function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      const next = src[i + 1] ?? '';
      if (/[A-Za-z]/.test(next)) {
        let j = i + 1;
        while (j < src.length && /[A-Za-z]/.test(src[j])) j++;
        out.push({ kind: 'cmd', name: src.slice(i + 1, j), depth });
        i = j - 1;
      } else {
        // Escaped symbol. Set braces \{ \} are visible brackets and nest like
        // any other; the rest (\, \\ \; …) are opaque and never change depth.
        if (next === '{') { out.push({ kind: 'char', ch: '\\{', depth }); depth++; }
        else if (next === '}') { depth = Math.max(0, depth - 1); out.push({ kind: 'char', ch: '\\}', depth }); }
        else out.push({ kind: 'char', ch: '\\' + next, depth });
        i++;
      }
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') { out.push({ kind: 'char', ch, depth }); depth++; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth = Math.max(0, depth - 1); out.push({ kind: 'char', ch, depth }); continue; }
    out.push({ kind: 'char', ch, depth });
  }
  return out;
}

function tokText(t: Token): string {
  return t.kind === 'cmd' ? '\\' + t.name : t.ch;
}

// Split a token list at top-level occurrences matched by `isSep`. The separator
// token itself is dropped.
function splitTop(tokens: Token[], isSep: (t: Token) => boolean): Token[][] {
  const parts: Token[][] = [[]];
  for (const t of tokens) {
    if (t.depth === 0 && isSep(t)) parts.push([]);
    else parts[parts.length - 1].push(t);
  }
  return parts;
}

// Commands need a separating space when followed by a letter ("\Rightarrow r").
function join(tokens: Token[]): string {
  let s = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    s += tokText(t);
    if (t.kind === 'cmd') {
      const nxt = tokens[i + 1];
      if (nxt && nxt.kind === 'char' && /[A-Za-z]/.test(nxt.ch)) s += ' ';
    }
  }
  return s.trim();
}

function hasTop(tokens: Token[], pred: (t: Token) => boolean): boolean {
  return tokens.some(t => t.depth === 0 && pred(t));
}
const isEq = (t: Token) => t.kind === 'char' && t.ch === '=';
const isArrow = (t: Token) => t.kind === 'cmd' && ARROWS.has(t.name);
const isOtherRelation = (t: Token) =>
  (t.kind === 'cmd' && RELATIONS.has(t.name)) ||
  (t.kind === 'char' && (t.ch === '<' || t.ch === '>' || t.ch === ',' || t.ch === ';'));

/**
 * One pure-math expression → `aligned` rows (without the trailing `\\`).
 *   a = b = c            →  a &= b  /  &= c
 *   p = q ⇒ r = s        →  p &= q  /  \Rightarrow r &= s
 *   x < y = z  (mixed)   →  x < y &= z      (align on the first = only)
 *   no `=` at all        →  &expr
 * `textPrefix` ("Then ", "Coefficient of ") is set in \text{} before the lhs
 * of the first row, so short lead-ins stay on the line they belong to.
 */
const row = (s: string) => s.replace(/ {2,}/g, ' ').trim();

export function alignedRows(expr: string, textPrefix?: string): string[] {
  const tokens = tokenize(expr.trim());
  const segments = splitTop(tokens, isArrow);
  const rows: string[] = [];
  const lead = textPrefix ? `\\text{${textPrefix}} ` : '';
  segments.forEach((seg, si) => {
    const prefix = si === 0 ? lead : '\\Rightarrow ';
    if (!hasTop(seg, isEq)) { rows.push(`&${prefix}${join(seg)}`); return; }
    const pieces = splitTop(seg, isEq);
    const chain = pieces.length > 2 && !hasTop(seg, isOtherRelation);
    if (chain) {
      rows.push(row(`${prefix}${join(pieces[0])} &= ${join(pieces[1])}`));
      for (let k = 2; k < pieces.length; k++) rows.push(`&= ${join(pieces[k])}`);
    } else {
      const lhs = join(pieces[0]);
      const rhs = pieces.slice(1).map(join).join(' = ');
      rows.push(row(`${prefix}${lhs} &= ${rhs}`));
    }
  });
  return rows;
}

type Line =
  | { kind: 'math'; expr: string; label?: string; raw: string }
  | { kind: 'text'; text: string };

// A line is "pure math" when, after an optional short text lead-in, it is
// exactly one $…$ / $$…$$ expression (trailing . , ; allowed). The lead-in may
// be a colon label ("General term:", "Coefficient of $x$:") — balanced inline
// math allowed — a label ending in "=" ("Constant term = $3 \\times 1 = 3$",
// where the = then belongs to the equation), a bare "=" (a continuation of the
// previous line), or a plain word or two ("Then", "Hence", "Coefficient of"),
// which must be free of $ so that "$x = 2$ or $x = -3$" stays a sentence
// rather than becoming label "$x = 2$ or".
function classify(raw: string): Line {
  const line = raw.trim();
  if (!line || line.includes('<img') || line.includes('{{IMG:')) return { kind: 'text', text: line };
  const m = /^(.{0,80}?)\s*\$\$?([^$]+?)\$\$?\s*[.,;]?$/.exec(line);
  if (!m || !m[2].trim()) return { kind: 'text', text: line };
  let label = m[1].trim();
  let expr = m[2].trim();
  // "$r = 3.$" — AI-authored rows often close the sentence inside the math.
  expr = expr.replace(/(?<!\.)[.,;]$/, '').trim();
  const endsInEq = label.endsWith('=');
  if (endsInEq) { label = label.slice(0, -1).trim(); expr = `= ${expr}`; }
  const dollars = (label.match(/\$/g) || []).length;
  if (dollars % 2 === 1 || (dollars > 0 && !endsInEq && !label.endsWith(':')) || label.endsWith('\\')) {
    return { kind: 'text', text: line };
  }
  return { kind: 'math', expr, label: label || undefined, raw: line };
}

// Short lead-ins ride inside the aligned block as \text{…} (KaTeX allows
// $…$ inside \text, so "Coefficient of $x^2$" is fine); anything longer, or
// carrying markdown, goes in its own paragraph above the block so it can't
// push the `=` column off a phone screen.
const EMBED_LABEL = /^[A-Za-z0-9 ().,'’:$^_{}\\-]+$/;
function embeddable(label: string): boolean {
  return EMBED_LABEL.test(label) && label.replace(/[$\\{}^_]/g, '').length <= 28;
}

type Row = { expr: string; prefix?: string };
function alignedBlock(rows: Row[]): string {
  const lines = rows.flatMap(r => alignedRows(r.expr, r.prefix));
  return `$$\n\\begin{aligned}\n${lines.join(' \\\\\n')}\n\\end{aligned}\n$$`;
}

// A math line with no top-level `=` (e.g. "\therefore P(0,-7)", a bare
// expression) has nothing to align on — it gets its own display line, flush
// left, instead of dangling to the right of the `=` column.
function alignable(expr: string): boolean {
  return hasTop(tokenize(expr), isEq);
}

/** Stored solution text → legible markdown (one block per step, aligned math). */
export function formatSolution(text: string | null | undefined): string {
  if (!text || !text.trim()) return '';
  const lines = normalizeMathDelimiters(text, { display: 'inline' })
    .split('\n').map(classify).filter(l => l.kind === 'math' || l.text);
  const blocks: string[] = [];
  let group: Row[] = [];
  const flush = () => { if (group.length) { blocks.push(alignedBlock(group)); group = []; } };
  for (const l of lines) {
    if (l.kind === 'text') { flush(); blocks.push(l.text); continue; }
    if (!alignable(l.expr)) {
      flush();
      // "Hence $x > 3$." reads fine as a sentence; only a bare expression
      // with no lead-in earns its own display line.
      blocks.push(l.label ? l.raw : `$$\n${l.expr}\n$$`);
      continue;
    }
    if (!l.label) { group.push({ expr: l.expr }); continue; }
    if (embeddable(l.label)) { group.push({ expr: l.expr, prefix: l.label + ' ' }); continue; }
    flush();
    blocks.push(l.label);
    group.push({ expr: l.expr });
  }
  flush();
  return blocks.join('\n\n');
}
