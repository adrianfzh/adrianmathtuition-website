// English editing — the crash course and the grammar map (SPEC-ENGLISH-PRACTICE.md "crash course +
// grammar map", Adrian 13 Oct 2026: "add like a link say to mini crash course about that particular
// error … will keep linking students to go deeper and deeper … a graph?").
//
// One short lesson per mistake kind (EDIT_KIND_WEIGHT) lives in data/english/grammar/<kind>.json,
// written by us. "Try 3" lines come from OUR passages (every error line is tagged with its kind) plus
// a few extra lines a lesson carries for kinds the passages are thin on. Pure — no I/O here.
import { EDIT_KIND_WEIGHT, type EditKind, type OwnEditing, ownUuid } from './english-own';
import { checkEditing, lineWords, type EditingResult } from './english-practice';
import number from '../../data/english/grammar/number.json';
import article from '../../data/english/grammar/article.json';
import agreement from '../../data/english/grammar/agreement.json';
import past from '../../data/english/grammar/past.json';
import participle from '../../data/english/grammar/participle.json';
import adverb from '../../data/english/grammar/adverb.json';
import pronoun from '../../data/english/grammar/pronoun.json';
import relative from '../../data/english/grammar/relative.json';
import verb_form from '../../data/english/grammar/verb_form.json';
import comparison from '../../data/english/grammar/comparison.json';
import quantity from '../../data/english/grammar/quantity.json';
import article_the from '../../data/english/grammar/article_the.json';
import connector from '../../data/english/grammar/connector.json';
import preposition from '../../data/english/grammar/preposition.json';
import word_class from '../../data/english/grammar/word_class.json';
import tense from '../../data/english/grammar/tense.json';

export interface DrillSource { text: string; wrong: string; right: string; accept?: string[]; note?: string }
export interface GrammarLesson {
  kind: EditKind;
  name: string;                                  // "One or many"
  tag: string;                                   // "book → books"
  rule: string[];                                // one idea a line
  wrong: { text: string; word: string };         // the ✗ example, its wrong word
  right: { text: string; word: string };         // the ✓ example, the fixed word
  spot: string;                                  // how to spot it in a passage
  deeper: string[];                              // "Go deeper": more to know
  extra: DrillSource[];                          // our own extra Try lines (kinds the passages are thin on)
}

export const GRAMMAR: Record<EditKind, GrammarLesson> = {
  number, article, agreement, past, participle, adverb, pronoun, relative,
  verb_form, comparison, quantity, article_the, connector, preposition, word_class, tense,
} as unknown as Record<EditKind, GrammarLesson>;

export const isEditKind = (k: unknown): k is EditKind => typeof k === 'string' && k in EDIT_KIND_WEIGHT;

/**
 * The map's paths: each is learnt top to bottom, easier first (weight 1 → 3). A kind "builds on"
 * the one above it in its path. Every kind is in exactly one path (tested).
 */
export const GRAMMAR_PATHS: readonly { name: string; kinds: EditKind[] }[] = [
  { name: 'Verbs and time', kinds: ['past', 'participle', 'verb_form', 'tense'] },
  { name: 'Who does it', kinds: ['agreement', 'pronoun', 'relative'] },
  { name: 'Counting', kinds: ['number', 'quantity'] },
  { name: 'a, an, the', kinds: ['article', 'article_the'] },
  { name: 'Describing', kinds: ['adverb', 'comparison', 'word_class'] },
  { name: 'Joining ideas', kinds: ['connector', 'preposition'] },
];

/** The next kind down the same path ("Next on this path"), or null at the foot. */
export function nextInPath(kind: EditKind): EditKind | null {
  for (const p of GRAMMAR_PATHS) { const i = p.kinds.indexOf(kind); if (i >= 0) return p.kinds[i + 1] ?? null; }
  return null;
}
export function beforeInPath(kind: EditKind): EditKind | null {
  for (const p of GRAMMAR_PATHS) { const i = p.kinds.indexOf(kind); if (i > 0) return p.kinds[i - 1]; }
  return null;
}

// ── Try 3: single lines of one kind ─────────────────────────────────────────
/** One practice line. `ref` = "<set id>.<line index>" for a passage line, "x.<kind>.<i>" for a lesson's extra. */
export interface DrillLine { ref: string; kind: EditKind; before: string | null; text: string; after: string | null; wrong: string; right: string; accept: string[]; note: string | null }
/** What the page sees before answering: no wrong word, no right word. */
export type PublicDrillLine = Pick<DrillLine, 'ref' | 'before' | 'text' | 'after'>;

/** A line with its own mistake put right — the grey lines around a Try line must not teach a mistake. */
export function fixedLine(l: { text: string; wrong?: string; right?: string } | undefined): string | null {
  if (!l) return null;
  if (!l.wrong || !l.right) return l.text;
  const words = lineWords(l.text);
  const at = words.findIndex(w => w.word === l.wrong);
  if (at < 0) return l.text;
  return words.map((w, i) => `${w.before}${i === at ? l.right : w.word}${w.after}`).join(' ');
}

