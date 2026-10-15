// Question clips (SPEC-CLIP-PIPELINE.md §9, step 2 — 15 Oct 2026, Adrian: "able to
// generate these solution clips when a student upload any questions? And retain such
// quality?"): a one-minute solution clip for ONE bank question, made once by
// scripts/clips/question-clip.mjs through every check the skill clips pass, stored in
// `question_clips`, and played by /app/clip/q/<id> for everyone after.
//
// Pure and IO-free (testing policy, CLAUDE.md): the up-front refusal, the slug, the
// bible file, the status words. The server half is lib/question-clip-store.ts.
import { createHash } from 'node:crypto';
import { hasPartMarks } from './part-syllabus';

export type QuestionClipStatus = 'queued' | 'making' | 'ready' | 'refused' | 'failed';

/** The bank row the pipeline reads (a subset of `questions`). */
export interface ClipQuestionRow {
  id: string;
  question_text: string | null;
  answer: string | null;
  solution: string | null;
  level: string | null;
  topics?: string[] | null;
  parts?: unknown[] | null;
  has_image?: boolean | null;
  figure_url?: string | null;
  images?: unknown;
  image_url?: unknown;
  legacy_syllabus?: boolean | null;
  national?: boolean | null;
  ai_generated?: boolean | null;
  verified?: boolean | null;
}

/** Levels the pipeline makes clips for today (A Math first; E Math once its bibles exist). */
export const CLIP_LEVELS = ['AM', 'EM'] as const;

export interface Refusal { kind: string; why: string }

const hasFigure = (q: ClipQuestionRow): boolean => {
  if (q.has_image || (q.figure_url && q.figure_url.trim())) return true;
  for (const v of [q.images, q.image_url]) {
    if (Array.isArray(v) && v.length) return true;
    if (typeof v === 'string' && v.trim() && v.trim() !== '[]') return true;
  }
  return false;
};

/**
 * The questions refused BEFORE any model runs — the ones whose working cannot be checked
 * line by line today. The plan agent may still refuse later (`unchecked`, `long`, …);
 * both land in `question_clips.refuse_reason`. Null = go ahead.
 */
export function preRefuse(q: ClipQuestionRow): Refusal | null {
  const text = String(q.question_text ?? '');
  if (!CLIP_LEVELS.includes(String(q.level ?? '').toUpperCase() as typeof CLIP_LEVELS[number])) {
    return { kind: 'level', why: `Clips are made for A Math and E Math questions for now (this one is ${q.level || 'unlevelled'}).` };
  }
  if (!text.trim()) return { kind: 'no-text', why: 'The question has no text to put on the board.' };
  // Never served to students → never a clip (docs/CONTENT-POLICY.md, SPEC-PART-SYLLABUS.md).
  if (q.legacy_syllabus) return { kind: 'syllabus', why: 'The question is out of the current syllabus.' };
  if (q.national) return { kind: 'not-served', why: 'National-paper questions are not served to students.' };
  if (q.ai_generated && !q.verified) return { kind: 'not-served', why: 'An unchecked question of ours — not served to students yet.' };
  // A part marked out of syllabus: the clip would teach it — refused until part clips exist.
  if (hasPartMarks(q.parts)) return { kind: 'syllabus', why: 'A part of this question is out of syllabus.' };
  if (!String(q.answer ?? '').trim() || !String(q.solution ?? '').trim()) {
    return { kind: 'no-answer', why: 'The bank has no checked answer and solution for this question yet.' };
  }
  if (hasFigure(q)) return { kind: 'figure', why: 'The question needs its diagram, and the board cannot show one yet.' };
  if (/\b(sketch|draw|plot)\b|on the (same )?(graph|axes|diagram)/i.test(text)) {
    return { kind: 'graph', why: 'The answer is a graph or a drawing, which the board cannot check line by line yet.' };
  }
  if (/\b(show|prove|verify)\s+that\b|\bhence (show|prove|deduce)\b/i.test(text)) {
    return { kind: 'proof', why: 'A "show that" or proof question — refused for now (no single answer to land on).' };
  }
  if (/\b(explain|describe|state|comment|interpret|why)\b/i.test(text) && !/\$/.test(text)) {
    return { kind: 'words', why: 'The answer is mainly words, not working.' };
  }
  if (Array.isArray(q.parts) && q.parts.length > 2) {
    return { kind: 'long', why: `${q.parts.length} parts — too long for one clip (part clips come later).` };
  }
  return null;
}

