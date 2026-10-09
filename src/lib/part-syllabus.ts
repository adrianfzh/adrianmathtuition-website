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
//   - the parts that are left are RE-LETTERED for the student (Adrian, 9 Oct 2026: "shall
//     we rename (iii) to (ii)? so it does not look as weird? only for student facing"):
//     (i), (ii), (iii) with (ii) hidden shows (i), (ii). A level left with ONE part shows
//     no letter at all — its text flows after the stem. The stored row never changes, and
//     the view carries the map original label ⇄ shown label (`labels`);
//   - "using your answer to part (iii)" inside a remaining part, the stem, the answer or
//     the working is rewritten to the shown label; where that cannot be done with
//     confidence the view is `needsCheck` and the question is NOT served until a person
//     has read it and confirmed;
//   - a part that `needs` a hidden part ("hence, using (b)") is hidden with it; a later
//     part that LOOKS as if it depends on a hidden one (says "Hence", names it, its working
//     cites it) blocks serving until a person has said "needs it" or "stands alone";
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

/** The map between the labels stored in the bank and the labels a student is shown. Keys are path keys (`b.ii`). */
export interface PartLabels {
  /** original key → shown key, for every part still shown. `''` = no letter (the part became the question itself). */
  shown: Record<string, string>;
  /** shown key → original key (the innermost part when a lone sub-part took its parent's letter). */
  original: Record<string, string>;
  /** Only the parts whose label changed — what the admin view lists. `toLabel` is `''` when the letter went. */
  renames: { from: string; to: string; fromLabel: string; toLabel: string }[];
  /** `viewFingerprint` of the bank row this map was made from ('' when nothing was hidden). */
  fingerprint: string;
}

/** Something a person must read before the question is served; cleared by the admin "Confirm" control. */
export interface ViewCheck {
  code:
    | 'reference_unclear'   // text that may name a part whose letter changed or that is hidden — not rewritten
    | 'names_hidden'        // the stem names a hidden part
    | 'label_style'         // the labels are not a plain (a),(b) / (i),(ii) / 1,2 run, so they were not re-lettered
    | 'lone_part_kept';     // one part left at a level but it could not be folded in (it carries its own figure)
  /** The part whose text raised it (original label), when there is one. */
  part?: string;
  detail: string;
}

/** A later part that looks as if it depends on a hidden one and has not been reviewed. */
export interface Dependent { key: string; label: string; on: string; onLabel: string; why: string }

export interface StudentView<T> {
  /** What a student may be shown. The SAME object as the input when nothing is marked. */
  row: T;
  /** True when at least one part was removed. */
  changed: boolean;
  /** False when the question must not be served: too little left, or a person has yet to check it. */
  servable: boolean;
  /** False when fewer than 3 marks, or under half, are left (the threshold alone). */
  enoughLeft: boolean;
  /** True when nothing at all is left. */
  empty: boolean;
  hidden: HiddenPart[];
  originalMarks: number | null;
  marks: number | null;
  notes: ViewNote[];
  /** Original label ⇄ shown label. */
  labels: PartLabels;
  /** True while `dependents` is not empty, or `checks` is not empty and not confirmed. Never served. */
  needsCheck: boolean;
  checks: ViewCheck[];
  /** True when a person confirmed the checks on exactly this content (`checked` on the marked parts). */
  checksConfirmed: boolean;
  dependents: Dependent[];
  /** What "exactly this content" means: changes when the stem, any part, the answer or the working changes. */
  fingerprint: string;
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
  /** The label's letters/digits exactly as stored (case kept): `B` for `(B)`. */
  rawCore: string;
  parent: Node | null;
  children: Node[];
  /** Set by the label plan: the label a student sees (`null` = no letter — folded into its parent). */
  shownOwn?: string | null;
  /** Set by the label plan: the shown path key (`''` when folded into the question itself). */
  shownKey?: string;
}

function buildTree(parts: unknown): Node[] {
  const walk = (ps: unknown, parent: Node | null): Node[] => {
    if (!Array.isArray(ps)) return [];
    const out: Node[] = [];
    ps.forEach((p, i) => {
      if (!isObj(p)) return;
      const own = normLabel(p.label) || `#${i + 1}`;
      const node: Node = { part: p, key: parent ? `${parent.key}.${own}` : own, rawCore: String(p.label ?? '').replace(/[^A-Za-z0-9]/g, ''), parent, children: [] };
      node.children = walk(p.subparts, node);
      out.push(node);
    });
    return out;
  };
  return walk(parts, null);
}

const flat = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...flat(n.children)]);
const ownOf = (n: Node): string => n.key.split('.').pop()!;
const depthOf = (key: string): number => key.split('.').length;

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

function hiddenMap(all: Node[]): { hid: Map<Node, { via: HiddenVia; reason: string }>; unknownNeeds: boolean } {
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
  if (!hid.size) return { hid, unknownNeeds: false };

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
  return { hid, unknownNeeds };
}

/**
 * Which parts a student never sees, and why. Order: marked parts → everything inside them →
 * parts that `need` a hidden part → parents left with nothing inside; repeated until stable.
 */
export function hiddenParts(parts: unknown): { hidden: HiddenPart[]; unknownNeeds: boolean } {
  const all = flat(buildTree(parts));
  const { hid, unknownNeeds } = hiddenMap(all);
  const hidden: HiddenPart[] = all.filter((n) => hid.has(n)).map((n) => {
    const h = hid.get(n)!;
    const leaf = !n.children.some(subtreeHasMarks);
    return { key: n.key, label: partRefLabel(n.key), reason: h.reason, via: h.via, marks: leaf ? (num(n.part.marks) ?? 0) : 0 };
  });
  return { hidden, unknownNeeds };
}

// ── labels: the style of a run of siblings, and the next letter in it ─────────

