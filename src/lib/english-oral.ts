// English oral practice (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026): Paper 4 of syllabus 1184 —
// Part 1 Planned Response (a stimulus and a prompt, up to 2 minutes) and Part 2 Spoken Interaction
// (prompts on a related topic). The student speaks; the recording is turned into words; the WORDS
// are read against the syllabus's own band tables (data/rubrics/english-1184-oral.json) on the
// plan queue. What is judged is what was said. Pronunciation, fluency and intonation are not
// judged and are never mentioned.
//
// Pure: shapes, the checks, the prompt, the reply's parser (the belt) and the lines the page shows.
// The I/O half is lib/english-oral-store.ts. Closed: ENGLISH_ORAL_OPEN_TO_STUDENTS (Part 1) and
// ENGLISH_ORAL_INTERACTION_OPEN_TO_STUDENTS (Part 2).
import rubric from '../../data/rubrics/english-1184-oral.json';

export type OralPart = 'planned' | 'interaction';
export const ORAL_PARTS: readonly OralPart[] = ['planned', 'interaction'];

export interface OralSet {
  id: string;                 // "or01"
  kind: 'oral';
  title: string;
  picture: string;            // /english/oral/<id>.jpg — a picture we generated
  scene: string;              // the picture in words: its alt text, and what the reader is given
  imagePrompt?: string;       // how the picture was made (scripts/english-own/oral-pictures.mjs)
  planned: string;            // the Part 1 prompt
  interaction: string[];      // the Part 2 prompts, asked aloud one at a time
}

/** "up to 2 minutes" (syllabus 1184, Paper 4 Part 1). */
export const PLANNED_MAX_SECONDS = 120;
export const INTERACTION_MAX_SECONDS = 90;
/** The paper gives 10 minutes of preparation. */
export const PREP_SECONDS = 600;
export const DAILY_ORAL_CAP = 6;
export const ORAL_AUDIO_MAX_BYTES = 4_000_000;
export const ORAL_WORDS_MAX = 3000;       // characters of one answer's words
export const ORAL_MIN_WORDS = 8;          // fewer words than this in all = nothing to read

export const maxSeconds = (part: OralPart): number => (part === 'planned' ? PLANNED_MAX_SECONDS : INTERACTION_MAX_SECONDS);
export const promptsFor = (s: Pick<OralSet, 'planned' | 'interaction'>, part: OralPart): string[] => (part === 'planned' ? [s.planned] : s.interaction);
/** The spoken version of a Part 2 prompt: /english/oral/<id>-q<n>.mp3 (n from 1). */
export const promptAudio = (id: string, n: number): string => `/english/oral/${id}-q${n}.mp3`;

export function oralProblems(s: OralSet): string[] {
  const out: string[] = [];
  if (!/^or\d{2}$/.test(s.id ?? '')) out.push('id like "or01"');
  if (!s.title || s.title.length < 3 || s.title.length > 50) out.push('title: 3–50 characters');
  if (s.picture !== `/english/oral/${s.id}.jpg`) out.push('picture is /english/oral/<id>.jpg');
  if (!s.scene || s.scene.length < 80) out.push('the scene in words (80 characters or more) — the reader cannot see the picture');
  if (!s.planned || !/\?/.test(s.planned)) out.push('a planned-response prompt that asks a question');
  if (!Array.isArray(s.interaction) || s.interaction.length < 2 || s.interaction.length > 3) out.push('two or three spoken-interaction prompts');
  for (const p of s.interaction ?? []) {
    if (!p || p.length < 15) out.push('a spoken-interaction prompt is too short');
    // "They will not be asked any questions about what people say in the video clip."
    if (/\b(say|says|said|saying)\b.*\b(picture|video|clip)\b|\b(picture|video|clip)\b.*\b(say|says|said|saying)\b/i.test(p)) out.push('a prompt must not ask what people in the picture say');
  }
  return out;
}

export interface PublicOral { id: string; title: string; picture: string; alt: string; planned: string; interaction: string[] }
export const publicOral = (s: OralSet): PublicOral => ({ id: s.id, title: s.title, picture: s.picture, alt: s.scene, planned: s.planned, interaction: s.interaction });

// ── The band tables ─────────────────────────────────────────────────────────
interface BandRow { band: number; marks: number[]; descriptors: string[] }
const TABLE = rubric as unknown as Record<OralPart, { name: string; outOf: number; criteria: string[]; bands: BandRow[] }>;
export const bandRow = (part: OralPart, band: number): BandRow | null => TABLE[part].bands.find(b => b.band === band) ?? null;

/** A descriptor with its pronunciation clause left out — the words cannot show it. */
export const withoutPronunciation = (line: string): string => line.split(';')[0].trim();

/**
 * What the page shows for a band. Part 1's Response is marked by itself in the syllabus, so its
 * marks are shown. Part 2's one table includes pronunciation, so it shows the band and no marks.
 */
