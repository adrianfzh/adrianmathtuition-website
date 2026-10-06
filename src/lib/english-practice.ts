// English practice from the language bank (SPEC-ENGLISH-PRACTICE.md, 6 Oct 2026):
// editing (marked by rule, no model), short comprehension / vocabulary /
// visual-text answers and the summary (marked against the paper's OWN scheme by
// one model call, never against an answer of ours). Pure rules — the I/O half is
// lib/english-practice-store.ts. Closed: ENGLISH_PRACTICE_OPEN_TO_STUDENTS.
//
// Red lines this file holds:
//   • a row is servable only when it is a school row (not national), not deleted,
//     and its answer came from the paper's own scheme;
//   • nothing that names the source (school, year, file) and no scheme text is in
//     a public payload — the scheme is shown only AFTER the student's check;
//   • a model never invents a scheme: no scheme for a unit → the unit is not served.

export const ENGLISH_PRACTICE_LEVELS: readonly string[] = ['EL', 'EL_NA'];
// Sonnet 5, like the other small readers on the site. (Sonnet 5.5 is on an approved-sites list —
// lib/claude-models.test.ts — so moving this check to it is Adrian's call, not a default.)
export const ENGLISH_CHECK_MODEL: string = process.env.ENGLISH_CHECK_MODEL || 'claude-sonnet-5';
export const DAILY_ENGLISH_MODEL_CAP = 40;
export const ENGLISH_ANSWER_MAX = 1500;
export const SUMMARY_WORD_LIMIT = 80;
export const SUMMARY_CONTENT_MAX = 8;
export const READING_KINDS: readonly string[] = ['comprehension', 'vocabulary', 'visual_text', 'summary', 'language_use'];

export interface ItemRow {
  id: string;
  section_kind: string;
  question_number: string | null;
  question_text: string | null;
  options: { label?: string; text?: string }[] | null;
  parts: { label?: string; text?: string; marks?: number; answer?: unknown }[] | null;
  total_marks: number | null;
  answer: unknown;
  text_id: string | null;
  level: string | null;
  national: boolean | null;
  answer_source: string | null;
  deleted_at: string | null;
}

/** The serve gate: school rows with their own scheme, live, O-Level / N(A) English. */
export function servable(r: Pick<ItemRow, 'national' | 'deleted_at' | 'answer_source' | 'level'>): boolean {
  return r.national !== true && !r.deleted_at && r.answer_source === 'mark_scheme' && ENGLISH_PRACTICE_LEVELS.includes(String(r.level ?? ''));
}

// ── The scheme, as the bank stores it ───────────────────────────────────────
export interface Scheme { answer: string | null; accept: string[]; points: string[] }

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** `answer` is a string, or { answer, accept[], points[], marks_note }. The marker's note is never carried. */
export function toScheme(a: unknown): Scheme {
  if (typeof a === 'string') return { answer: a.trim() || null, accept: [], points: [] };
  if (a && typeof a === 'object') {
    const o = a as Record<string, unknown>;
    return { answer: str(o.answer) || null, accept: strList(o.accept), points: strList(o.points) };
  }
  return { answer: null, accept: [], points: [] };
}
export const hasScheme = (s: Scheme): boolean => !!s.answer || s.accept.length > 0 || s.points.length > 0;

/** The editing scheme's own explanation for a line (teaching, not a mark code). */
export function editingNote(a: unknown): string | null {
  if (!a || typeof a !== 'object') return null;
  const n = str((a as Record<string, unknown>).marks_note);
  return n.length >= 12 ? n : null;
}

// ── Question units: one thing a student answers and gets a verdict on ───────
export type UnitKind = 'short' | 'choice' | 'summary';
export interface Unit {
  key: string;          // "<itemId>" or "<itemId>:<part label>"
  itemId: string;
  number: string;       // "5" or "5(a)"
  stem: string | null;  // the parent question's words, when this is a part
  text: string;
  marks: number;
  kind: UnitKind;
  sectionKind: string;
  options: { label: string; text: string }[] | null;
  scheme: Scheme;
}
export type PublicUnit = Omit<Unit, 'scheme'>;

