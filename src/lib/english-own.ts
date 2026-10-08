// Our OWN English practice sets (docs/HANDOFF-ENGLISH-BUILD.md step 1, 7 Oct 2026):
// editing passages, visual texts, narrative and non-narrative comprehension sets (the
// non-narrative one ends with a summary). Every word is ours — the language bank guides
// the shape, the question types and the mark spread, and nothing is copied from it
// (docs/CONTENT-POLICY.md; scripts/english-own/novelty.ts checks the wording against the bank).
//
// A set is one JSON file in data/english/sets/; scripts/english-own/build.ts checks every
// set with ownProblems() and merges them into data/english/own-sets.json, which the app reads.
// Each question carries SEEDED answers written AT a known mark — the bench's truth
// (scripts/english-bench/run.ts). Seeds never reach a page.
//
// Pure: shapes, the checks, and the converters into the Practise page's own shapes
// (lib/english-practice.ts). Server-side only (node:crypto).
import { createHash } from 'node:crypto';
import type { EditingSet, Scheme, Unit } from './english-practice';

export const OWN_SKILLS = ['literal', 'inference', 'own_words', 'vocabulary', 'language_use', 'evidence', 'visual', 'summary'] as const;
export type OwnSkill = (typeof OWN_SKILLS)[number];
export const SEED_FLAWS = ['full', 'paraphrase', 'half', 'wrong', 'lifted', 'vague'] as const;
export type SeedFlaw = (typeof SEED_FLAWS)[number];
export const VISUAL_THEMES = ['teal', 'amber', 'rose', 'indigo', 'green'] as const;
export type VisualTheme = (typeof VISUAL_THEMES)[number];

/**
 * What kind of error a line carries, with how hard that kind is to spot (8 Oct 2026, Adrian:
 * "they should select difficulty"). 1 = seen in the word itself (a missing -s, a / an, was / were,
 * a missing -ed); 2 = needs the grammar of the sentence (a participle, an adverb, a pronoun,
 * who / which, a verb form, a comparison); 3 = needs the MEANING of the lines around it (the right
 * connector, the right preposition, noun or adjective, the tense the passage is in).
 */
export const EDIT_KIND_WEIGHT = {
  number: 1, article: 1, agreement: 1, past: 1,
  participle: 2, adverb: 2, pronoun: 2, relative: 2, verb_form: 2, comparison: 2, quantity: 2, article_the: 2,
  connector: 3, preposition: 3, word_class: 3, tense: 3,
} as const;
export type EditKind = keyof typeof EDIT_KIND_WEIGHT;
export interface OwnEditLine { text: string; wrong?: string; right?: string; kind?: EditKind; accept?: string[]; note?: string }
export type EditLevel = 1 | 2 | 3;
export const EDIT_LEVELS: readonly { level: EditLevel; name: string; sub: string }[] = [
  { level: 1, name: 'Easier', sub: 'Endings, a / an, was / were' },
  { level: 2, name: 'Standard', sub: 'A mix, as in the exam' },
  { level: 3, name: 'Harder', sub: 'Connectors, prepositions, word forms, tenses' },
];
/** A passage's eight errors, weighed: 8 (all plain) to 24 (all from meaning). */
export const editingScore = (s: Pick<OwnEditing, 'lines'>): number =>
  s.lines.reduce((n, l) => n + (l.wrong && l.kind ? EDIT_KIND_WEIGHT[l.kind] ?? 0 : 0), 0);
/** The level is worked out from the tagged errors, never guessed when a page is served. */
/** Easier = written to be plainly easy (12 or less) · Harder = written to be plainly hard (18 or more) · Standard = the exam's own mix. */
export const editingLevel = (s: Pick<OwnEditing, 'lines'>): EditLevel => { const n = editingScore(s); return n <= 12 ? 1 : n <= 17 ? 2 : 3; };

/**
 * Which passage comes next at a level: one not done yet, in the sets' own order; when every one
 * is done, the one done longest ago. `doneAt` = id → the last time it was handed in (ISO).
 * `skip` = the passage just finished, so "Next" never serves the same one twice in a row.
 */
