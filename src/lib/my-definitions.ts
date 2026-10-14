// "My definitions" (14 Oct 2026, Adrian: "allow a function that would let
// students add their own definition too > so system will search up the
// definition (or use our notes/resources) then put the definition in, allow
// students to remove them too > so it is a study resource").
//
// A student types a term on the Physics or Biology definitions page and taps
// Add. Where the definition comes from, in this order:
//   1. our own list for that subject (lib/science-definitions.ts,
//      lib/biology-definitions.ts) — an exact or near match is simply pinned;
//   2. the science bank: a "what is meant by …" / "define …" question with its
//      scheme answer is handed to the writer as grounding (source 'notes');
//   3. otherwise the writer writes it from scratch (source 'written').
// The writer answers in the lists' exam style — one short sentence, the
// scoring words in **bold**, O-Level 6091 / 6093 only — or refuses with a
// code, and the student sees OUR line for that code, never the model's words.
//
// Pure: matching, the writer's prompt, parsing and checking its reply, the
// limits. I/O is lib/my-definitions-store.ts; the door is /api/portal/definitions.
import { DEFINITIONS, type Definition } from './science-definitions';
import { BIOLOGY_DEFINITIONS } from './biology-definitions';

export type DefSubject = 'physics' | 'biology';
export type DefSource = 'list' | 'notes' | 'written';

/** At most this many saved definitions per student per account. */
export const MAX_PER_STUDENT = 100;
/** New definitions the writer may make for one student in 24 hours (list pins and cached terms are free). */
export const DAILY_WRITE_CAP = 20;
/** Longest term a student may type. */
export const MAX_TERM_LEN = 60;

export const SUBJECT_INFO: Record<DefSubject, { name: string; syllabus: string; list: readonly Definition[] }> = {
  physics: { name: 'Physics', syllabus: 'O-Level Physics (6091)', list: DEFINITIONS },
  biology: { name: 'Biology', syllabus: 'O-Level Biology (6093)', list: BIOLOGY_DEFINITIONS },
};

export const isDefSubject = (s: unknown): s is DefSubject => s === 'physics' || s === 'biology';

/** "Specific Heat-Capacities!" → "specific heat capacity". The cache and duplicate key. */
export function termKey(raw: string): string {
  const words = String(raw ?? '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/'s\b/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && ['a', 'an', 'the'].includes(words[0])) words.shift();
  return words.map(singular).join(' ');
}

// A light singular, enough that "enzymes" finds "Enzyme" and "capacities" finds "capacity".
function singular(w: string): string {
  if (w.length <= 3) return w;
  if (/(ss|us|is)$/.test(w)) return w; // mass, nucleus, osmosis
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(ch|sh|x)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

/** Tidies what the student typed: trimmed, one space between words, at most MAX_TERM_LEN. '' when nothing usable. */
export function cleanTerm(raw: unknown): string {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > MAX_TERM_LEN) return '';
  if (!/[a-zA-Z]/.test(t)) return '';
  return t;
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// "Moment of a force" is also found by "moment"; "Period of a pendulum" by "period".
const headOf = (key: string) => key.replace(/ of (a |an |the )?.*$/, '').trim();

/**
 * The list definition a typed term means, or null. Exact key first, then the
 * head of an "X of a Y" term, then a small spelling slip (1 letter, 2 for long
 * words). Ties go to the shorter term.
 */
export function findInList(term: string, list: readonly Definition[]): Definition | null {
  const q = termKey(term);
  if (!q) return null;
  const keyed = list.map(d => ({ d, k: termKey(d.term) }));
  const exact = keyed.find(x => x.k === q);
  if (exact) return exact.d;
  const head = keyed.filter(x => headOf(x.k) === q && x.k !== q).sort((a, b) => a.k.length - b.k.length)[0];
  if (head) return head.d;
  const slack = q.length >= 8 ? 2 : q.length >= 5 ? 1 : 0;
  if (!slack) return null;
  const near = keyed
    .map(x => ({ ...x, dist: editDistance(x.k, q) }))
    .filter(x => x.dist <= slack)
    .sort((a, b) => a.dist - b.dist || a.k.length - b.k.length)[0];
  return near ? near.d : null;
}

/** Words a student-facing definition must never carry (no sources, people, models, disclaimers). */
const BANNED = /\b(adrian|claude|anthropic|sonnet|opus|haiku|fable|gemini|gpt|chatgpt|openai|ai|ai model|language model|seab|syllabus|mark scheme|examiner|according to|textbook|school|disclaimer|may vary|i think)\b/i;

/**
 * Checks a written definition before it is shown or cached: one line, at most
 * two sentences, ≤ 280 characters, at least one **bold** run, every ** closed,
 * no banned words. Returns the tidied text or null.
 */
export function checkDefinitionText(raw: unknown): string | null {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 280) return null;
  const marks = (t.match(/\*\*/g) ?? []).length;
  if (marks < 2 || marks % 2 !== 0) return null;
  if (BANNED.test(t.replace(/\*\*/g, ''))) return null;
  const sentences = t.replace(/\b(e\.g|i\.e|etc)\./gi, '$1').split(/[.!?](?:\s|$)/).filter(s => s.trim());
  if (sentences.length > 2) return null;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export type WriterVerdict =
  | { ok: true; term: string; text: string; formula?: string }
  | { ok: false; why: 'not_in_syllabus' | 'not_a_term' }
  | { ok: false; why: 'bad_reply' };

/** Reads the writer's JSON reply. Anything malformed or unsafe is 'bad_reply' (nothing is saved). */
export function parseWriterReply(reply: string, typed: string): WriterVerdict {
  const m = String(reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, why: 'bad_reply' };
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]); } catch { return { ok: false, why: 'bad_reply' }; }
  if (j.ok === false) {
    if (j.why === 'not_in_syllabus' || j.why === 'not_a_term') return { ok: false, why: j.why };
    return { ok: false, why: 'not_a_term' };
  }
  if (j.ok !== true) return { ok: false, why: 'bad_reply' };
  const text = checkDefinitionText(j.text);
  if (!text) return { ok: false, why: 'bad_reply' };
  // The writer may fix the spelling ("transpiraton" → "Transpiration") but not swap the term.
  let term = cleanTerm(j.term) || cleanTerm(typed);
  if (BANNED.test(term) || editDistance(termKey(term), termKey(typed)) > Math.max(3, Math.floor(termKey(typed).length / 3))) term = cleanTerm(typed);
  term = term.charAt(0).toUpperCase() + term.slice(1);
  const f = String(j.formula ?? '').replace(/\s+/g, ' ').trim();
  const formula = f && f.length <= 60 && !BANNED.test(f) ? f : undefined;
  return { ok: true, term, text, ...(formula ? { formula } : {}) };
}

