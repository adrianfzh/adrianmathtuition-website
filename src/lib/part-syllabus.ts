// Part-level out-of-syllabus marks — THE ONE DOOR (SPEC-PART-SYLLABUS.md, 9 Oct 2026).
//
// Adrian: "if only a small part is out of syllabus, then skip that part, flag out of
// syllabus for that part and don't show it to students".
//
// `questions.legacy_syllabus` hides a whole question. This is the same idea for ONE part:
// a part inside `questions.parts` carries `legacy: true` (+ a short `legacy_reason`), and
// every surface that hands a bank question to a student or to a printed sheet takes the
// row through `studentRow()` first. What comes out:
//   - the marked part is gone, with everything under it (text, figure, answer, solution);
//   - the other parts keep their ORIGINAL labels — (a), (c) — never relabelled, because the
//     label is how the answer key, the worked solution, a marked attempt and the school's
//     own paper all name the part;
//   - a part that `needs` a hidden part ("hence, using (b)") is hidden with it;
//   - the marks total is the original total minus the hidden parts' marks;
//   - the answer line and the worked solution lose the hidden parts — the stored line is
//     split by label; failing that it is rebuilt from the remaining parts' own answers;
//     and it is WITHHELD when neither is safe (never shown whole);
//   - whole-question pictures and the stored hint, which may show the hidden part, are
//     withheld.
// A question with nothing marked comes back as the very same object: the feature is dark
// until a part is marked.
//
// Pure (repo testing policy) — no I/O. Tolerant of malformed jsonb.

/** Below this many marks left, the question is not served at all (same effect as legacy_syllabus). */
export const MIN_REMAINING_MARKS = 3;
/** …and at least this share of the original marks must be left. */
export const MIN_REMAINING_SHARE = 0.5;

type Obj = Record<string, unknown>;

export type HiddenVia = 'marked' | 'parent' | 'needs' | 'emptied';
export interface HiddenPart {
  /** Path key, e.g. `b` or `b.ii`. */
  key: string;
  /** How a person writes it: `(b)(ii)`. */
  label: string;
  /** Why: Adrian's reason for a marked part; "needs (b)" / "inside (b)" / "nothing left inside" otherwise. */
  reason: string;
  via: HiddenVia;
  /** Marks this hidden part itself carried as a leaf (0 for a parent whose sub-parts carry them). */
  marks: number;
}

export type ViewNote =
  | 'marks_unknown'        // a hidden or remaining part carries no marks — the reduced total is a best effort
  | 'answer_withheld'      // the one-line answer could not be split by part, so none is shown
  | 'solution_withheld'    // the worked solution could not be split by part, so none is shown
  | 'solution_images_withheld' // whole-question solution pictures cannot be tied to a part
  | 'unknown_needs';       // a `needs` entry names a part that is not on this question

export interface StudentView<T> {
  /** What a student may be shown. The SAME object as the input when nothing is marked. */
  row: T;
  /** True when at least one part was removed. */
  changed: boolean;
  /** False when too little is left: treat the question like a legacy_syllabus one. */
  servable: boolean;
  /** True when nothing at all is left. */
  empty: boolean;
  hidden: HiddenPart[];
  originalMarks: number | null;
  marks: number | null;
  notes: ViewNote[];
}

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** One spelling for a label: `(B)` / ` b ` / `b)` → `b`. */
export function normLabel(label: unknown): string {
  return String(label ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** `(b)(ii)` / `b(ii)` / `b.ii` / `B ii` → `b.ii`. Empty string when nothing usable. */
export function parsePartRef(ref: unknown): string {
  const tokens = String(ref ?? '').toLowerCase().match(/[a-z0-9]+/g);
  return tokens ? tokens.join('.') : '';
}

/** `b.ii` → `(b)(ii)`. */
export function partRefLabel(key: string): string {
  return key.split('.').filter(Boolean).map((t) => `(${t})`).join('');
}

interface Node {
  part: Obj;
  key: string;
  parent: Node | null;
  children: Node[];
}

function buildTree(parts: unknown): Node[] {
  const walk = (ps: unknown, parent: Node | null): Node[] => {
    if (!Array.isArray(ps)) return [];
    const out: Node[] = [];
    ps.forEach((p, i) => {
      if (!isObj(p)) return;
      const own = normLabel(p.label) || `#${i + 1}`;
      const node: Node = { part: p, key: parent ? `${parent.key}.${own}` : own, parent, children: [] };
      node.children = walk(p.subparts, node);
      out.push(node);
    });
    return out;
  };
  return walk(parts, null);
}

const flat = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...flat(n.children)]);