export function nextEditing(ids: string[], doneAt: Record<string, string | undefined>, skip?: string | null): string | null {
  const pool = ids.length > 1 ? ids.filter(id => id !== skip) : ids;
  if (pool.length === 0) return null;
  const fresh = pool.find(id => !doneAt[id]);
  if (fresh) return fresh;
  return [...pool].sort((a, b) => String(doneAt[a]).localeCompare(String(doneAt[b])))[0];
}
export interface OwnEditing { id: string; kind: 'editing'; about: string; lines: OwnEditLine[] }

export type VisualBlock =
  | { t: 'kicker' | 'headline' | 'tagline' | 'body' | 'quote' | 'button' | 'small' | 'picture'; text: string }
  | { t: 'box'; title?: string; items: string[] };

export interface OwnSeed { mark: number; flaw: SeedFlaw; text: string; hit?: number[] }
export interface OwnQuestion {
  n: string;                                   // "1", "4a"
  stem?: string;
  text: string;
  marks: number;                               // a summary carries 15
  type: 'short' | 'choice' | 'summary';
  skill: OwnSkill;
  options?: { label: string; text: string }[];
  scheme: { answer?: string; accept?: string[]; points?: string[] };
  seeds: OwnSeed[];
}
export interface OwnReading {
  id: string;
  kind: 'visual' | 'narrative' | 'non_narrative';
  title: string;
  paragraphs?: string[];
  format?: 'poster' | 'webpage' | 'post';
  theme?: VisualTheme;
  visual?: VisualBlock[];
  questions: OwnQuestion[];
}
export type OwnSet = OwnEditing | OwnReading;

export const isEditing = (s: OwnSet): s is OwnEditing => s.kind === 'editing';
export const SUMMARY_MARKS = 15;
/** The marks a set of each kind adds up to (a non-narrative set: 10, then its summary). */
export const KIND_MARKS: Record<OwnReading['kind'], number> = { visual: 5, narrative: 20, non_narrative: 10 };