const cleanOptions = (o: ItemRow['options']): { label: string; text: string }[] | null => {
  const out = (o ?? []).map(x => ({ label: str(x?.label), text: str(x?.text) })).filter(x => x.label && x.text);
  return out.length >= 2 ? out : null;
};

/** The units of one reading item. A part with no scheme is left out, never guessed. */
export function unitsOf(r: ItemRow): Unit[] {
  if (!servable(r) || !READING_KINDS.includes(r.section_kind)) return [];
  const qn = str(r.question_number) || '?';
  const stem = str(r.question_text);
  const parts = (r.parts ?? []).filter(p => p && str(p.text));
  if (parts.length > 0) {
    return parts.map((p, i): Unit | null => {
      const scheme = toScheme(p.answer);
      if (!hasScheme(scheme)) return null;
      const label = str(p.label) || String(i + 1);
      return { key: `${r.id}:${label}`, itemId: r.id, number: `${qn}(${label})`, stem: stem || null, text: str(p.text),
        marks: Number(p.marks) > 0 ? Number(p.marks) : 1, kind: 'short', sectionKind: r.section_kind, options: null, scheme };
    }).filter((u): u is Unit => !!u);
  }
  const scheme = toScheme(r.answer);
  if (!hasScheme(scheme) || !stem) return [];
  const options = cleanOptions(r.options);
  const kind: UnitKind = r.section_kind === 'summary' ? 'summary' : options ? 'choice' : 'short';
  return [{ key: r.id, itemId: r.id, number: qn, stem: null, text: stem, marks: Number(r.total_marks) > 0 ? Number(r.total_marks) : 1,
    kind, sectionKind: r.section_kind, options, scheme }];
}

export function publicUnit(u: Unit): PublicUnit {
  const { scheme: _scheme, ...rest } = u;
  void _scheme;
  return rest;
}

export function parseUnitKey(key: unknown): { itemId: string; label: string | null } | null {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?::([\w().-]{1,12}))?$/i.exec(String(key ?? ''));
  return m ? { itemId: m[1], label: m[2] ?? null } : null;
}

// ── Editing: ten lines, one right word (or a tick) each — marked by rule ────
export const norm = (s: string): string => s.toLowerCase().replace(/[‘’“”"'`.,;:!?]/g, '').replace(/\s+/g, ' ').trim();
const TICK = /^(✓|√|✔|tick|ticked|no error|none|correct|ok|nil|-)$/i;
export const isTick = (s: string): boolean => TICK.test(s.trim()) || /^[✓√✔]/.test(s.trim()) || /^no error/i.test(s.trim());

/** What a line accepts: a tick, or any of the words the scheme lists ("because / as", "in (pp)"). */
export function editingAccepts(schemeAnswer: string): { tick: boolean; words: string[] } {
  const bare = schemeAnswer.replace(/\([^)]*\)/g, ' ').trim();   // "(pp)", "(tense)", "(no error)" are the marker's labels
  if (isTick(bare) || isTick(schemeAnswer)) return { tick: true, words: [] };
  const words = bare.split(/\s*(?:\/|\bor\b)\s*/i).map(norm).filter(Boolean);
  return { tick: false, words };
}

export interface EditingLine { label: string; where: string; scheme: string; note: string | null }
export interface EditingSet { itemId: string; text: string; lines: EditingLine[] }

/** An editing item is servable only with its lines in `parts`, each carrying an answer. */
export function toEditingSet(r: ItemRow): EditingSet | null {
  if (!servable(r) || r.section_kind !== 'editing' || !str(r.question_text)) return null;
  const lines = (r.parts ?? []).map((p, i): EditingLine | null => {
    const s = toScheme(p?.answer).answer;
    if (!s) return null;
    return { label: str(p?.label) || String(i + 1), where: str(p?.text) || `Answer space ${i + 1}`, scheme: s, note: editingNote(p?.answer) };
  }).filter((l): l is EditingLine => !!l);
  return lines.length >= 8 && lines.length === (r.parts ?? []).length ? { itemId: r.id, text: str(r.question_text), lines } : null;
}

export interface EditingResult { label: string; ok: boolean; yours: string; correct: string; note: string | null }

export function checkEditing(set: EditingSet, answers: Record<string, unknown>): { results: EditingResult[]; right: number; total: number } {
  const results = set.lines.map((l): EditingResult => {
    const yours = str(answers[l.label]).slice(0, 60);
    const acc = editingAccepts(l.scheme);
    const ok = yours !== '' && (acc.tick ? isTick(yours) : !isTick(yours) && acc.words.includes(norm(yours)));
    return { label: l.label, ok, yours, correct: acc.tick ? '✓ (no error)' : l.scheme.replace(/\s*\([^)]*\)\s*/g, ' ').trim(), note: l.note };
  });
  return { results, right: results.filter(r => r.ok).length, total: results.length };
}