type LabelStyle = 'alpha' | 'roman' | 'numeric';
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
function seqLabel(style: LabelStyle, i: number): string | null {
  if (style === 'alpha') return i < 26 ? String.fromCharCode(97 + i) : null;
  if (style === 'roman') return ROMAN[i] ?? null;
  return String(i + 1);
}
/**
 * The style a run of sibling labels is written in — read off the siblings, never assumed:
 * (a),(b),(c) / (i),(ii),(iii) / 1,2,3. Null when the run is anything else ("a-i", "b(ii)",
 * a gap, a repeat): such a run is not re-lettered.
 */
export function labelStyle(labels: string[]): LabelStyle | null {
  if (!labels.length) return null;
  for (const style of ['alpha', 'roman', 'numeric'] as const) {
    if (labels.every((l, i) => l === seqLabel(style, i))) return style;
  }
  return null;
}
/** The stored label with its letters swapped: `(B)` + `a` → `(A)`; `ii` + `i` → `i`. */
function reLabel(raw: unknown, core: string): string {
  const s = String(raw ?? '');
  const m = s.match(/[A-Za-z0-9]+/);
  if (!m) return core;
  const upper = /[A-Z]/.test(m[0]) && m[0] === m[0].toUpperCase();
  return s.slice(0, m.index!) + (upper ? core.toUpperCase() : core) + s.slice(m.index! + m[0].length);
}

// ── maths is never read as a label ────────────────────────────────────────────

/** Blank out `$…$` / `$$…$$` / `\(…\)` / `\[…\]` so a label inside maths — f(x), (i) as a root — is never read as a part label. Length is kept. */
function maskMath(s: string): string {
  return s.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, (m) => ' '.repeat(m.length));
}

// ── answer line / worked solution: drop the hidden parts' share ──────────────

export interface Leaf {
  key: string;
  tokens: string[];
  hidden: boolean;
  /** The label to write in front of this part's share: `(b)(ii)`, or `''` for no label. Default: its own full label. */
  shown?: string;
  /** A "show that" / "prove" part: the line may simply leave it out. */
  optional?: boolean;
}

// A part label as the bank spells it: "(b)(i)", "(b) (i)", "(bi)", "b(i)", "bi)", "b)", with an
// optional "Part " in front and ":" behind. Surveyed on the live `answer` column, 9 Oct 2026.
const LABEL_RUN = String.raw`(?:\(\s*[a-z0-9]{1,5}\s*\)|(?<!\()[a-z0-9]{1,4}\)|[a-z](?=\())(?:[ \t]?\(\s*[a-z0-9]{1,4}\s*\))*`;
// Built on first use, not at load: these use a look-behind, and this module is also bundled
// for two admin pages — an old browser must not fail to load the page over a pattern that
// only ever runs on a question with a marked part.
const lazy = (src: string, flags: string) => { let r: RegExp | null = null; return () => (r ??= new RegExp(src, flags)); };
const INLINE_LABEL = lazy(String.raw`(?<![a-z0-9\\)\]}_^])(part\s+)?(${LABEL_RUN})(\s*:)?`, 'gi');
const LINE_LABEL = lazy(String.raw`^([ \t]*(?:[#>*_]|\s)*)(part\s+)?(${LABEL_RUN})(\s*:)?`, 'gim');

/**
 * Split a text that names its parts — "(a) …; (b)(i) …; (ii) …", "(a) … (bi) … (bii) …" — drop the
 * hidden parts' segments and write each remaining one under the label a student is shown.
 * Every leaf part must be found, in order (an `optional` one may be absent), or the answer
 * is null — the caller then withholds the text rather than show a hidden part's share.
 * `lineStart` = accept a label only at the start of a line (worked solutions, where
 * "from part (i)" inside a sentence must not be read as a heading).
 */
export function dropHiddenSegments(text: string, leaves: Leaf[], lineStart = false, body?: (seg: string, leaf: Leaf) => string): string | null {
  if (!leaves.length) return null;
  const masked = maskMath(text);
  type Mark = { at: number; labelAt: number; end: number; tokens: string[]; part: string; colon: string };
  const marks: Mark[] = [];
  for (const m of masked.matchAll(lineStart ? LINE_LABEL() : INLINE_LABEL())) {
    const [partWord, run, colon] = lineStart ? [m[2], m[3], m[4]] : [m[1], m[2], m[3]];
    const tokens = (run.match(/[a-z0-9]+/gi) || []).map((t) => t.toLowerCase());
    let at = m.index ?? 0;
    let pre = lineStart ? m[1].length : 0;
    // "**(c)** 4": the bold opens before the label and belongs to it.
    if (!lineStart && /(\*\*|__)$/.test(text.slice(0, at))) { at -= 2; pre = 2; }
    marks.push({ at, labelAt: at + pre, end: (m.index ?? 0) + m[0].length, tokens, part: partWord ? text.slice(at + pre, at + pre + partWord.length) : '', colon: colon || '' });
  }
  // Each leaf, in order, must open at a marker: its full path "(b)(ii)", the two run together
  // "(bii)", or — right after a sibling — its own label alone "(ii)".
  const found: (Mark | null)[] = [];
  let mi = 0;
  let prevParent = '';
  for (const leaf of leaves) {
    const own = leaf.tokens[leaf.tokens.length - 1];
    const parentKey = leaf.tokens.slice(0, -1).join('.');
    let hit = -1;
    for (let j = mi; j < marks.length; j++) {
      const t = marks[j].tokens;
      const full = t.length === leaf.tokens.length && t.every((x, k) => x === leaf.tokens[k]);
      const fused = leaf.tokens.length > 1 && t.length === 1 && t[0] === leaf.tokens.join('');
      const short = leaf.tokens.length > 1 && parentKey === prevParent && t.length === 1 && t[0] === own;
      if (full || fused || short) { hit = j; break; }
    }
    prevParent = parentKey;
    if (hit === -1) {
      if (leaf.optional) { found.push(null); continue; }
      return null;
    }
    found.push(marks[hit]);
    mi = hit + 1;
  }
  const starts = found.filter((f): f is Mark => !!f).map((f) => f.at);
  if (!starts.length) return null;
  const head = text.slice(0, starts[0]);
  const out: string[] = [];
  leaves.forEach((leaf, i) => {
    const mk = found[i];
    if (!mk || leaf.hidden) return;
    const next = starts.find((s) => s > mk.at) ?? text.length;
    const label = leaf.shown ?? partRefLabel(leaf.key);
    let rest = text.slice(mk.end, next);
    if (body) rest = body(rest, leaf);
    const lead = text.slice(mk.at, mk.labelAt);
    out.push(label ? `${lead}${mk.part}${label}${mk.colon}${rest}` : `${lead}${rest.replace(/^[ \t]+/, '')}`);
  });
  if (!out.length) return '';
  return (head + out.join(''))
    .replace(/\*\*[ \t]*\*\*[ \t]*\n*/g, '')        // a bold heading whose label went: "****"
    .replace(/[\s;,]+$/g, '').replace(/^[\s;,]+/g, '');
}

