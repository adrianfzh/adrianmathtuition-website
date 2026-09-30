// Readability for worked solutions on EVERY surface (Adrian, 29–30 Sep 2026:
// "better readability has to apply to all solutions … basically everything";
// "why are the solutions still so unreadable?"). Pure and client-safe: the PDF
// renderer (lib/render-solutions-pdf.ts), the bank's markdown (practice, the
// generated-question review) and the admin bank viewer all read through here.
//
// The stored text is untouched (the marker and paper_schemes keep the marks);
// only what a reader SEES changes:
//   • a bracketed mark note shrinks to its codes ("[M1 for …]" → a small "M1");
//   • a "Marks:" / "Mark scheme:" paragraph is left out (kept aside for admin);
//   • an "Alternative …:" paragraph moves below the working;
//   • a prose line carrying several steps breaks into ONE STEP A LINE, at
//     sentence ends and semicolons outside the maths;
//   • "(a) …" at the start of a line becomes its own heading line;
//   • a "Check: …" line and a whole-line bracketed aside read quieter.

const MARK_NOTE = /\[\s*((?:[BMA]\d\s*,?\s*)+)(?:[^\]]*)\]/g;
export const MK_OPEN = '\u0001';
export const MK_CLOSE = '\u0002';

/** "[M1 for the two conditions …]" → the codes alone, wrapped in MK_OPEN/MK_CLOSE. */
export function markNotesToCodes(line: string): string {
  return line.replace(MARK_NOTE, (_m, codes: string) =>
    `${MK_OPEN}${codes.replace(/[,\s]+/g, ' ').trim()}${MK_CLOSE}`).replace(/\s+(\u0001)/g, ' $1');
}

/** Mark notes removed outright (what a student reads on screen). */
export function stripMarkNotes(line: string): string {
  return line.replace(MARK_NOTE, '').replace(/[ \t]+([.,;:])/g, '$1').replace(/[ \t]{2,}/g, ' ').trimEnd();
}

export const SCHEME_PARA = /^\s*(?:mark(?:ing)?\s*scheme|marking|marks?\s*(?:allocation|breakdown)?)(?:\s+for\s+[^:\n]{1,24})?\s*:/i;
const ALT_PARA = /^\s*(?:alternatively|alternative(?:\s+(?:route|method|approach|solution|way))?|another (?:way|method))\s*[:,.—-]?\s*/i;

/** Split a solution into its working, its alternative routes and any mark-scheme
 *  text (never shown to a student). Pure. */
export function splitSolutionFull(text: string): { main: string; alternatives: string[]; scheme: string } {
  const paras = text.trim().split(/\n\s*\n/);
  const main: string[] = [], alternatives: string[] = [], scheme: string[] = [];
  for (const p of paras) {
    // A scheme or alternative can start partway down a paragraph (a line of its
    // own, no blank line before it — AM Set 2 P1 Q4, 29 Sep 2026): cut there.
    const lines = p.split('\n');
    const cut = lines.findIndex((l) => SCHEME_PARA.test(l) || ALT_PARA.test(l));
    const head = (cut < 0 ? lines : lines.slice(0, cut)).join('\n').trim();
    const tail = cut < 0 ? '' : lines.slice(cut).join('\n');
    if (head) main.push(head);
    if (!tail) continue;
    if (SCHEME_PARA.test(tail.split('\n')[0])) { scheme.push(tail.trim()); continue; }
    const body = tail.replace(ALT_PARA, '').trim();
    if (body) alternatives.push(body);
  }
  return { main: main.join('\n\n'), alternatives, scheme: scheme.join('\n\n') };
}

export function splitSolution(text: string): { main: string; alternatives: string[] } {
  const { main, alternatives } = splitSolutionFull(text);
  return { main, alternatives };
}

const PART_LABEL = /^\s*((?:\((?:[a-z]|i{1,3}|iv|vi{0,3}|ix|x)\))+)\s+/i;

/** A whole line in brackets that is an aside, not a part label. */
export function isAsideLine(line: string): boolean {
  const t = line.trim();
  return /^\(.*\)[.;]?$/.test(t) && !PART_LABEL.test(t + ' ');
}