export function bandShown(part: OralPart, band: number): { line: string; descriptors: string[] } | null {
  const row = bandRow(part, band);
  if (!row) return null;
  if (band === 0) return { line: 'Nothing to mark yet', descriptors: [] };
  const [lo, hi] = row.marks;
  const line = part === 'planned' ? `Response: Band ${band} · ${lo}–${hi} of ${TABLE.planned.outOf}` : `Band ${band}`;
  return { line, descriptors: row.descriptors.map(withoutPronunciation) };
}

// ── The prompt ──────────────────────────────────────────────────────────────
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + ' …' : s);

function tableText(part: OralPart): string {
  return TABLE[part].bands.map(b => `Band ${b.band}: ${b.descriptors.map(withoutPronunciation).join(' · ')}`).join('\n');
}

export function buildOralPrompt(s: Pick<OralSet, 'scene' | 'planned' | 'interaction'>, part: OralPart, said: string[]): string {
  const prompts = promptsFor(s, part);
  const turns = prompts.map((p, i) => `PROMPT${prompts.length > 1 ? ' ' + (i + 1) : ''}\n${p}\n\nWHAT THE STUDENT SAID\n<<<\n${clip((said[i] ?? '').trim() || '(nothing)', ORAL_WORDS_MAX)}\n>>>`).join('\n\n');
  const planned = part === 'planned';
  return `You are giving feedback on a Secondary 4 student's practice for the O-Level English oral examination (${planned ? 'Part 1, Planned Response: the student saw a picture and a prompt, planned, then spoke for up to two minutes' : 'Part 2, Spoken Interaction: the student answered each prompt aloud'}). You have only the WORDS, turned into text from a recording.

THE PICTURE THE STUDENT SAW (in words)
${s.scene}

${turns}

THE BAND TABLE (the only standard — choose the band that fits best)
${tableText(part)}

RULES
- This is speech. Ignore punctuation, capital letters and spelling — the student did not write them.
- You cannot hear the student. Say NOTHING about pronunciation, fluency, pace, pauses, hesitation, fillers or confidence.
- Judge what was said: the ideas, how each is developed (a reason, an example, a personal experience), how the response is organised, the vocabulary and the sentence structures.
- An idea is "developed" when it has a reason AND an example or detail. An idea only stated is not developed.
- A habit is a language pattern heard in the words more than once: tense, subject-verb agreement, a vague word ("things", "stuff", "very good"), one word used again and again, every sentence joined with "and then", words too casual for an examination.
- Every "said" must be the student's EXACT words, copied from the text above, 3 to 14 words.
- Speak TO the student: "you". Plain, short words. No praise without a reason. Never mention marks.
- If almost nothing was said, the band is 0 or 1 and the lists may be empty.

Reply with one JSON object and nothing else:
{"band": <0 to 5>,
 "answered": "<one sentence, 20 words at most: did you answer what was asked>",${planned ? '' : `
 "prompts": [{"n": <prompt number>, "line": "<18 words at most: how that prompt was answered>"}],`}
 "ideas": [{"idea": "<the idea, 14 words at most>", "developed": <true or false>, "note": "<16 words at most: what developed it, or what it still needs>"}],
 "organisation": "<one sentence, 22 words at most, on the order and the links between ideas>",
 "habits": [{"name": "<two or three words>", "count": <how many times>, "said": "<exact words>", "fix": "<the same words put right>"}],
 "upgrades": [{"said": "<exact words>", "better": "<a stronger way to say it>", "why": "<12 words at most>"}],
 "next": "<the ONE thing to do next time, 20 words at most>"}
At most 5 ideas, 3 habits, 3 upgrades.`;
}

// ── The reply, through the belt ─────────────────────────────────────────────
export interface OralIdea { idea: string; developed: boolean; note: string }
export interface OralHabit { name: string; count: number; said: string; fix: string }
export interface OralUpgrade { said: string; better: string; why: string }
export interface OralReport {
  band: number;
  answered: string;
  prompts: { n: number; line: string }[];
  ideas: OralIdea[];
  organisation: string;
  habits: OralHabit[];
  upgrades: OralUpgrade[];
  next: string;
  /** Quotes the reader gave that the student never said — dropped, counted. */
  dropped: number;
}

const str = (v: unknown, n: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const flat = (s: string): string => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
/** Did the student really say these words? (case and punctuation aside) */
export function wasSaid(quote: string, said: string[]): boolean {
  const q = flat(quote);
  return q.length >= 3 && said.some(t => flat(t).includes(q));
}
/** Words the reader must never bring up — it cannot hear the recording. */
const DELIVERY = /\b(pronunciation|pronounc\w*|fluen\w*|intonation|accent|hesitat\w*|filler\w*|pace|pauses?|stammer\w*|mumbl\w*)\b/i;
const quiet = (s: string): string => (DELIVERY.test(s) ? '' : s);

function firstJson(text: string): Record<string, unknown> | null {
  const i = text.indexOf('{'); const j = text.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { const o = JSON.parse(text.slice(i, j + 1)); return o && typeof o === 'object' ? (o as Record<string, unknown>) : null; } catch { return null; }
}
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);