/** A part that asks for an argument, not a value: the answer line may leave it out. */
function showType(part: Obj): boolean {
  return /\b(show|prove|verify|explain|justify|sketch|draw|deduce that)\b/i.test(maskMath(str(part.text)));
}

function rebuildAnswer(built: Obj[]): string | null {
  const bits: string[] = [];
  const walk = (ps: Obj[], prefix: string): boolean => {
    for (const p of ps) {
      const own = str(p.answer).trim();
      const lab = normLabel(p.label);
      const here = lab ? `${prefix}(${lab})` : prefix;
      const kids = Array.isArray(p.subparts) ? (p.subparts as Obj[]).filter(isObj) : [];
      const put = () => bits.push(here ? `${here} ${own}` : own);
      if (kids.length) {
        // A parent's own answer is kept when it has one; its sub-parts must each have theirs.
        if (own && !kids.some((c) => str(c.answer).trim())) { put(); continue; }
        if (!walk(kids, here)) return false;
      } else if (own) put();
      else if (!showType(p)) return false;      // a "show that" part contributes nothing; any other gap fails the line
    }
    return true;
  };
  return walk(built, '') && bits.length ? bits.join('; ') : null;
}

const hasPartSolutions = (ns: Node[]): boolean =>
  ns.some((n) => str(n.part.solution).trim() !== '' || hasPartSolutions(n.children));
const everyLeafHasSolution = (ps: Obj[]): boolean =>
  ps.every((p) => {
    const kids = Array.isArray(p.subparts) ? (p.subparts as Obj[]).filter(isObj) : [];
    return kids.length && !str(p.solution).trim() ? everyLeafHasSolution(kids) : str(p.solution).trim() !== '';
  });

/** Fields on the row that show the whole question as one picture or one stored line. */
const WHOLE_QUESTION_FIELDS = ['question_image_url', 'question_with_answer_image_url', 'solution_image_url', 'hint'] as const;
/** Keys that exist only for this feature — never part of what a student's browser receives. */
const MARK_KEYS = ['legacy', 'legacy_reason', 'needs', 'needs_cleared', 'checked'] as const;
/** Keys of a part that fold cleanly into its parent or into the question. */
const CORE_KEYS = new Set<string>(['label', 'text', 'marks', 'answer', 'solution', 'subparts', ...MARK_KEYS]);
const SOLUTION_IMAGE_KEYS = ['solution_image_before', 'solution_image', 'solution_image_after', 'solution_images'] as const;
const blank = (v: unknown): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

export interface PartMarkRow {
  parts?: unknown;
  total_marks?: unknown;
  question_text?: unknown;
  answer?: unknown;
  solution?: unknown;
  solution_images?: unknown;
  [k: string]: unknown;
}

// ── the label map travels with the row, out of sight ─────────────────────────
// A symbol key: copied by `{ ...row }`, never written by JSON.stringify, so it reaches a
// server-side caller (the grader, a print log) and never a student's browser.
const LABELS = Symbol.for('part-syllabus.labels');
const NO_LABELS: PartLabels = Object.freeze({ shown: Object.freeze({}), original: Object.freeze({}), renames: Object.freeze([]) as never, fingerprint: '' }) as PartLabels;

/** The label map of a row that came out of the door (empty for a row nothing was hidden on). */
export function partLabelsOf(row: unknown): PartLabels {
  const l = isObj(row) ? (row as Record<symbol, unknown>)[LABELS] : null;
  return (l as PartLabels) || NO_LABELS;
}
/** Hand the label map on to an object built from a door row (a pool item, a sheet question) — still out of sight of JSON. */
export function carryPartLabels<T extends object>(target: T, source: unknown): T {
  const l = partLabelsOf(source);
  if (hasRenames(l)) Object.defineProperty(target, LABELS, { value: l, enumerable: true, configurable: true });
  return target;
}

/** One row of the print record (table `part_label_prints`): what the student's page called each part. */
export interface PrintedLabelRow { surface: string; ref: string | null; student: string | null; question_id: string; labels: Record<string, string>; fingerprint: string }
/**
 * The print record for a sheet: one row per question whose letters differ from the bank's.
 * A sheet handed in later is marked against THIS, never against the bank as it stands that
 * day — a mark set or cleared after printing cannot move a letter under a student's answer.
 */
export function printedLabelRows(meta: { surface: string; ref?: string | null; student?: string | null }, items: readonly { id?: unknown }[]): PrintedLabelRow[] {
  const out: PrintedLabelRow[] = [];
  for (const it of items) {
    const l = partLabelsOf(it);
    if (!hasRenames(l) || typeof it.id !== 'string') continue;
    out.push({ surface: meta.surface, ref: meta.ref ?? null, student: meta.student ?? null, question_id: it.id, labels: { ...l.original }, fingerprint: l.fingerprint });
  }
  return out;
}

