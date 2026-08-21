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

export function normalizeMathDelimiters(text: string): string {
  if (!text) return '';
  return text
    // Display first, so the inner content of \[ … \] isn't re-touched below.
    // Own paragraph — remark-math treats $$ on its own line as block math.
    .replace(/(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g, (_m, inner: string) => `\n\n$$\n${inner.trim()}\n$$\n\n`)
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
 */
export function alignedRows(expr: string): string[] {
  const tokens = tokenize(expr.trim());
  const segments = splitTop(tokens, isArrow);
  const rows: string[] = [];
  segments.forEach((seg, si) => {
    const prefix = si === 0 ? '' : '\\Rightarrow ';
    if (!hasTop(seg, isEq)) { rows.push(`&${prefix}${join(seg)}`); return; }
    const pieces = splitTop(seg, isEq);
    const chain = pieces.length > 2 && !hasTop(seg, isOtherRelation);
    if (chain) {
      rows.push(`${prefix}${join(pieces[0])} &= ${join(pieces[1])}`);
      for (let k = 2; k < pieces.length; k++) rows.push(`&= ${join(pieces[k])}`);
    } else {
      const lhs = join(pieces[0]);
      const rhs = pieces.slice(1).map(join).join(' = ');
      rows.push(`${prefix}${lhs} &= ${rhs}`);
    }
  });
  return rows;
}

type Line =
  | { kind: 'math'; expr: string; label?: string }
  | { kind: 'text'; text: string };

// A line is "pure math" when, after an optional short text label ending in a
// colon, it is exactly one $…$ / $$…$$ expression (trailing . , ; allowed).
function classify(raw: string): Line {
  const line = raw.trim();
  if (!line || line.includes('<img') || line.includes('{{IMG:')) return { kind: 'text', text: line };
  const m = /^(?:([^$]{1,60}?):\s*)?\$\$?([^$]+?)\$\$?\s*[.,;]?$/.exec(line);
  if (m && m[2].trim()) return { kind: 'math', expr: m[2].trim(), label: m[1]?.trim() || undefined };
  return { kind: 'text', text: line };
}

function alignedBlock(exprs: string[]): string {
  const rows = exprs.flatMap(alignedRows);
  return `$$\n\\begin{aligned}\n${rows.join(' \\\\\n')}\n\\end{aligned}\n$$`;
}

/** Stored solution text → legible markdown (one block per step, aligned math). */
export function formatSolution(text: string | null | undefined): string {
  if (!text || !text.trim()) return '';
  const lines = normalizeMathDelimiters(text).split('\n').map(classify).filter(l => l.kind === 'math' || l.text);
  const blocks: string[] = [];
  let group: string[] = [];
  const flush = () => { if (group.length) { blocks.push(alignedBlock(group)); group = []; } };
  for (const l of lines) {
    if (l.kind === 'text') { flush(); blocks.push(l.text); continue; }
    if (l.label) { flush(); blocks.push(`${l.label}:`); }
    group.push(l.expr);
  }
  flush();
  return blocks.join('\n\n');
}