function num(v: unknown): number | null {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

/** Marks a node carries: its sub-parts' when any of them has marks (the parent's figure is
 *  then a repeat of their sum — lib/bank-question-markdown structuredPart), else its own. */
function nodeMarks(n: Node, skip?: (n: Node) => boolean): { marks: number; unknown: boolean } {
  if (skip?.(n)) return { marks: 0, unknown: false };
  const kids = n.children;
  if (kids.length && kids.some((k) => subtreeHasMarks(k))) {
    let marks = 0; let unknown = false;
    for (const k of kids) { const r = nodeMarks(k, skip); marks += r.marks; unknown = unknown || r.unknown; }
    return { marks, unknown };
  }
  const own = num(n.part.marks);
  return { marks: own ?? 0, unknown: own === null };
}
function subtreeHasMarks(n: Node): boolean {
  return num(n.part.marks) !== null || n.children.some(subtreeHasMarks);
}

/** True when any part (at any depth) carries `legacy: true`. The cheap test every caller may use. */
export function hasPartMarks(parts: unknown): boolean {
  if (!Array.isArray(parts)) return false;
  return parts.some((p) => isObj(p) && (p.legacy === true || hasPartMarks(p.subparts)));
}

/**
 * Which parts a student never sees, and why. Order: marked parts → everything inside them →
 * parts that `need` a hidden part → parents left with nothing inside; repeated until stable.
 */
export function hiddenParts(parts: unknown): { hidden: HiddenPart[]; unknownNeeds: boolean } {
  const roots = buildTree(parts);
  const all = flat(roots);
  const byKey = new Map(all.map((n) => [n.key, n]));
  const hid = new Map<Node, { via: HiddenVia; reason: string }>();

  const hide = (n: Node, via: HiddenVia, reason: string) => {
    if (hid.has(n)) return;
    hid.set(n, { via, reason });
    for (const c of n.children) hide(c, 'parent', `inside ${partRefLabel(n.key)}`);
  };
  for (const n of all) {
    if (n.part.legacy === true) hide(n, 'marked', str(n.part.legacy_reason).trim() || 'out of syllabus');
  }
  if (!hid.size) return { hidden: [], unknownNeeds: false };

  let unknownNeeds = false;
  const anyHiddenIn = (n: Node): boolean => hid.has(n) || n.children.some(anyHiddenIn);
  for (let changed = true; changed;) {
    changed = false;
    for (const n of all) {
      if (hid.has(n)) continue;
      const needs = Array.isArray(n.part.needs) ? n.part.needs : [];
      for (const raw of needs) {
        const target = byKey.get(parsePartRef(raw));
        if (!target) { unknownNeeds = true; continue; }
        if (target !== n && anyHiddenIn(target)) {
          hide(n, 'needs', `needs ${partRefLabel(target.key)}`);
          changed = true;
          break;
        }
      }
    }
    for (const n of all) {
      if (!hid.has(n) && n.children.length && n.children.every((c) => hid.has(c))) {
        hid.set(n, { via: 'emptied', reason: 'nothing left inside' });
        changed = true;
      }
    }
  }

  const hidden: HiddenPart[] = all.filter((n) => hid.has(n)).map((n) => {
    const h = hid.get(n)!;
    const leaf = !n.children.some(subtreeHasMarks);
    return { key: n.key, label: partRefLabel(n.key), reason: h.reason, via: h.via, marks: leaf ? (num(n.part.marks) ?? 0) : 0 };
  });
  return { hidden, unknownNeeds };
}

// ── answer line / worked solution: drop the hidden parts' share ──────────────

interface Leaf { key: string; tokens: string[]; hidden: boolean }

/** Blank out `$…$` / `$$…$$` so a label inside maths — f(x), (i) as a root — is never read as a part label. */
function maskMath(s: string): string {
  return s.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, (m) => ' '.repeat(m.length));
}