/** True when a student sees at least one part under another letter than the bank's. */
export const hasRenames = (labels: PartLabels | null | undefined): boolean => !!labels && labels.renames.length > 0;
/** GOING OUT: the bank's label → what the student is shown. `(b)(iii)` → `(b)(ii)`; `''` when the letter went. */
export function shownPartLabel(labels: PartLabels | null | undefined, ref: unknown): string {
  const key = parsePartRef(ref);
  const to = labels && Object.prototype.hasOwnProperty.call(labels.shown, key) ? labels.shown[key] : key;
  return partRefLabel(to);
}
/** COMING IN: what the student wrote → the bank's part key. `(b)(ii)` → `b.iii`. A label that was never changed maps to itself. */
export function originalPartKey(labels: PartLabels | null | undefined, ref: unknown): string {
  const key = parsePartRef(ref);
  return labels && Object.prototype.hasOwnProperty.call(labels.original, key) ? labels.original[key] : key;
}
/**
 * The same, for an attempt, a print or an assignment that STORED the map it was shown with
 * (`{ shown-key: original-key }`). Nothing stored → the labels are the bank's own, which is
 * what every attempt made before re-lettering was marked against.
 */
export function storedOriginalKey(stored: unknown, ref: unknown): string {
  const key = parsePartRef(ref);
  return isObj(stored) && typeof stored[key] === 'string' ? (stored[key] as string) : key;
}

// ── fingerprint: "a person confirmed exactly this" ───────────────────────────