export function drillPool(sets: OwnEditing[], kind: EditKind): DrillLine[] {
  const out: DrillLine[] = [];
  for (const s of sets) {
    s.lines.forEach((l, i) => {
      if (!l.wrong || l.kind !== kind || !l.right) return;
      out.push({ ref: `${s.id}.${i}`, kind, before: fixedLine(s.lines[i - 1]), text: l.text, after: fixedLine(s.lines[i + 1]),
        wrong: l.wrong, right: l.right, accept: l.accept ?? [], note: l.note ?? null });
    });
  }
  GRAMMAR[kind].extra.forEach((x, i) => out.push({ ref: `x.${kind}.${i}`, kind, before: null, text: x.text, after: null,
    wrong: x.wrong, right: x.right, accept: x.accept ?? [], note: x.note ?? null }));
  return out;
}

export function findDrillLine(sets: OwnEditing[], ref: string): DrillLine | null {
  const x = /^x\.([a-z_]+)\.(\d+)$/.exec(ref);
  if (x) {
    if (!isEditKind(x[1])) return null;
    return drillPool([], x[1]).find(l => l.ref === ref) ?? null;
  }
  const m = /^([a-z0-9]+)\.(\d+)$/.exec(ref);
  if (!m) return null;
  const s = sets.find(z => z.id === m[1]);
  const l = s?.lines[Number(m[2])];
  if (!s || !l?.kind || !l.wrong) return null;
  return drillPool([s], l.kind).find(d => d.ref === ref) ?? null;
}

/**
 * Three lines of a kind: not the ones just seen, not from the passage being done, a fresh mix each
 * time. `rand` is passed in so the test can fix it. Falls back to seen lines when the pool is thin.
 */
export function pickDrill(pool: DrillLine[], opts: { skip?: string[]; notSet?: string | null; n?: number; rand?: () => number } = {}): DrillLine[] {
  const n = opts.n ?? 3, rand = opts.rand ?? Math.random, skip = new Set(opts.skip ?? []);
  const fromSet = (l: DrillLine) => !!opts.notSet && l.ref.startsWith(`${opts.notSet}.`);
  const shuffled = pool.map(l => ({ l, k: rand() })).sort((a, b) => a.k - b.k).map(x => x.l);
  const fresh = shuffled.filter(l => !skip.has(l.ref) && !fromSet(l));
  const rest = shuffled.filter(l => !fresh.includes(l));
  return [...fresh, ...rest].slice(0, n);
}

export const publicDrillLine = (l: DrillLine): PublicDrillLine => ({ ref: l.ref, before: l.before, text: l.text, after: l.after });

/** Mark one Try line exactly as a passage line is marked (circle, then correct). */
export function checkDrill(l: DrillLine, answer: unknown): EditingResult {
  const set = { itemId: l.ref, text: l.text, lines: [{ label: '1', where: 'Line', scheme: [l.right, ...l.accept].join(' / '), note: l.note, wrong: l.wrong }] };
  return { ...checkEditing(set, { '1': answer }).results[0], kind: l.kind };
}

// ── The student's own record per kind ───────────────────────────────────────
export type KindStanding = 'strong' | 'shaky' | 'weak' | 'untried';
export interface KindRecord { right: number; tries: number; standing: KindStanding }

/** green ≥ 80% over 3+ tries · red under 50% · amber between (or too few tries to call strong) · grey none. */
export function standingOf(right: number, tries: number): KindStanding {
  if (tries === 0) return 'untried';
  const r = right / tries;
  if (r < 0.5) return 'weak';
  return r >= 0.8 && tries >= 3 ? 'strong' : 'shaky';
}

/**
 * Per kind, from handed-in editing passages: each stored line { label, ok } is matched to the set's
 * line (label "1" = the passage's line 1, i.e. lines[1]) and counted under that line's kind. Clean
 * lines carry no kind and are not counted.
 */
export function kindRecord(sets: OwnEditing[], attempts: { item_id: string; result: unknown }[]): Record<EditKind, KindRecord> {
  const byUuid = new Map(sets.map(s => [ownUuid(s.id).toLowerCase(), s]));
  const tally = Object.fromEntries(Object.keys(EDIT_KIND_WEIGHT).map(k => [k, { right: 0, tries: 0 }])) as Record<EditKind, { right: number; tries: number }>;
  for (const a of attempts) {
    const s = byUuid.get(String(a.item_id).toLowerCase());
    const lines = (a.result as { lines?: { label?: unknown; ok?: unknown }[] } | null)?.lines;
    if (!s || !Array.isArray(lines)) continue;
    for (const r of lines) {
      const l = s.lines[Number(r?.label)];
      if (!l?.wrong || !l.kind || !(l.kind in tally)) continue;
      tally[l.kind].tries++;
      if (r.ok === true) tally[l.kind].right++;
    }
  }
  return Object.fromEntries(Object.entries(tally).map(([k, t]) => [k, { ...t, standing: standingOf(t.right, t.tries) }])) as Record<EditKind, KindRecord>;
}