/** The line a student sees when nothing was added. Ours, never the writer's words. */
export function refusalLine(why: 'not_in_syllabus' | 'not_a_term' | 'bad_reply' | 'limit' | 'daily' | 'busy', term: string, subject: DefSubject): string {
  const s = SUBJECT_INFO[subject].name;
  switch (why) {
    case 'not_in_syllabus': return `“${term}” is not in your ${s} syllabus.`;
    case 'not_a_term': return `We could not find “${term}” as a ${s} term. Check the spelling.`;
    case 'limit': return `You have ${MAX_PER_STUDENT} definitions saved. Remove one to add another.`;
    case 'daily': return 'You have added a lot today. Try again tomorrow.';
    case 'busy':
    case 'bad_reply':
    default: return 'We could not add that just now. Try again in a minute.';
  }
}

/** What is still allowed for this student right now. `needsWriter` = the term is not in the list or the cache. */
export function addAllowed(savedCount: number, writesToday: number, needsWriter: boolean): 'ok' | 'limit' | 'daily' {
  if (savedCount >= MAX_PER_STUDENT) return 'limit';
  if (needsWriter && writesToday >= DAILY_WRITE_CAP) return 'daily';
  return 'ok';
}

/** The writer's prompt. `grounding` = bank text about the term (may be empty). */
export function buildWriterPrompt(term: string, subject: DefSubject, grounding: string): string {
  const info = SUBJECT_INFO[subject];
  const examples = info.list.filter((_, i) => i % Math.max(1, Math.floor(info.list.length / 4)) === 0).slice(0, 4)
    .map(d => `- ${d.term}: ${d.text}`).join('\n');
  return [
    `A Singapore secondary student studying ${info.syllabus} wants the exam definition of: "${term}".`,
    '',
    'Write it in the same style as these definitions from our list:',
    examples,
    '',
    'Rules:',
    '- One short sentence (two at most), the way an O-Level mark scheme wants it.',
    '- Put the words that score the mark in **double asterisks**.',
    `- Only what ${info.syllabus} expects. No deeper or university material.`,
    '- No sources, names, notes, hedging or disclaimers.',
    '- If the term is a real science term but NOT in this syllabus, refuse with why "not_in_syllabus".',
    '- If it is not a real term, or not a term of this subject, refuse with why "not_a_term".',
    grounding ? `\nBackground from past exam questions on this term (use it to match the expected wording; do not copy names or question numbers):\n${grounding}` : '',
    '',
    'Reply with JSON only, one of:',
    '{"ok":true,"term":"<the term, correctly spelt>","text":"<the definition>","formula":"<optional formula with what each letter stands for, or empty>"}',
    '{"ok":false,"why":"not_in_syllabus"}',
    '{"ok":false,"why":"not_a_term"}',
  ].join('\n');
}