function hashText(s: string): string {
  let h1 = 0xdeadbeef; let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
/** Changes when the stem, any part (text, label, marks, answer, working, its mark), the answer or the working changes. */
export function viewFingerprint(row: PartMarkRow): string {
  const strip = (ps: unknown): unknown => (Array.isArray(ps) ? ps.map((p) => {
    if (!isObj(p)) return p;
    const o: Obj = {};
    for (const k of Object.keys(p).sort()) if (k !== 'checked') o[k] = k === 'subparts' ? strip(p[k]) : p[k];
    return o;
  }) : null);
  return hashText(JSON.stringify([str(row?.question_text), strip(row?.parts), str(row?.answer), str(row?.solution)]));
}

// ── naming a part inside a sentence ──────────────────────────────────────────

const REF_RUN = lazy(String.raw`(?<![A-Za-z0-9\\)\]}_^])((?:\((?:[A-Za-z]{1,4}|\d{1,2})\)[ \t]?){1,3})`, 'g');
const REF_BARE_AFTER_PART = /\bparts?\s+([A-Za-z]|[ivxIVX]{1,4}|\d)(?:\(([ivx]{1,4})\))?(?![A-Za-z0-9(])/g;
const STRONG_CUE = /(?:\bparts?|\banswers?\s+(?:to|in|from|for)|\bresults?\s+(?:of|in|from|to)|\b(?:shown|found|obtained|given|proved)\s+in)\s*$/i;
const WEAK_CUE = /\b(?:in|from|using|use|by|see|with)\s*$/i;
const CONNECTOR = /^\s*(?:,|and|or|&|to|,\s*(?:and|or))\s*$/i;

interface RefHit { at: number; end: number; tokens: string[]; target: Node; cue: 'strong' | 'weak' | 'chain' | 'none'; listed: boolean }

/** Every place a text may name a part of this question, resolved from where the text sits. */
function findRefs(text: string, ctx: Node | null, all: Node[]): RefHit[] {
  if (!text || !/[()]|\bpart/i.test(text)) return [];
  const masked = maskMath(text);
  const byPath = new Map<string, Node>();
  for (const n of all) {
    const path: string[] = []; for (let x: Node | null = n; x; x = x.parent) path.unshift(x.rawCore);
    if (path.every(Boolean)) byPath.set(path.join('.'), n);
  }
  const pathOf = (n: Node): string => { const p: string[] = []; for (let x: Node | null = n; x; x = x.parent) p.unshift(x.rawCore); return p.join('.'); };
  const resolve = (tokens: string[]): Node | null => {
    const tail = tokens.join('.');
    // From where the text sits, outward: its own sub-parts, its siblings, its parent's siblings … the top level.
    for (let scope: Node | null = ctx; ; scope = scope.parent) {
      const hit = byPath.get(scope ? `${pathOf(scope)}.${tail}` : tail);
      if (hit) return hit;
      if (!scope) break;
    }
    // A text with no place of its own (the stem): a label only one part carries.
    const ends = [...byPath.entries()].filter(([p]) => p === tail || p.endsWith(`.${tail}`));
    return ends.length === 1 ? ends[0][1] : null;
  };
  const raw: { at: number; end: number; tokens: string[]; strong: boolean }[] = [];
  for (const m of masked.matchAll(REF_RUN())) {
    const run = m[1].replace(/[ \t]+$/, '');
    raw.push({ at: m.index!, end: m.index! + run.length, tokens: run.match(/[A-Za-z0-9]+/g) || [], strong: false });
  }
  for (const m of masked.matchAll(REF_BARE_AFTER_PART)) {
    const at = m.index! + m[0].match(/^parts?\s+/i)![0].length;
    raw.push({ at, end: m.index! + m[0].length, tokens: [m[1], ...(m[2] ? [m[2]] : [])], strong: true });
  }
  raw.sort((a, b) => a.at - b.at);
  const hits: RefHit[] = [];
  for (const r of raw) {
    const target = resolve(r.tokens);
    if (!target) continue;
    const before = masked.slice(0, r.at);
    const prev = hits[hits.length - 1];
    let cue: RefHit['cue'] = 'none';
    if (r.strong || STRONG_CUE.test(before)) cue = 'strong';
    else if (prev && prev.cue !== 'none' && !prev.listed && CONNECTOR.test(masked.slice(prev.end, r.at))) cue = 'chain';
    else if (WEAK_CUE.test(before)) cue = 'weak';
    hits.push({ at: r.at, end: r.end, tokens: r.tokens, target, cue, listed: false });
  }
  // "(i) x > 0, (ii) x < 0" inside one text is a list of its own, not a pair of part names:
  // uncued single labels that run on from the first of their kind.
  const bare = hits.filter((h) => h.cue === 'none' && h.tokens.length === 1);
  for (let i = 0; i < bare.length;) {
    const first = bare[i].tokens[0].toLowerCase();
    const style = (['alpha', 'roman', 'numeric'] as const).find((s) => seqLabel(s, 0) === first);
    let j = i + 1;
    if (style) while (j < bare.length && bare[j].tokens[0].toLowerCase() === seqLabel(style, j - i)) j++;
    if (style && j - i >= 2) for (let k = i; k < j; k++) bare[k].listed = true;
    i = Math.max(j, i + 1);
  }
  return hits;
}

/**
 * THE DOOR. A bank row in, what a student may see out — plus what was hidden and why
 * (for the admin view). Nothing marked → `row` is the very same object.
 */
export function studentView<T extends object>(input: T): StudentView<T> {
  const row = input as T & PartMarkRow;
  const untouched = (): StudentView<T> => {
    const m = num(row?.total_marks);
    return {
      row: input, changed: false, servable: true, enoughLeft: true, empty: false, hidden: [], originalMarks: m, marks: m, notes: [],
      labels: NO_LABELS, needsCheck: false, checks: [], checksConfirmed: false, dependents: [], fingerprint: '',
    };
  };
  if (!row || !hasPartMarks(row.parts)) return untouched();

  const roots = buildTree(row.parts);
  const all = flat(roots);
  const { hid, unknownNeeds } = hiddenMap(all);
  const { hidden } = hiddenParts(row.parts);
  const isHidden = (n: Node) => hid.has(n);
  const notes = new Set<ViewNote>();
  if (unknownNeeds) notes.add('unknown_needs');
  const checks: ViewCheck[] = [];
  const addCheck = (c: ViewCheck) => { if (!checks.some((x) => x.code === c.code && x.part === c.part && x.detail === c.detail)) checks.push(c); };

  // ── marks ──
  const before = roots.map((r) => nodeMarks(r));
  const after = roots.map((r) => nodeMarks(r, isHidden));
  const sumBefore = before.reduce((a, r) => a + r.marks, 0);
  const sumAfter = after.reduce((a, r) => a + r.marks, 0);
  const hiddenMarks = sumBefore - sumAfter;
  const hiddenUnknown = all.some((n) => isHidden(n) && !n.children.length && num(n.part.marks) === null
    && !(n.parent && isHidden(n.parent) && num(n.parent.part.marks) !== null && !n.parent.children.some(subtreeHasMarks)));
  const stored = num(row.total_marks);
  const originalMarks = stored ?? (sumBefore > 0 ? sumBefore : null);
  let marks: number | null;
  if (originalMarks !== null && !hiddenUnknown) marks = Math.max(0, originalMarks - hiddenMarks);
  else if (sumAfter > 0 && !after.some((r) => r.unknown)) marks = sumAfter;
  else marks = null;
  if (marks === null || hiddenUnknown) notes.add('marks_unknown');

  // ── the label plan: what each remaining part is called for the student ──
  // Only a level that LOST a part is touched. More than one left → re-lettered in the run's
  // own style. One left → it loses its letter and folds into its parent (or the question).
  const canFold = (parent: Node | null, child: Node): boolean => {
    const extra = Object.keys(child.part).filter((k) => !CORE_KEYS.has(k) && !blank(child.part[k]));
    if (parent) return extra.every((k) => blank(parent.part[k]) || JSON.stringify(parent.part[k]) === JSON.stringify(child.part[k]));
    if (child.children.some((c) => !isHidden(c))) return !extra.length && !str(child.part.answer).trim() && !str(child.part.solution).trim();
    return extra.every((k) => (SOLUTION_IMAGE_KEYS as readonly string[]).includes(k));
  };
  const plan = (nodes: Node[], parent: Node | null, parentShown: string) => {
    const rem = nodes.filter((n) => !isHidden(n));
    const lost = rem.length < nodes.length;
    const style = lost ? labelStyle(nodes.map(ownOf)) : null;
    let fold = false;
    if (lost && rem.length === 1) {
      fold = canFold(parent, rem[0]);
      if (!fold) addCheck({ code: 'lone_part_kept', part: partRefLabel(rem[0].key), detail: `${partRefLabel(rem[0].key)} is the only part left at its level but carries its own figure, so it keeps a letter` });
    }
    rem.forEach((n, i) => {
      if (fold) { n.shownOwn = null; n.shownKey = parentShown; }
      else {
        let core = ownOf(n);
        let raw: unknown = n.part.label;
        const next = lost && style ? seqLabel(style, i) : null;
        if (next && next !== core) { core = next; raw = reLabel(n.part.label, next); }
        else if (lost && !style && nodes.indexOf(n) !== i) {
          addCheck({ code: 'label_style', part: partRefLabel(n.key), detail: `the labels beside ${partRefLabel(n.key)} are not a plain (a), (b) / (i), (ii) / 1, 2 run, so they keep their stored letters` });
        }
        n.shownOwn = raw === undefined || raw === null ? '' : String(raw);
        n.shownKey = parentShown ? `${parentShown}.${core}` : core;
      }
      plan(n.children, n, n.shownKey!);
    });
  };
  plan(roots, null, '');

  const remaining = all.filter((n) => !isHidden(n));
  const fingerprint = viewFingerprint(row);
  const labels: PartLabels = { shown: {}, original: {}, renames: [], fingerprint };
  for (const n of remaining) {
    labels.shown[n.key] = n.shownKey!;
    labels.original[n.shownKey!] = n.key;      // document order: the innermost part wins a shared key
    if (n.shownKey !== n.key) labels.renames.push({ from: n.key, to: n.shownKey!, fromLabel: partRefLabel(n.key), toLabel: partRefLabel(n.shownKey!) });
  }

  // ── part names inside sentences: rewrite to the shown label, or ask a person ──
  const cleared = (n: Node, target: Node): boolean => (Array.isArray(n.part.needs_cleared) ? n.part.needs_cleared : [])
    .map(parsePartRef).some((k) => k && (k === target.key || target.key.startsWith(`${k}.`) || k.startsWith(`${target.key}.`)));
  const named: Dependent[] = [];
  const snippet = (text: string, at: number, end: number) => text.slice(Math.max(0, at - 30), Math.min(text.length, end + 20)).replace(/\s+/g, ' ').trim();
  const rewrite = (text: string, ctx: Node | null, where: string, kind = 'text'): string => {
    const hits = findRefs(text, ctx, all);
    if (!hits.length) return text;
    let out = '';
    let last = 0;
    for (const h of hits) {
      const t = h.target;
      const self = t === ctx;
      const heading = self && !text.slice(0, h.at).replace(/[#>*_\s]/g, '');   // a part's own label at the head of its own text
      const isRef = h.cue !== 'none' || heading;
      const gone = isHidden(t);
      const moved = !gone && t.shownKey !== t.key;
      if (h.listed || (!gone && !moved)) continue;
      if (!isRef) {
        addCheck({ code: 'reference_unclear', part: ctx ? partRefLabel(ctx.key) : undefined, detail: `${where}: “…${snippet(text, h.at, h.end)}…” may name ${partRefLabel(t.key)}, ${gone ? 'which is hidden' : `shown as ${partRefLabel(t.shownKey!) || 'the question itself'}`}` });
        continue;
      }
      if (gone) {
        // A remaining part that names a hidden one depends on it. Not rewritten; a person decides.
        if (ctx && !isHidden(ctx)) { if (!cleared(ctx, t)) named.push({ key: ctx.key, label: partRefLabel(ctx.key), on: t.key, onLabel: partRefLabel(t.key), why: `its ${kind} names ${partRefLabel(t.key)}` }); }
        else addCheck({ code: 'names_hidden', detail: `${where}: “…${snippet(text, h.at, h.end)}…” names ${partRefLabel(t.key)}, which is hidden` });
        continue;
      }
      const shown = t.shownKey!.split('.').filter(Boolean);
      // Written in full "(b)(iii)" → the full shown path; written short "(iii)" → the shown letter alone,
      // unless the part folded into its parent, whose letter then names it.
      const full = h.tokens.length === depthOf(t.key);
      const use = full || t.shownOwn === null ? shown : shown.slice(-h.tokens.length);
      if (!use.length) {
        addCheck({ code: 'reference_unclear', part: ctx ? partRefLabel(ctx.key) : undefined, detail: `${where}: “…${snippet(text, h.at, h.end)}…” names ${partRefLabel(t.key)}, which no longer has a letter` });
        continue;
      }
      const upper = h.tokens.every((x) => x === x.toUpperCase() && /[A-Z]/.test(x));
      out += text.slice(last, h.at) + use.map((x) => `(${upper ? x.toUpperCase() : x})`).join('');
      last = h.end;
    }
    return out + text.slice(last);
  };

  // ── parts: drop the hidden ones, re-letter, fold a lone part in, strip the mark keys ──
  const foldInto = (p: Obj, c: Obj): Obj => {
    const o: Obj = { ...p };
    const pt = str(p.text).trim(); const ct = str(c.text).trim();
    o.text = pt && ct ? `${str(p.text).replace(/\s+$/, '')}\n\n${ct}` : (pt ? p.text : c.text);
    if (num(c.marks) !== null) o.marks = c.marks;
    if (str(c.answer).trim()) o.answer = c.answer;
    if (str(c.solution).trim()) o.solution = str(p.solution).trim() ? `${str(p.solution).replace(/\s+$/, '')}\n\n${str(c.solution)}` : c.solution;
    if (Array.isArray(c.subparts) && c.subparts.length) o.subparts = c.subparts; else delete o.subparts;
    for (const k of Object.keys(c)) if (!CORE_KEYS.has(k) && blank(o[k])) o[k] = c[k];
    return o;
  };
  const build = (ns: Node[]): Obj[] => ns.filter((n) => !isHidden(n)).map((n) => {
    let o: Obj = { ...n.part };
    for (const k of MARK_KEYS) delete o[k];
    const at = partRefLabel(n.key);
    if (typeof o.text === 'string') o.text = rewrite(o.text, n, `${at} text`);
    if (typeof o.answer === 'string') o.answer = rewrite(o.answer, n, `${at} answer`, 'answer');
    if (typeof o.solution === 'string') o.solution = rewrite(o.solution, n, `${at} working`, 'working');
    if (n.shownOwn === null) delete o.label;      // folded into its parent: no letter of its own
    else if (n.shownOwn !== undefined && 'label' in n.part) o.label = n.shownOwn;
    if (n.children.length) {
      const kids = build(n.children);
      const lone = n.children.find((c) => !isHidden(c) && c.shownOwn === null);
      // A parent's figure that merely repeats its sub-parts' sum follows the sub-parts left.
      const own = num(n.part.marks);
      if (own !== null && n.children.some(subtreeHasMarks)) {
        const left = nodeMarks(n, isHidden).marks;
        if (left > 0) o.marks = left; else delete o.marks;
      }
      if (lone && kids.length === 1) o = foldInto(o, kids[0]);
      else o.subparts = kids;
    }
    return o;
  });
  const built = build(roots);
  const empty = built.length === 0;
  const loneRoot = roots.find((r) => !isHidden(r) && r.shownOwn === null) ?? null;   // the one top-level part left: it becomes the question

  // ── answer line ──
  const leaves: Leaf[] = all.filter((n) => !n.children.length).map((n) => ({
    key: n.key, tokens: n.key.split('.'), hidden: isHidden(n),
    shown: isHidden(n) ? undefined : partRefLabel(n.shownKey!),
    optional: showType(n.part),
  }));
  const nodeOf = new Map(all.map((n) => [n.key, n]));
  const out: Obj = { ...row, parts: built, total_marks: marks };
  if (typeof row.question_text === 'string') out.question_text = rewrite(row.question_text, null, 'the stem');
  if (typeof row.answer === 'string' && row.answer.trim()) {
    // The stored line is the curated key: keep its wording when it splits cleanly by label;
    // otherwise build one from the remaining parts' own answers.
    let line = dropHiddenSegments(row.answer, leaves, false, (seg, leaf) => rewrite(seg, nodeOf.get(leaf.key) ?? null, `the answer line at ${partRefLabel(leaf.key)}`, 'answer'));
    // Belt and braces: a hidden part's own answer must not have ridden along inside a neighbour's share.
    if (line) {
      const squash = (s: string) => s.replace(/[\s$]/g, '');
      const kept = remaining.map((n) => squash(str(n.part.answer)));
      const leak = all.some((n) => isHidden(n) && squash(str(n.part.answer)).length >= 8
        && squash(line!).includes(squash(str(n.part.answer))) && !kept.some((k) => k.includes(squash(str(n.part.answer)))));
      if (leak) line = null;
    }
    const rebuilt = line ?? rebuildAnswer(built);
    if (rebuilt === null) { out.answer = null; notes.add('answer_withheld'); } else out.answer = rebuilt || null;
  }

  // ── worked solution ──
  if (typeof row.solution === 'string' && row.solution.trim()) {
    if (hasPartSolutions(roots) && (empty || everyLeafHasSolution(built))) {
      out.solution = null;   // the per-part working is the source of truth (lib/solution-rollup)
    } else {
      const split = dropHiddenSegments(row.solution, leaves.map((l) => ({ ...l, optional: false })), true,
        (seg, leaf) => rewrite(seg, nodeOf.get(leaf.key) ?? null, `the working at ${partRefLabel(leaf.key)}`, 'working'));
      if (split === null) { out.solution = null; notes.add('solution_withheld'); } else out.solution = split || null;
    }
  }
  // Whole-question solution pictures cannot be tied to a part: withhold them all.
  const si = row.solution_images;
  const hasSi = Array.isArray(si) ? si.length > 0 : typeof si === 'string' && si.trim() !== '' && si.trim() !== '[]';
  if (hasSi) { out.solution_images = Array.isArray(si) ? [] : null; notes.add('solution_images_withheld'); }
  for (const k of WHOLE_QUESTION_FIELDS) if (k in out && out[k]) out[k] = null;

  // ── one top-level part left: it IS the question now — no letter, no parts list ──
  if (loneRoot && built.length === 1) {
    const c = built[0];
    const stem = str(out.question_text).trim(); const ct = str(c.text).trim();
    out.question_text = stem && ct ? `${str(out.question_text).replace(/\s+$/, '')}\n\n${ct}` : (stem ? out.question_text : str(c.text));
    const kids = Array.isArray(c.subparts) ? (c.subparts as Obj[]) : [];
    out.parts = kids;
    if (!kids.length) {
      if (!str(out.answer).trim() && str(c.answer).trim()) { out.answer = c.answer; notes.delete('answer_withheld'); }
      if (str(c.solution).trim()) { out.solution = c.solution; notes.delete('solution_withheld'); }
      const pics: string[] = [];
      for (const k of SOLUTION_IMAGE_KEYS) {
        const v = c[k];
        if (typeof v === 'string' && v.trim()) pics.push(v.trim());
        else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string' && x.trim()) pics.push(x.trim());
      }
      if (pics.length) out.solution_images = typeof si === 'string' ? JSON.stringify(pics) : pics;
    }
  }

  // ── later parts that look as if they need a hidden one — a person must have decided ──
  const dependents: Dependent[] = [];
  const addDep = (d: Dependent) => { if (!dependents.some((x) => x.key === d.key && x.on === d.on)) dependents.push(d); };
  for (const [n, h] of hid) {
    if (h.via !== 'marked' && h.via !== 'needs') continue;
    for (const d of likelyDependents(row.parts, n.key)) {
      const dn = nodeOf.get(d.key);
      if (!dn || isHidden(dn) || cleared(dn, n)) continue;
      addDep({ key: d.key, label: d.label, on: n.key, onLabel: partRefLabel(n.key), why: d.why });
    }
  }
  for (const d of named) addDep(d);

  const markedNodes = all.filter((n) => n.part.legacy === true);
  const checksConfirmed = checks.length > 0 && markedNodes.every((n) => n.part.checked === fingerprint);
  const needsCheck = !empty && (dependents.length > 0 || (checks.length > 0 && !checksConfirmed));

  const enoughLeft = !empty && (marks === null
    || (marks >= MIN_REMAINING_MARKS && (originalMarks === null || marks >= originalMarks * MIN_REMAINING_SHARE)));
  const servable = enoughLeft && !needsCheck;

  Object.defineProperty(out, LABELS, { value: labels, enumerable: true });
  return { row: out as T, changed: true, servable, enoughLeft, empty, hidden, originalMarks, marks, notes: [...notes], labels, needsCheck, checks, checksConfirmed, dependents, fingerprint };
}

/**
 * What every student surface calls: the student's row, or null when the question must not
 * be served (too little left). `assigned` = the tutor put this question on the student's
 * own list — it is still shown with its hidden parts removed, however little is left,
 * unless nothing is left at all (mirrors serve-gate's rule for legacy_syllabus).
 * A view that still needs a person's check is never served, assigned or not.
 */
export function studentRow<T extends object>(row: T, opts: { assigned?: boolean } = {}): T | null {
  const v = studentView(row);
  if (!v.changed) return row;
  if (v.empty || v.needsCheck) return null;
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
/** True when not even a question on the student's own list may be shown: nothing left, or a person has yet to check it. */
export function partMarksBlockAlways(row: object | null | undefined): boolean {
  if (!row || !hasPartMarks((row as PartMarkRow).parts)) return false;
  const v = studentView(row);
  return v.empty || v.needsCheck;
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
  /** Hidden parts a person says this one does NOT need ("stands alone"). [] clears the list. Omit to leave as is. */
  cleared?: string[];
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
  const known = new Set(flat(buildTree(src)).map((n) => n.key));
  const needs = change.needs?.map(parsePartRef).filter(Boolean);
  const clearedList = change.cleared?.map(parsePartRef).filter(Boolean);
  for (const [name, list] of [['needs', needs], ['stands alone', clearedList]] as const) {
    const bad = list?.find((k) => !known.has(k) || k === key);
    if (bad) return { ok: false, error: `"${name}" names ${partRefLabel(bad)}, which is not another part of this question.` };
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
      if (change.legacy === false) { o.legacy = false; delete o.legacy_reason; o.checked = ''; }
      if (needs) o.needs = needs;
      if (clearedList) o.needs_cleared = clearedList;
    }
    return o;
  });
  const parts = rebuild(src);
  const view = studentView({ ...row, parts });
  if (view.changed && view.empty) return { ok: false, error: 'That would hide every part. Mark the whole question out of syllabus instead.' };
  return { ok: true, parts, view };
}

/**
 * "I have read what students get, and it is right" — stamps every marked part with the
 * fingerprint of the row as it stands. Any later change to the stem, a part, the answer or
 * the working changes the fingerprint, and the question waits for a person again.
 * Refused while a later part's dependence is undecided: that needs its own answer.
 */
export function confirmPartChecks(row: PartMarkRow): MarkResult {
  if (!hasPartMarks(row?.parts)) return { ok: false, error: 'No part of this question is marked.' };
  const v0 = studentView(row);
  if (v0.dependents.length) return { ok: false, error: `Decide first: does ${v0.dependents.map((d) => `${d.label} need ${d.onLabel}`).join(', ')}?` };
  const fp = viewFingerprint(row);
  const stamp = (ps: unknown): unknown[] => (Array.isArray(ps) ? ps : []).map((p) => {
    if (!isObj(p)) return p;
    const o: Obj = { ...p };
    if (Array.isArray(p.subparts)) o.subparts = stamp(p.subparts);
    if (p.legacy === true) o.checked = fp;
    return o;
  });
  const parts = stamp(row.parts);
  return { ok: true, parts, view: studentView({ ...row, parts }) };
}

const LEAN = /\b(hence|deduce|using (?:your|the|this|these) (?:answers?|results?|values?)|use (?:your|the|this) (?:answers?|results?)|from (?:your|the) (?:answers?|results?)|from parts?\b|with the (?:result|answer)|by considering your)/i;

/**
 * Parts AFTER the given one that look as if they lean on it. A prompt for the person
 * marking, never a decision: only a person can say whether the later part can still be
 * done alone. Listed:
 *   - any later part whose text, answer or stored working NAMES the part;
 *   - any later part at the same or a deeper level that says "Hence", "Deduce", "using
 *     your answer/result", "from part …" — wherever it sits, not only straight after
 *     (RI 2024 Prelim P1 Q8: (b)(iii) "Hence find tan π/12" leans on (b)(i), past (b)(ii));
 *   - a shallower part that says so straight after it;
 *   - any later part whose stored working carries the part's own answer.
 */
export function likelyDependents(parts: unknown, part: string): { key: string; label: string; why: string }[] {
  const key = parsePartRef(part);
  const all = flat(buildTree(parts));
  const at = all.findIndex((n) => n.key === key);
  if (at === -1) return [];
  const target = all[at];
  const inside = (n: Node) => n.key === key || n.key.startsWith(`${key}.`);
  const names = (text: string, ctx: Node) => findRefs(text, ctx, all).some((h) => {
    if (h.listed) return false;
    const t = h.target;
    if (t === target || inside(t)) return true;
    // "using (b)" when (b)(i) is the hidden part — but not a part naming its own parent.
    return key.startsWith(`${t.key}.`) && t !== ctx && !ctx.key.startsWith(`${t.key}.`);
  });
  const squash = (s: string) => s.replace(/[\s$]|\\(?:left|right|displaystyle|dfrac|tfrac|frac|,|;|!)/g, '');
  const results = all.filter(inside).map((n) => squash(str(n.part.answer))).filter((a) => a.length >= 6);
  const out: { key: string; label: string; why: string }[] = [];
  const later = all.slice(at + 1).filter((n) => !inside(n));
  later.forEach((n, i) => {
    const text = str(n.part.text);
    const working = `${str(n.part.solution)}\n${str(n.part.answer)}`;
    const lean = LEAN.exec(maskMath(text));
    const label = partRefLabel(n.key);
    const on = partRefLabel(key);
    if (names(text, n)) out.push({ key: n.key, label, why: `names ${on}` });
    else if (lean && depthOf(n.key) >= depthOf(key)) out.push({ key: n.key, label, why: `says “${lean[0]}” after ${on}` });
    else if (lean && i === 0) out.push({ key: n.key, label, why: `says “${lean[0]}” right after ${on}` });
    else if (names(working, n)) out.push({ key: n.key, label, why: `its working names ${on}` });
    else if (results.some((r) => squash(working).includes(r))) out.push({ key: n.key, label, why: `its working uses the answer to ${on}` });
  });
  return out;
}