/** A set's id as the uuid the page, the route and the attempts table use. Stable for ever. */
export function ownUuid(id: string): string {
  const h = createHash('sha1').update('english-own:' + id).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const words = (s: string): string[] => s.trim().match(/\S+/g) ?? [];
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** How many times a word stands by itself in a line. */
export function wholeWordCount(line: string, word: string): number {
  return (line.match(new RegExp(`(?<![A-Za-z’'-])${esc(word)}(?![A-Za-z’'-])`, 'g')) ?? []).length;
}

/** A visual text as plain words — what the checker reads, and what the word count is taken on. */
export function visualWords(blocks: VisualBlock[]): string {
  return blocks.map(b => (b.t === 'box' ? [b.title, ...b.items].filter(Boolean).join('\n') : b.t === 'picture' ? `[Picture: ${b.text}]` : b.text)).join('\n\n');
}

/** The text the checker is given beside a question. */
export function ownPassage(s: OwnReading): string {
  if (s.kind === 'visual') return visualWords(s.visual ?? []);
  return (s.paragraphs ?? []).map((p, i) => `[Paragraph ${i + 1}] ${p}`).join('\n\n');
}

/** "Which one word …" — an exact answer the free rule can mark; "what does X mean" is a judgement. */
const isWhichWord = (q: Pick<OwnQuestion, 'skill' | 'text'>): boolean => q.skill === 'vocabulary' && /\bwhich\b[^.?]*\b(word|phrase)\b/i.test(q.text);

// ── The checks: a set with any problem is not built into the app ────────────
function editingProblems(s: OwnEditing): string[] {
  const out: string[] = [];
  if (!s.about || s.about.length < 3 || s.about.length > 60) out.push('about: 3–60 characters');
  if (!Array.isArray(s.lines) || s.lines.length !== 12) return [...out, 'an editing passage has exactly 12 lines'];
  if (s.lines[0].wrong || s.lines[11].wrong) out.push('the first and last lines are correct');
  const mid = s.lines.slice(1, 11);
  if (mid.filter(l => l.wrong).length !== 8) out.push('exactly 8 of lines 1–10 carry an error (two have none)');
  s.lines.forEach((l, i) => {
    const n = words(l.text ?? '').length;
    if (n < 8 || n > 17) out.push(`line ${i}: ${n} words (8–17)`);
    if (!l.wrong) { if (l.right) out.push(`line ${i}: a right word with no wrong word`); return; }
    if (!l.right || /\s/.test(l.right.trim()) || l.right === l.wrong) out.push(`line ${i}: the right word is one word, not the wrong one`);
    if (/\s/.test(l.wrong) || wholeWordCount(l.text, l.wrong) !== 1) out.push(`line ${i}: "${l.wrong}" must stand exactly once in the line`);
    if (!l.note || l.note.length < 8) out.push(`line ${i}: a short note on why`);
    if (!l.kind || !(l.kind in EDIT_KIND_WEIGHT)) out.push(`line ${i}: kind is one of ${Object.keys(EDIT_KIND_WEIGHT).join(', ')}`);
  });
  return out;
}

function questionProblems(q: OwnQuestion, i: number, s: OwnReading): string[] {
  const out: string[] = [];
  const at = `Q${q.n ?? i + 1}`;
  if (!/^\d{1,2}[a-c]?$/.test(q.n ?? '')) out.push(`${at}: number like "3" or "3a"`);
  if (!q.text || q.text.length < 12) out.push(`${at}: no question`);
  if (!OWN_SKILLS.includes(q.skill)) out.push(`${at}: skill is one of ${OWN_SKILLS.join(', ')}`);
  const answer = q.scheme?.answer?.trim() ?? '';
  const points = q.scheme?.points ?? [];
  if (!answer && points.length === 0) out.push(`${at}: no scheme`);
  const seeds = q.seeds ?? [];
  for (const sd of seeds) {
    if (!SEED_FLAWS.includes(sd.flaw)) out.push(`${at}: seed flaw "${sd.flaw}"`);
    if (!sd.text?.trim() || sd.text.length > 1500) out.push(`${at}: a seed is empty or too long`);
  }
  if (q.type === 'choice') {
    const opts = q.options ?? [];
    if (opts.length < 3) out.push(`${at}: a choice has at least 3 options`);
    if (opts.filter(o => o.text === answer).length !== 1) out.push(`${at}: the scheme's answer is exactly one option's words`);
    if (q.marks !== 1) out.push(`${at}: a choice is 1 mark`);
    return out;
  }
  if (q.type === 'summary') {
    if (q.marks !== SUMMARY_MARKS) out.push(`${at}: a summary carries ${SUMMARY_MARKS}`);
    if (points.length < 8) out.push(`${at}: a summary lists at least 8 points`);
    if (seeds.length < 3) out.push(`${at}: a summary has at least 3 seeded answers`);
    for (const sd of seeds) {
      if (!Array.isArray(sd.hit) || sd.hit.some(h => !Number.isInteger(h) || h < 1 || h > points.length)) out.push(`${at}: a summary seed names the points it makes`);
      else if (sd.mark !== Math.min(8, sd.hit.length)) out.push(`${at}: a summary seed's mark is its points, 8 at most`);
      if (words(sd.text ?? '').length > 80) out.push(`${at}: a summary seed is 80 words at most`);
    }
    if (s.kind !== 'non_narrative') out.push(`${at}: only a non-narrative set has a summary`);
    return out;
  }
  if (q.type !== 'short') return [...out, `${at}: type is short, choice or summary`];
  if (!(q.marks >= 1 && q.marks <= 4) || !Number.isInteger(q.marks)) out.push(`${at}: 1–4 marks`);
  if (seeds.length < 4) out.push(`${at}: at least 4 seeded answers`);
  if (!seeds.some(sd => sd.mark === q.marks)) out.push(`${at}: one seed at full marks`);
  if (!seeds.some(sd => sd.mark === 0)) out.push(`${at}: one seed at 0`);
  if (seeds.some(sd => sd.mark < 0 || sd.mark > q.marks || (sd.mark * 2) % 1 !== 0)) out.push(`${at}: a seed's mark is outside the question's`);
  if (/own words/i.test(q.text) && !seeds.some(sd => sd.flaw === 'lifted' && sd.mark === 0)) out.push(`${at}: an own-words question needs a lifted answer seeded at 0`);
  if (isWhichWord(q) && answer.split(/\s+/).length > 2) out.push(`${at}: a "which word" answer is one or two words`);
  return out;
}

function readingProblems(s: OwnReading): string[] {
  const out: string[] = [];
  if (!s.title || s.title.length > 70) out.push('title: 1–70 characters');
  if (s.kind === 'visual') {
    const b = s.visual ?? [];
    if (b.length < 4 || !b.some(x => x.t === 'headline')) out.push('a visual text has a headline and at least 4 blocks');
    if (!s.format) out.push('a visual text names its format');
    if (s.theme && !VISUAL_THEMES.includes(s.theme)) out.push('theme');
    const n = words(visualWords(b)).length;
    if (n < 60 || n > 280) out.push(`visual text: ${n} words (60–280)`);
  } else {
    const p = s.paragraphs ?? [];
    const n = words(p.join(' ')).length;
    if (p.length < 4) out.push('a passage has at least 4 paragraphs');
    if (n < 400 || n > 900) out.push(`passage: ${n} words (400–900)`);
  }
  const qs = s.questions ?? [];
  if (new Set(qs.map(q => q.n)).size !== qs.length) out.push('question numbers repeat');
  qs.forEach((q, i) => out.push(...questionProblems(q, i, s)));
  const marks = qs.filter(q => q.type !== 'summary').reduce((a, q) => a + (q.marks || 0), 0);
  if (marks !== KIND_MARKS[s.kind]) out.push(`${marks} marks — a ${s.kind} set carries ${KIND_MARKS[s.kind]}`);
  const summaries = qs.filter(q => q.type === 'summary');
  if (s.kind === 'non_narrative' && (summaries.length !== 1 || qs[qs.length - 1]?.type !== 'summary')) out.push('a non-narrative set ends with one summary');
  return out;
}

/** Everything wrong with a set, in plain words. Empty = fit to build. */
export function ownProblems(s: OwnSet): string[] {
  const out: string[] = [];
  if (!/^(ed|vt|na|nn)\d{2,3}$/.test(s?.id ?? '')) out.push('id: ed01 / vt01 / na01 / nn01');
  const prefix = { editing: 'ed', visual: 'vt', narrative: 'na', non_narrative: 'nn' }[s.kind];
  if (!prefix) return [...out, 'kind'];
  if (!s.id?.startsWith(prefix)) out.push(`a ${s.kind} set's id starts with ${prefix}`);
  return [...out, ...(isEditing(s) ? editingProblems(s) : readingProblems(s))];
}

// ── Into the Practise page's shapes ─────────────────────────────────────────
export function ownEditingSet(s: OwnEditing): EditingSet {
  const mid = s.lines.slice(1, 11);
  return {
    itemId: ownUuid(s.id),
    text: s.lines.map((l, i) => (i >= 1 && i <= 10 ? `[${i}] ${l.text}` : l.text)).join('\n'),
    rows: s.lines.map((l, i) => ({ label: i >= 1 && i <= 10 ? String(i) : null, text: l.text })),
    lines: mid.map((l, i) => ({
      label: String(i + 1), where: `Line ${i + 1}`,
      scheme: l.wrong ? [l.right as string, ...(l.accept ?? [])].join(' / ') : '✓',
      note: l.wrong ? (l.note ?? null) : null,
    })),
  };
}

const sectionKindOf = (s: OwnReading, q: OwnQuestion): string =>
  q.type === 'summary' ? 'summary' : s.kind === 'visual' ? 'visual_text' : isWhichWord(q) ? 'vocabulary' : 'comprehension';

export function ownUnits(s: OwnReading): Unit[] {
  const itemId = ownUuid(s.id);
  return s.questions.map((q): Unit => {
    const scheme: Scheme = { answer: q.scheme.answer?.trim() || null, accept: q.scheme.accept ?? [], points: q.scheme.points ?? [] };
    return { key: `${itemId}:${q.n}`, itemId, number: q.n, stem: q.stem?.trim() || null, text: q.text, marks: q.marks, kind: q.type,
      sectionKind: sectionKindOf(s, q), options: q.type === 'choice' ? (q.options ?? null) : null, scheme, skill: q.skill };
  });
}

/** Every seeded answer of a set, beside the unit it answers — the bench's input. */
export function ownSeeds(s: OwnReading): { setId: string; unit: Unit; seed: OwnSeed }[] {
  const units = new Map(ownUnits(s).map(u => [u.number, u]));
  return s.questions.flatMap(q => (q.seeds ?? []).map(seed => ({ setId: s.id, unit: units.get(q.n) as Unit, seed })));
}