export const isCheckLine = (l: string): boolean => /^\(?\s*check\b/i.test(l.trim());

/** Inline \frac → \dfrac so fractions read full-size. */
export function displayFractions(line: string): string {
  return line.replace(/\\frac(?![a-zA-Z])/g, '\\dfrac');
}

/** True when the text has display maths that must stay in one block. */
export function hasDisplayMath(t: string): boolean {
  return /\$\$|\\\[|\\begin\{/.test(t);
}

/**
 * One step a line: break a prose line at a sentence end (". " before a capital,
 * "(" or "$") or a "; ", never inside $…$, \(…\) or brackets. A line of display
 * maths is returned whole. Pure.
 */
export function stepLines(line: string): string[] {
  if (hasDisplayMath(line)) return [line];
  const out: string[] = [];
  let cur = '', inMath = false, depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && (line[i + 1] === '$' || line[i + 1] === '(' || line[i + 1] === ')')) {
      if (line[i + 1] === '(') inMath = true;
      if (line[i + 1] === ')') inMath = false;
      cur += c + line[i + 1]; i++; continue;
    }
    if (c === '$') { inMath = !inMath; cur += c; continue; }
    if (!inMath) {
      if (c === '(' || c === '[') depth++;
      else if ((c === ')' || c === ']') && depth > 0) depth--;
    }
    cur += c;
    if (inMath || depth > 0) continue;
    const next = line.slice(i + 1);
    const sentenceEnd = c === '.' && /^\s+[A-Z($]/.test(next) && !/\b(?:e\.g|i\.e|cf|approx|vs)\.$/i.test(cur);
    // Colon-led lists ("Check: A; B") and clause chains break at "; ".
    const semi = c === ';' && /^\s+\S/.test(next);
    if (sentenceEnd || semi) {
      out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

export type SolLine =
  | { kind: 'label'; text: string }
  | { kind: 'step' | 'quiet'; text: string; codes?: string }
  | { kind: 'display'; text: string };

/** Working text → the lines a reader sees (labels, steps, quiet lines). */
export function solutionLines(text: string): SolLine[] {
  const t = text.trim();
  if (!t) return [];
  if (hasDisplayMath(t)) return [{ kind: 'display', text: t }];
  const out: SolLine[] = [];
  for (const raw of t.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    const lab = line.match(PART_LABEL);
    if (lab && line.length > lab[0].length) {
      out.push({ kind: 'label', text: lab[1] });
      line = line.slice(lab[0].length);
    }
    // A "Check: A; B" split at its semicolon: B is still part of the check.
    let inCheck = false;
    for (const step of stepLines(line)) {
      const coded = markNotesToCodes(step);
      const codes = [...coded.matchAll(/\u0001([^\u0002]*)\u0002/g)].map((m) => m[1]).join(' ');
      const bare = coded.replace(/\s*\u0001[^\u0002]*\u0002/g, '').trim().replace(/;$/, '');
      if (!bare) continue;
      if (isCheckLine(bare)) inCheck = true;
      out.push({ kind: inCheck || isAsideLine(bare) ? 'quiet' : 'step', text: bare, ...(codes ? { codes } : {}) });
    }
  }
  return out;
}

export type SolutionView = { main: SolLine[]; alternatives: SolLine[][]; scheme: string };

/** The whole view: working lines, "Another way" blocks, and the scheme (admin only). */
export function solutionView(text: string | null | undefined): SolutionView {
  const { main, alternatives, scheme } = splitSolutionFull(text ?? '');
  return { main: solutionLines(main), alternatives: alternatives.map(solutionLines), scheme };
}

/**
 * Stored solution → cleaner plain text for the markdown surfaces (practice,
 * review): scheme gone, mark notes gone, one step a line, labels on their own
 * line, alternatives after the working under "Another way:". Pure.
 */
export function readableSolutionText(text: string | null | undefined): string {
  if (!text || !text.trim()) return '';
  const v = solutionView(text);
  const render = (ls: SolLine[]) => ls.map((l) => (l.kind === 'label' ? `**${l.text}**` : l.text)).join('\n');
  const blocks = [render(v.main)];
  for (const a of v.alternatives) blocks.push(`Another way:\n${render(a)}`);
  return blocks.filter(Boolean).join('\n\n');
}

/** Key for a label line: "(b)(ii)" → "b.ii", "(a)" → "a". */
export function labelKey(label: string): string {
  return [...label.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].toLowerCase()).join('.');
}

export type ViewLine = SolLine | { kind: 'answer'; text: string };

/**
 * Put each part's answer as a bold "Answer:" line at the END of that part's
 * working in a combined solution (the readability rule: the result stands out).
 * `answers` is keyed by labelKey ("a", "b.ii"). Pure.
 */
export function withPartAnswers(lines: SolLine[], answers: Record<string, string>): ViewLine[] {
  const out: ViewLine[] = [];
  let open: string | null = null;
  const close = () => {
    if (open && answers[open]?.trim()) out.push({ kind: 'answer', text: answers[open].trim() });
    open = null;
  };
  for (const l of lines) {
    if (l.kind === 'label') { close(); open = labelKey(l.text); }
    out.push(l);
  }
  close();
  return out;
}

// ── Equations lined up on "=" (Adrian, 30 Sep 2026: "equations align at equal
// sign, and statements on their own line if required") ──────────────────────
//   • a step that is only equations joined by "so", "gives", "and", "then" …
//     becomes rows of an aligned block; a chain "a = b = c" continues on its own
//     row with an empty left side;
//   • "… or $x = …$" stays on the same row (cases side by side);
//   • "(acute)" and other bracketed asides go grey at the right of the row;
//   • "End values: …", "Comparing … with …: …" — the lead-in gets its own line.
// A step with any other prose stays a sentence. Pure; the stored text is untouched.

export type AlignRow = { lead?: string; lhs: string; rel: string; rhs: string; note?: string; codes?: string };
export type AlignedLine = ViewLine | { kind: 'sub'; text: string } | { kind: 'align'; rows: AlignRow[] };

const CONNECTOR = /^(?:so|gives|giving|then|hence|thus|therefore|and|when|which gives|so that|or)?$/i;
const REL_CMD = /^\\(?:approx|equiv)(?![a-zA-Z])/;
const INEQ = /^(?:<|>|\\(?:le|leq|ge|geq|lt|gt|ne|neq)(?![a-zA-Z]))/;

/** Split TeX at its top-level "=" (and ≈, ≡). null when it is not an equation
 *  (no relation, or an inequality anywhere at the top level). */
export function splitRelations(tex: string): { terms: string[]; rels: string[] } | null {
  const terms: string[] = [], rels: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i], rest = tex.slice(i);
    if (c === '\\') {
      const cmd = rest.match(/^\\(?:left|right|big|Big|bigg|Bigg)[lr]?(?![a-zA-Z])\s*(\\[{}]|[()[\]|.])?/);
      if (cmd) {
        if (/^\\(?:left|big|Big|bigg|Bigg)l?(?![a-zA-Z])/.test(rest) && !/^\\[a-zA-Z]+r/.test(rest)) depth++;
        else if (/^\\right|^\\[a-zA-Z]+r(?![a-zA-Z])/.test(rest)) depth = Math.max(0, depth - 1);
        cur += cmd[0]; i += cmd[0].length - 1; continue;
      }
      if (depth === 0 && INEQ.test(rest)) return null;
      const rc = depth === 0 ? rest.match(REL_CMD) : null;
      if (rc) { terms.push(cur.trim()); rels.push(rc[0]); cur = ''; i += rc[0].length - 1; continue; }
      const word = rest.match(/^\\(?:[a-zA-Z]+|.)/);
      cur += word![0]; i += word![0].length - 1; continue;
    }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if ((c === '}' || c === ')' || c === ']') && depth > 0) depth--;
    if (depth === 0 && (c === '<' || c === '>')) return null;
    if (depth === 0 && c === '=') { terms.push(cur.trim()); rels.push('='); cur = ''; continue; }
    cur += c;
  }
  terms.push(cur.trim());
  if (!rels.length || terms.some((t) => !t)) return null;
  return { terms, rels };
}

/** A step's text in math and prose pieces ("$…$" only; display maths never gets here). */
function pieces(text: string): { math: boolean; s: string }[] {
  const raw = text.split(/(\$[^$]+\$)/g).filter((p) => p !== '')
    .map((p) => (p.length > 2 && p.startsWith('$') && p.endsWith('$') ? { math: true, s: p.slice(1, -1) } : { math: false, s: p }));
  // A bracketed aside that holds maths ("(the only such value in $…$)") is ONE
  // prose piece, so it can go to the row's note whole.
  const out: { math: boolean; s: string }[] = [];
  let open = 0;
  for (const p of raw) {
    const prev = out[out.length - 1];
    if (open > 0 && prev) prev.s += p.math ? `$${p.s}$` : p.s;
    else out.push({ ...p });
    if (!p.math) open = Math.max(0, open + (p.s.match(/\(/g) || []).length - (p.s.match(/\)/g) || []).length);
  }
  return out;
}

/** "(aside) rest" → [aside, rest], by bracket balance. */
function leadingAside(s: string): [string, string] | null {
  const t = s.replace(/^[\s,;]+/, '');
  if (!t.startsWith('(')) return null;
  let d = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '(') d++;
    else if (t[i] === ')' && --d === 0) return [t.slice(1, i).trim(), t.slice(i + 1)];
  }
  return null;
}