export function parseOralReply(text: string, part: OralPart, said: string[]): OralReport | null {
  const o = firstJson(text);
  if (!o) return null;
  const band = Number(o.band);
  if (!Number.isInteger(band) || band < 0 || band > 5) return null;
  let dropped = 0;
  const ideas = list(o.ideas).map((x): OralIdea => ({ idea: quiet(str(x.idea, 160)), developed: x.developed === true, note: quiet(str(x.note, 180)) })).filter(x => x.idea).slice(0, 5);
  const habits = list(o.habits).map((x): OralHabit | null => {
    const h = { name: quiet(str(x.name, 40)), count: Math.max(1, Math.min(30, Math.round(Number(x.count)) || 1)), said: str(x.said, 160), fix: str(x.fix, 200) };
    if (!h.name || !h.fix) return null;
    if (!wasSaid(h.said, said)) { dropped++; return null; }
    return h;
  }).filter((x): x is OralHabit => !!x).slice(0, 3);
  const upgrades = list(o.upgrades).map((x): OralUpgrade | null => {
    const u = { said: str(x.said, 200), better: str(x.better, 260), why: quiet(str(x.why, 120)) };
    if (!u.better) return null;
    if (!wasSaid(u.said, said)) { dropped++; return null; }
    return u;
  }).filter((x): x is OralUpgrade => !!x).slice(0, 3);
  const prompts = part === 'interaction'
    ? list(o.prompts).map(x => ({ n: Math.round(Number(x.n)), line: quiet(str(x.line, 200)) })).filter(x => x.n >= 1 && x.n <= said.length && x.line).slice(0, said.length)
    : [];
  const answered = quiet(str(o.answered, 220));
  const next = quiet(str(o.next, 220));
  // a band above 0 with nothing to show for it is not a report
  if (band > 0 && !answered && ideas.length === 0) return null;
  return { band, answered, prompts, ideas, organisation: quiet(str(o.organisation, 240)), habits, upgrades, next, dropped };
}

// ── Small things the page and the route share ───────────────────────────────
export const countWords = (s: string): number => (s.trim().match(/\S+/g) ?? []).length;
/** Enough words to be read at all? */
export const enoughSaid = (said: string[]): boolean => said.reduce((n, t) => n + countWords(t), 0) >= ORAL_MIN_WORDS;
export const clock = (seconds: number): string => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, Math.floor(seconds)) % 60).padStart(2, '0')}`;
/**
 * Could these words have been spoken in this many seconds? The transcriber, given silence or
 * noise, can INVENT a fluent speech (seen 8 Oct 2026: 47 silent seconds came back as 560 words).
 * Words that could not have been said are treated as nothing heard — never shown, never read.
 *   • nobody speaks faster than about 4.5 words a second for a whole answer;
 *   • an invented speech loops: the same six words in a row, four times or more.
 */
export function plausibleSpeech(heard: string, seconds: number): boolean {
  const words = heard.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').match(/\S+/g) ?? [];
  if (words.length === 0) return false;
  if (words.length > Math.max(12, Math.max(1, seconds) * 4.5)) return false;
  const seen = new Map<string, number>();
  for (let i = 0; i + 6 <= words.length; i++) {
    const k = words.slice(i, i + 6).join(' ');
    const n = (seen.get(k) ?? 0) + 1;
    if (n >= 4) return false;
    seen.set(k, n);
  }
  return true;
}
/** The quietest peak (0–1) a microphone shows when someone is really speaking into it. */
export const MIC_SILENT_PEAK = 0.02;

/** The recording's file ending from what the phone says it made. Only kinds we store. */
export function audioExt(mime: string | null | undefined): 'webm' | 'm4a' | 'mp3' | 'ogg' | 'wav' | null {
  const m = String(mime ?? '').toLowerCase().split(';')[0].trim();
  if (m === 'audio/webm' || m === 'video/webm') return 'webm';
  if (m === 'audio/mp4' || m === 'audio/m4a' || m === 'audio/x-m4a' || m === 'audio/aac' || m === 'video/mp4') return 'm4a';
  if (m === 'audio/mpeg' || m === 'audio/mp3') return 'mp3';
  if (m === 'audio/ogg') return 'ogg';
  if (m === 'audio/wav' || m === 'audio/x-wav') return 'wav';
  return null;
}
/** The kind told to the transcriber for a stored ending. */
export const AUDIO_MIME: Record<string, string> = { webm: 'audio/webm', m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' };
export const partLabel = (part: OralPart): string => (part === 'planned' ? 'Planned response' : 'Spoken interaction');