/**
 * Split a text that names its parts — "(a) …; (b)(i) …; (ii) …" — and drop the hidden
 * parts' segments. Every leaf part must be found, in order, or the answer is null (the
 * caller then withholds the text rather than show a hidden part's share).
 * `lineStart` = accept a label only at the start of a line (worked solutions, where
 * "from part (i)" inside a sentence must not be read as a heading).
 */
export function dropHiddenSegments(text: string, leaves: Leaf[], lineStart = false): string | null {
  if (!leaves.length) return null;
  const masked = maskMath(text);
  const re = lineStart
    ? /^[ \t]*(?:[#>*_\s]|part\s)*((?:\(\s*[a-z0-9]{1,4}\s*\)\s*)+)/gim
    : /((?:\(\s*[a-z0-9]{1,4}\s*\)[ \t]*)+)/gi;
  type Mark = { at: number; tokens: string[] };
  const marks: Mark[] = [];
  for (const m of masked.matchAll(re)) {
    const tokens = (m[1].match(/[a-z0-9]+/gi) || []).map((t) => t.toLowerCase());
    marks.push({ at: (m.index ?? 0) + (lineStart ? 0 : m[0].indexOf(m[1])), tokens });
  }
  // Each leaf, in order, must open at a marker: its full path "(b)(ii)", or — right after
  // a sibling — its own label alone "(ii)".
  const starts: number[] = [];
  let mi = 0;
  let prevParent = '';
  for (const leaf of leaves) {
    const own = leaf.tokens[leaf.tokens.length - 1];
    const parentKey = leaf.tokens.slice(0, -1).join('.');
    let found = -1;
    for (let j = mi; j < marks.length; j++) {
      const t = marks[j].tokens;
      const full = t.length === leaf.tokens.length && t.every((x, k) => x === leaf.tokens[k]);
      const short = leaf.tokens.length > 1 && parentKey === prevParent && t.length === 1 && t[0] === own;
      if (full || short) { found = j; break; }
    }
    if (found === -1) return null;
    starts.push(marks[found].at);
    mi = found + 1;
    prevParent = parentKey;
  }
  const head = text.slice(0, starts[0]);
  const out: string[] = [];
  let lastKeptParent: string | null = null;
  leaves.forEach((leaf, i) => {
    if (leaf.hidden) return;
    let seg = text.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : text.length);
    const parentKey = leaf.tokens.slice(0, -1).join('.');
    // "(b)(i) …; (ii) …" with (b)(i) hidden: the kept "(ii)" lost its "(b)" — put it back.
    const m = maskMath(seg).match(/^[ \t]*(?:[#>*_\s]|part\s)*((?:\(\s*[a-z0-9]{1,4}\s*\)\s*)+)/i);
    const shown = m ? (m[1].match(/[a-z0-9]+/gi) || []).length : 0;
    if (leaf.tokens.length > 1 && shown === 1 && lastKeptParent !== parentKey) {
      const at = seg.indexOf('(');
      seg = `${seg.slice(0, at)}${partRefLabel(parentKey)}${seg.slice(at)}`;
    }
    lastKeptParent = parentKey;
    out.push(seg);
  });
  if (!out.length) return '';
  const joined = (head + out.join('')).replace(/[\s;,]+$/g, '').replace(/^[\s;,]+/g, '');
  return joined;
}

function rebuildAnswer(remaining: Node[]): string | null {
  const bits: string[] = [];
  const walk = (ns: Node[]): boolean => {
    for (const n of ns) {
      const own = str(n.part.answer).trim();
      if (n.children.length) {
        // A parent's own answer is kept when it has one; its sub-parts must each have theirs.
        if (own && !n.children.some((c) => str(c.part.answer).trim())) { bits.push(`${partRefLabel(n.key)} ${own}`); continue; }
        if (!walk(n.children)) return false;
      } else {
        if (!own) return false;
        bits.push(`${partRefLabel(n.key)} ${own}`);
      }
    }
    return true;
  };
  return walk(remaining) && bits.length ? bits.join('; ') : null;
}

const hasPartSolutions = (ns: Node[]): boolean =>
  ns.some((n) => str(n.part.solution).trim() !== '' || hasPartSolutions(n.children));
const everyLeafHasSolution = (ns: Node[]): boolean =>
  ns.every((n) => (n.children.length && !str(n.part.solution).trim()
    ? everyLeafHasSolution(n.children)
    : str(n.part.solution).trim() !== ''));

/** Fields on the row that show the whole question as one picture or one stored line. */
const WHOLE_QUESTION_FIELDS = ['question_image_url', 'question_with_answer_image_url', 'solution_image_url', 'hint'] as const;
/** Keys that exist only for this feature — never part of what a student's browser receives. */
const MARK_KEYS = ['legacy', 'legacy_reason', 'needs'] as const;

export interface PartMarkRow {
  parts?: unknown;
  total_marks?: unknown;
  answer?: unknown;
  solution?: unknown;
  solution_images?: unknown;
  [k: string]: unknown;
}

/**
 * THE DOOR. A bank row in, what a student may see out — plus what was hidden and why
 * (for the admin view). Nothing marked → `row` is the very same object.
 */
export function studentView<T extends object>(input: T): StudentView<T> {
  const row = input as T & PartMarkRow;
  const untouched = (): StudentView<T> => {
    const m = num(row?.total_marks);
    return { row: input, changed: false, servable: true, empty: false, hidden: [], originalMarks: m, marks: m, notes: [] };
  };
  if (!row || !hasPartMarks(row.parts)) return untouched();

  const roots = buildTree(row.parts);
  const { hidden, unknownNeeds } = hiddenParts(row.parts);
  const hiddenKeys = new Set(hidden.map((h) => h.key));
  const isHidden = (n: Node) => hiddenKeys.has(n.key);
  const notes = new Set<ViewNote>();
  if (unknownNeeds) notes.add('unknown_needs');

  // ── marks ──
  const before = roots.map((r) => nodeMarks(r));
  const after = roots.map((r) => nodeMarks(r, isHidden));
  const sumBefore = before.reduce((a, r) => a + r.marks, 0);
  const sumAfter = after.reduce((a, r) => a + r.marks, 0);
  const hiddenMarks = sumBefore - sumAfter;
  const hiddenUnknown = flat(roots).some((n) => isHidden(n) && !n.children.length && num(n.part.marks) === null
    && !(n.parent && isHidden(n.parent) && num(n.parent.part.marks) !== null && !n.parent.children.some(subtreeHasMarks)));
  const stored = num(row.total_marks);
  const originalMarks = stored ?? (sumBefore > 0 ? sumBefore : null);
  let marks: number | null;
  if (originalMarks !== null && !hiddenUnknown) marks = Math.max(0, originalMarks - hiddenMarks);
  else if (sumAfter > 0 && !after.some((r) => r.unknown)) marks = sumAfter;
  else marks = null;
  if (marks === null || hiddenUnknown) notes.add('marks_unknown');

  // ── parts: drop the hidden ones, keep every label, strip the mark keys ──
  const keep = (ns: Node[]): Obj[] => ns.filter((n) => !isHidden(n)).map((n) => {
    const o: Obj = { ...n.part };
    for (const k of MARK_KEYS) delete o[k];
    if (n.children.length) {
      o.subparts = keep(n.children);
      // A parent's figure that merely repeats its sub-parts' sum follows the sub-parts left.
      const own = num(n.part.marks);
      if (own !== null && n.children.some(subtreeHasMarks)) {
        const left = nodeMarks(n, isHidden).marks;
        if (left > 0) o.marks = left; else delete o.marks;
      }
    }
    return o;
  });
  const parts = keep(roots);
  const remainingRoots = buildTree(parts);
  const empty = remainingRoots.length === 0;

  // ── answer line ──
  const leaves: Leaf[] = flat(roots).filter((n) => !n.children.length)
    .map((n) => ({ key: n.key, tokens: n.key.split('.'), hidden: isHidden(n) }));
  const out: Obj = { ...row, parts, total_marks: marks };
  if (typeof row.answer === 'string' && row.answer.trim()) {
    // The stored line is the curated key: keep its wording when it splits cleanly by label;
    // otherwise build one from the remaining parts' own answers.
    const rebuilt = dropHiddenSegments(row.answer, leaves) ?? rebuildAnswer(remainingRoots);
    if (rebuilt === null) { out.answer = null; notes.add('answer_withheld'); } else out.answer = rebuilt || null;
  }

  // ── worked solution ──
  if (typeof row.solution === 'string' && row.solution.trim()) {
    if (hasPartSolutions(roots) && (empty || everyLeafHasSolution(remainingRoots))) {
      out.solution = null;   // the per-part working is the source of truth (lib/solution-rollup)
    } else {
      const split = dropHiddenSegments(row.solution, leaves, true);
      if (split === null) { out.solution = null; notes.add('solution_withheld'); } else out.solution = split || null;
    }
  }
  // Whole-question solution pictures cannot be tied to a part: withhold them all.
  const si = row.solution_images;
  const hasSi = Array.isArray(si) ? si.length > 0 : typeof si === 'string' && si.trim() !== '' && si.trim() !== '[]';
  if (hasSi) { out.solution_images = Array.isArray(si) ? [] : null; notes.add('solution_images_withheld'); }
  for (const k of WHOLE_QUESTION_FIELDS) if (k in out && out[k]) out[k] = null;

  const servable = !empty && (marks === null
    || (marks >= MIN_REMAINING_MARKS && (originalMarks === null || marks >= originalMarks * MIN_REMAINING_SHARE)));

  return { row: out as T, changed: true, servable, empty, hidden, originalMarks, marks, notes: [...notes] };
}

/**
 * What every student surface calls: the student's row, or null when the question must not
 * be served (too little left). `assigned` = the tutor put this question on the student's
 * own list — it is still shown with its hidden parts removed, however little is left,
 * unless nothing is left at all (mirrors serve-gate's rule for legacy_syllabus).
 */
export function studentRow<T extends object>(row: T, opts: { assigned?: boolean } = {}): T | null {
  const v = studentView(row);
  if (!v.changed) return row;
  if (v.empty) return null;
  if (!v.servable && !opts.assigned) return null;
  return v.row;
}

/** A list of rows through the door; the ones that may not be served drop out. */
export function studentRows<T extends object>(rows: readonly T[] | null | undefined): T[] {
  const out: T[] = [];
  for (const r of rows ?? []) { const s = studentRow(r); if (s) out.push(s); }
  return out;
}

/** True when this question must be treated like a legacy_syllabus one (serve-gate). */
export function partMarksBlockServing(row: object | null | undefined): boolean {
  if (!row || !hasPartMarks((row as PartMarkRow).parts)) return false;
  const v = studentView(row);
  return v.empty || !v.servable;
}

// ── setting and clearing a mark (the admin control and scripts/part-syllabus) ─

export interface MarkChange {
  /** `b`, `(b)(ii)`, `b.ii` … */
  part: string;
  /** true = out of syllabus; false = clear the mark. Omit to leave as is (when only `needs` changes). */
  legacy?: boolean;
  reason?: string;
  /** Parts this one depends on ("hence"). [] clears the list. Omit to leave as is. */
  needs?: string[];
}

export type MarkResult =
  | { ok: true; parts: unknown[]; view: StudentView<PartMarkRow> }
  | { ok: false; error: string };

/**
 * A new `parts` array with one part's mark set or cleared — every other key on every part
 * left exactly as it was. Refuses a question with no parts list (the feature cannot apply:
 * the parts live only inside question_text), an unknown or ambiguous label, a mark with no
 * reason, and a mark that would leave nothing to serve.
 */
export function applyPartMark(row: PartMarkRow, change: MarkChange): MarkResult {
  const src = Array.isArray(row?.parts) ? row.parts.filter(isObj) : [];
  if (!src.length) return { ok: false, error: 'This question has no parts list — the parts live only in its text, so one part cannot be marked. Mark the whole question instead.' };
  const key = parsePartRef(change.part);
  if (!key) return { ok: false, error: 'Which part? Give a label such as (b) or (b)(ii).' };
  const matches = flat(buildTree(src)).filter((n) => n.key === key);
  if (!matches.length) return { ok: false, error: `No part ${partRefLabel(key)} on this question.` };
  if (matches.length > 1) return { ok: false, error: `Two parts are labelled ${partRefLabel(key)} — fix the labels first.` };
  if (change.legacy === true && !str(change.reason).trim()) return { ok: false, error: 'A short reason is needed (what is out of syllabus).' };
  const needs = change.needs?.map(parsePartRef).filter(Boolean);
  if (needs) {
    const known = new Set(flat(buildTree(src)).map((n) => n.key));
    const bad = needs.find((k) => !known.has(k) || k === key);
    if (bad) return { ok: false, error: `"needs" names ${partRefLabel(bad)}, which is not another part of this question.` };
  }

  const target = matches[0].part;
  const rebuild = (ps: unknown): unknown[] => (Array.isArray(ps) ? ps : []).map((p) => {
    if (!isObj(p)) return p;
    const o: Obj = { ...p };
    if (Array.isArray(p.subparts)) o.subparts = rebuild(p.subparts);
    if (p === target) {
      if (change.legacy === true) { o.legacy = true; o.legacy_reason = str(change.reason).trim().slice(0, 200); }
      // A cleared mark is WRITTEN (`legacy: false`, `needs: []`), not removed: the keep-marks
      // trigger (migrations/part_syllabus_keep_marks.sql) restores a key the new part does not mention.
      if (change.legacy === false) { o.legacy = false; delete o.legacy_reason; }
      if (needs) o.needs = needs;
    }
    return o;
  });
  const parts = rebuild(src);
  const view = studentView({ ...row, parts });
  if (view.changed && view.empty) return { ok: false, error: 'That would hide every part. Mark the whole question out of syllabus instead.' };
  return { ok: true, parts, view };
}

/**
 * Parts AFTER the given one whose wording leans on it — "Hence…", "using part (b)". A
 * prompt for the person marking, never a decision: only a person can say whether the later
 * part can still be done alone.
 */
export function likelyDependents(parts: unknown, part: string): { key: string; label: string; why: string }[] {
  const key = parsePartRef(part);
  const all = flat(buildTree(parts));
  const at = all.findIndex((n) => n.key === key);
  if (at === -1) return [];
  const own = key.split('.').pop()!;
  const top = key.split('.')[0];
  const names = new RegExp(`\\(\\s*${own}\\s*\\)|part\\s+\\(?${own}\\)?\\b|\\(\\s*${top}\\s*\\)`, 'i');
  const out: { key: string; label: string; why: string }[] = [];
  for (const n of all.slice(at + 1)) {
    if (n.key.startsWith(`${key}.`)) continue;
    const text = maskMath(str(n.part.text));
    const hence = /\b(hence|deduce|using (your|the) (answer|result)|use your (answer|result))\b/i.exec(text);
    const next = all[all.indexOf(n) - 1];
    if (names.test(text)) out.push({ key: n.key, label: partRefLabel(n.key), why: `names ${partRefLabel(key)}` });
    else if (hence && (next?.key === key || next?.key.startsWith(`${key}.`))) out.push({ key: n.key, label: partRefLabel(n.key), why: `says "${hence[0]}" right after ${partRefLabel(key)}` });
  }
  return out;
}