// ── Short answers: a free rule where the answer is one exact thing ──────────
/** true / false when the rule can decide by itself; null = a judgement, ask the model. */
export function ruleShort(u: Pick<Unit, 'kind' | 'options' | 'scheme' | 'sectionKind'>, answer: string): boolean | null {
  const a = norm(answer);
  if (!a) return false;
  const targets = [u.scheme.answer, ...u.scheme.accept].filter((x): x is string => !!x).map(norm);
  if (u.kind === 'choice' && u.options) {
    const picked = u.options.find(o => norm(o.label) === a || norm(o.text) === a);
    if (!picked) return null;
    return targets.some(t => t === norm(picked.label) || t === norm(picked.text) || t.startsWith(norm(picked.label) + ' ') || t.includes(norm(picked.text)));
  }
  // "Which word …" — the scheme is one or two words: an exact match is right; anything else needs a look.
  if (u.sectionKind === 'vocabulary' && targets.length > 0 && targets.every(t => t.split(' ').length <= 2)) {
    return targets.includes(a) ? true : a.split(' ').length <= 2 ? false : null;
  }
  return targets.includes(a) ? true : null;
}

export interface ShortVerdict { awarded: number; why: string; missing: string | null }

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + ' …' : s);

export function buildShortPrompt(u: Pick<Unit, 'stem' | 'text' | 'marks' | 'scheme'>, answer: string, passage: string): string {
  return `You are marking ONE answer to an O-Level English comprehension question against the school's own mark scheme. The scheme is the only standard: award what it would award, no more and no less.

THE PASSAGE (for reference only)
<<<
${clip(passage, 9000)}
>>>

THE QUESTION (${u.marks} mark${u.marks === 1 ? '' : 's'})
${u.stem ? u.stem + '\n' : ''}${u.text}

THE SCHEME'S ANSWER
${u.scheme.answer ?? '(see the points)'}
${u.scheme.accept.length ? 'Also accepted: ' + u.scheme.accept.join(' | ') : ''}
${u.scheme.points.length ? 'Points: ' + u.scheme.points.join(' | ') : ''}

THE STUDENT'S ANSWER
<<<
${answer}
>>>

RULES
- Same meaning in different words earns the mark. A paraphrase is not wrong.
- If the question says "in your own words", words lifted straight from the passage for the key idea do not earn the mark.
- If the question asks for a word or a phrase from the passage, extra words that change or blur the answer do not earn it.
- A blank, an answer to a different question, or a vague answer with no key idea earns 0.
- Half marks only when the question is worth 2 or more and the scheme has two separable ideas.
- Do not correct spelling or grammar unless it changes the meaning.

Reply with one JSON object and nothing else:
{"awarded": <a number from 0 to ${u.marks}>, "why": "<one plain sentence TO the student — say 'you', never 'the student' — 20 words at most, saying what was right or wrong>", "missing": "<the idea the answer still needed, 15 words at most, or null when full marks>"}`;
}