/** One step → aligned rows, or null when it carries prose that is not a joining word. */
export function stepRows(text: string): AlignRow[] | null {
  const rows: AlignRow[] = [];
  let lead = '', or = false;
  for (const p of pieces(text)) {
    if (!p.math) {
      let s = p.s.trim();
      const aside = leadingAside(s);
      if (aside && rows.length) {
        const last = rows[rows.length - 1];
        last.note = [last.note, aside[0]].filter(Boolean).join('; ');
        s = aside[1];
      }
      const word = s.replace(/^[\s,.;:]+|[\s,.;:]+$/g, '');
      if (!CONNECTOR.test(word)) return null;
      if (/^or$/i.test(word)) { if (!rows.length) return null; or = true; lead = ''; continue; }
      lead = word;
      continue;
    }
    const eq = splitRelations(p.s);
    if (or) {
      rows[rows.length - 1].rhs += ` \\quad\\text{or}\\quad ${p.s.trim()}`;
      or = false; continue;
    }
    if (!eq) {
      if (!rows.length || !lead) return null;
      rows.push({ lead, lhs: '', rel: '', rhs: p.s.trim() });
    } else {
      eq.rels.forEach((rel, k) => rows.push({ ...(k === 0 && lead ? { lead } : {}), lhs: k === 0 ? eq.terms[0] : '', rel, rhs: eq.terms[k + 1] }));
    }
    lead = '';
  }
  if (or || !rows.length) return null;
  return rows;
}