/** The clip's slug: a lesson slug (lib/lesson-script) — `qc-` + the first 8 hex of the id. */
export function questionClipSlug(questionId: string): string {
  return `qc-${questionId.replace(/[^0-9a-f]/gi, '').slice(0, 8).toLowerCase()}`;
}

/** `Differentiation (Tangents and Normals)`, AM → `differentiation-tangents-and-normals-am.md`. */
export function bibleFile(topic: string, level: string): string {
  const t = topic.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${t}-${level.toLowerCase()}.md`;
}

/** Where a question clip's voice lives: the public `lesson-audio` bucket. */
export const CLIP_AUDIO_BUCKET = 'lesson-audio';
export function clipAudioPath(questionId: string, file: string): string {
  return `question-clips/${questionId}/${file}`;
}

/** What the admin entry points say for each state. */
export function clipStatusLine(status: QuestionClipStatus | null, refuseReason?: string | null): string {
  switch (status) {
    case 'ready': return 'Clip ready';
    case 'queued': return 'Clip asked for — it is made in about 5 minutes';
    case 'making': return 'Clip being made — every check runs first';
    case 'refused': return `No clip for this question: ${refuseReason || 'it cannot be checked line by line yet'}`;
    case 'failed': return 'The clip failed a check and was not kept';
    default: return 'No clip yet';
  }
}

/**
 * A marked paper's bank key (result_json.paper_match.key, e.g. "gce 2023 em p2",
 * "nan chiau 2024 am p1") → the bank columns it names. Null when it is not that shape.
 */
export function parseBankKey(key: string | null | undefined): { school: string; year: number; level: string; paper: string } | null {
  const m = String(key ?? '').trim().toLowerCase().match(/^(.+?)\s+(\d{4})\s+([a-z0-9]+)\s+p(\d)$/);
  if (!m) return null;
  return { school: m[1], year: Number(m[2]), level: m[3].toUpperCase(), paper: m[4] };
}

/** Bank school names compared loosely ("Nan Chiau" = "nan chiau" = "NanChiau"). */
export const schoolSlug = (s: string | null | undefined): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ── Photo questions (§9b, 15 Oct 2026): a question a student handed in on a paper the
// marking did NOT match to the bank. No bank row, so the clip is keyed two ways:
//   • its row id = photoClipId(run, number) — one per (marked paper, question), so the
//     marked page can find its own door without a lookup table;
//   • text_hash = questionTextHash(the question read off the photo) — the same question
//     handed in by the next student is found by this and its clip copied, not made again.

/** A uuid-shaped id from a string (sha-256, version nibble 5) — stable, never random. */
export function uuidFromString(s: string): string {
  const h = createHash('sha256').update(s).digest('hex');
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The question_clips id for question `number` of marked run `runId`. */
export function photoClipId(runId: string, number: string): string {
  return uuidFromString(`photo:${runId.toLowerCase()}:${String(number).trim().toLowerCase()}`);
}

/**
 * The question text with everything a second reading of the same page may write
 * differently taken out: case, spaces, `$`, `\,` / `\;` / `\left` / `\right`, `\dfrac`→`\frac`,
 * `[3]` mark brackets, unicode minus and times. Two readings of one printed question
 * normalise to the same string far more often than not; when they do not, the clip is
 * simply made again (never a wrong match).
 */
export function normaliseQuestionText(t: string): string {
  return String(t ?? '')
    .toLowerCase()
    .replace(/\\[dt]frac/g, '\\frac')
    .replace(/\\(left|right|displaystyle|,|;|!|quad|qquad)/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/[−–]/g, '-')
    .replace(/×/g, '\\times')
    .replace(/[$\s{}]/g, '')
    .replace(/[.]+$/, '');
}

export function questionTextHash(t: string): string {
  return createHash('sha256').update(normaliseQuestionText(t)).digest('hex');
}

/**
 * Every number a marker's short reading of the question names must also be in the full
 * reading off the photo (digit runs, so "1.5%" and "$1.5\%$" agree). A number missing means
 * the two readings are of different questions, or the photo read dropped a value — the clip
 * is refused rather than made from a misread question. Returns the missing numbers.
 */
export function numbersMissing(markerReading: string, photoReading: string): string[] {
  const nums = (s: string) => String(s ?? '').replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2').match(/\d+(?:\.\d+)?/g) ?? [];
  const have = new Set(nums(photoReading));
  return [...new Set(nums(markerReading))].filter(n => !have.has(n));
}