function firstJson(text: string): Record<string, unknown> | null {
  const i = text.indexOf('{'); const j = text.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { const o = JSON.parse(text.slice(i, j + 1)); return o && typeof o === 'object' ? (o as Record<string, unknown>) : null; } catch { return null; }
}

export function parseShortReply(text: string, marks: number): ShortVerdict | null {
  const o = firstJson(text);
  if (!o) return null;
  const n = Number(o.awarded);
  if (!Number.isFinite(n)) return null;
  const awarded = Math.max(0, Math.min(marks, Math.round(n * 2) / 2));
  const why = str(o.why).slice(0, 220);
  if (!why) return null;
  const missing = str(o.missing).slice(0, 180);
  return { awarded, why, missing: awarded >= marks || !missing || /^null$/i.test(missing) ? null : missing };
}

// ── The summary ─────────────────────────────────────────────────────────────
export const wordCount = (s: string): number => (s.trim().match(/\S+/g) ?? []).length;
export const summaryContentMax = (s: Scheme): number => Math.min(SUMMARY_CONTENT_MAX, Math.max(1, s.points.length || SUMMARY_CONTENT_MAX));

export interface SummaryVerdict { hit: number[]; language: string }

export function buildSummaryPrompt(u: Pick<Unit, 'text' | 'scheme'>, answer: string, passage: string): string {
  const pts = u.scheme.points.map((p, i) => `${i + 1}. ${p}`).join('\n');
  return `You are marking the CONTENT of an O-Level English summary against the school's own list of points. The list is the only standard.

THE PASSAGE
<<<
${clip(passage, 9000)}
>>>

THE TASK
${u.text}

THE SCHEME'S POINTS
${pts || '(none listed — use the model summary below to decide the separate points)'}
${u.scheme.answer ? '\nThe scheme\'s model summary:\n' + u.scheme.answer : ''}

THE STUDENT'S SUMMARY
<<<
${answer}
>>>

RULES
- A point is made when its idea is clearly there, in the student's own words or close to them. Order does not matter.
- A point that is only hinted at, or merged so loosely that the idea is lost, is not made.
- Ignore anything after the first ${SUMMARY_WORD_LIMIT} words of the student's summary.
- Do not award a point that is not on the list.

Reply with one JSON object and nothing else:
{"hit": [<the numbers of the points made>], "language": "<one plain sentence TO the student — say 'you' — about the wording: own words or lifted, linked or listed; 22 words at most>"}`;
}

export function parseSummaryReply(text: string, nPoints: number): SummaryVerdict | null {
  const o = firstJson(text);
  if (!o || !Array.isArray(o.hit)) return null;
  const hit = [...new Set(o.hit.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= Math.max(nPoints, 1)))].sort((a, b) => a - b);
  const language = str(o.language).slice(0, 240);
  return language ? { hit, language } : null;
}

/** The summary cut at the word limit — what an examiner would read. */
export function withinLimit(answer: string): string {
  const words = answer.trim().match(/\S+/g) ?? [];
  return words.slice(0, SUMMARY_WORD_LIMIT).join(' ');
}

// ── What the student reads back ─────────────────────────────────────────────
export function marksLine(awarded: number, marks: number): string {
  const a = Number.isInteger(awarded) ? String(awarded) : awarded.toFixed(1);
  return `${a} of ${marks} mark${marks === 1 ? '' : 's'}`;
}

/** The scheme as shown AFTER the check: the answer and what else is accepted. Never the marker's note. */
export function schemeShown(s: Scheme): { answer: string | null; accept: string[]; points: string[] } {
  return { answer: s.answer, accept: s.accept.slice(0, 6), points: s.points.slice(0, 12) };
}

/** A short label for a passage in a list — its title or first words, never its source. */
export function passageLabel(title: string | null | undefined, text: string | null | undefined): string {
  const t = str(title);
  if (t && t.length <= 70) return t;
  const words = (str(text).replace(/\s+/g, ' ').match(/\S+/g) ?? []).slice(0, 9).join(' ');
  return words ? words + ' …' : 'A text';
}