/** "End values: at …" → ["End values:", "at …"]; "Comparing A with B: R cos α = …" too.
 *  The colon must sit outside the maths and the lead-in must be short. */
export function leadIn(text: string): [string, string] | null {
  let inMath = false;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === '$') inMath = !inMath;
    if (!inMath && text[i] === ':' && text[i + 1] === ' ') {
      const head = text.slice(0, i + 1).trim(), rest = text.slice(i + 2).trim();
      if (!rest || head.length > 160 || /^\(?\s*check\b/i.test(head)) return null;
      const prose = head.replace(/\$[^$]*\$/g, ' ');
      if (!/[A-Za-z]{3,}/.test(prose) || prose.trim().split(/\s+/).length > 6) return null;
      return [head, rest];
    }
  }
  return null;
}

/** Working lines → the same lines with equation runs lined up on "=". Pure. */
export function alignView(lines: ViewLine[]): AlignedLine[] {
  const out: AlignedLine[] = [];
  let run: { rows: AlignRow[]; src: ViewLine[] } | null = null;
  const flush = () => {
    if (!run) return;
    if (run.rows.length >= 2) out.push({ kind: 'align', rows: run.rows });
    else out.push(...run.src);
    run = null;
  };
  for (const l of lines) {
    if (l.kind !== 'step') { flush(); out.push(l); continue; }
    let text = l.text;
    const li = leadIn(text);
    if (li) { flush(); out.push({ kind: 'sub', text: li[0] }); text = li[1]; }
    const rows = stepRows(text);
    const line: ViewLine = { ...l, text };
    if (!rows) { flush(); out.push(line); continue; }
    if (l.codes) rows[rows.length - 1].codes = l.codes;
    if (!run) run = { rows: [], src: [] };
    run.rows.push(...rows);
    run.src.push(line);
  }
  flush();
  return out;
}
