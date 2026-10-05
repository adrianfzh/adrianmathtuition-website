// The end-of-lesson VOICE NOTE (5 Oct 2026). Adrian: "build end-of-lesson voice
// note" — at each lesson's end the bot pings him; he holds the mic for ten
// seconds ("Did sine rule, she kept mixing up the angles, homework exercise 5")
// and that becomes the lesson log, the homework and the next suggestion's input.
// Zero effort and forgiving: a missed note is fine, the printed-pack auto log
// (lib/lesson-autolog.ts) still stands, and nothing ever nags.
//
// Pure pieces here, tested in lesson-voice.test.ts:
//   - pingText        the one message per lesson (a group lesson = one message naming everyone)
//   - buildNotePrompt / parseNoteModel / parseNotePlain   ONE reader for a voice transcript
//                      AND a typed reply (and a correction to either)
//   - noteFor          a group note → one student's part
//   - voiceFields      the Airtable Lessons patch ("Voice note: …" in Lesson Notes)
//   - ackText          the one-line "Got it — …" back to Adrian
//   - matchLoose       a voice note sent WITHOUT replying → the lesson it names
//   - lastTimeLine     "Last time: struggled with …" on the 📌 Next lesson card
// The I/O lives in /api/cron/lesson-end (the ping) and /api/bot/lesson-log (the reply).
import { AUTO_PREFIX, LINE_MARK, mayWriteAutoLog, parseReplyPlain, type AutoLog } from '@/lib/lesson-autolog';

/** Every voice-note entry's Lesson Notes starts with this. */
export const VOICE_PREFIX = 'Voice note:';
/** A ping is sent only this soon after the lesson ended (a late cron tick never pings stale). */
export const PING_LATE_MIN = 120;
/** A voice note sent without replying counts for a lesson that ended up to this long before it… */
export const LOOSE_AFTER_MIN = 120;
/** …or this long before the lesson's end (he talks while packing up). */
export const LOOSE_BEFORE_MIN = 15;

export type Mastery = 'Strong' | 'OK' | 'Slow';

/** What a note says about one lesson. Every field may be empty. */
export interface NoteRead {
  topics: string[];
  /** what the student struggled with, in plain words */
  struggled: string | null;
  homework: string | null;
  /** what to do next time */
  next: string | null;
  /** "came 15 min late", "left early" — words only, attendance is never touched */
  attendance: string | null;
  /** only when the tutor said it plainly ("she got it", "totally lost") */
  mastery: Mastery | null;
  /** anything else worth keeping, one short sentence */
  other: string | null;
}

/** The stored note on lesson_packs.voice_note. */
export interface StoredNote extends NoteRead {
  source: 'voice' | 'text';
  transcript: string;
  at: string;
}

export const EMPTY_READ: NoteRead = { topics: [], struggled: null, homework: null, next: null, attendance: null, mastery: null, other: null };

/** A group note: what applies to everyone, and per-student overrides keyed by first name. */
export interface GroupRead { all: NoteRead; by: Record<string, Partial<NoteRead>> }

// ── the ping ───────────────────────────────────────────────────────────────

export interface PingStudent {
  first: string;
  log: AutoLog | null;
  /** the night-before plan's next step(s), e.g. "Sine rule and cosine rule" */
  plan: string[];
}

/** "Eva", "Eva and Ryan", "Eva, Ryan and Jun Wei". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const printedOf = (log: AutoLog | null) => (log?.phrases ?? []).filter((p) => !p.startsWith('handed in '));
const handedOf = (log: AutoLog | null) => (log?.phrases ?? []).filter((p) => p.startsWith('handed in ')).map((p) => p.slice('handed in '.length));

/**
 * The end-of-lesson ping, one per lesson (a group lesson names everyone):
 *   📒 Eva's lesson just ended — how did it go?
 *   Printed: sine rule and cosine rule (printed pack).
 *   Hold 🎤 and talk, or tap ✓ if the plan was followed.
 */
export function pingText(students: PingStudent[]): string {
  const firsts = students.map((s) => s.first);
  const group = students.length > 1;
  const L: string[] = [`${LINE_MARK} ${joinNames(firsts)}'s lesson just ended — how did it go?`];
  const tag = (s: PingStudent, words: string) => (group ? `${s.first} — ${words}` : words);
  const printed = students.filter((s) => printedOf(s.log).length).map((s) => tag(s, printedOf(s.log).join(', ')));
  if (printed.length) L.push(`Printed: ${printed.join('; ')}.`);
  const handed = students.filter((s) => handedOf(s.log).length).map((s) => tag(s, handedOf(s.log).join(', ')));
  if (handed.length) L.push(`Handed in: ${handed.join('; ')}.`);
  const plan = students.filter((s) => !printedOf(s.log).length && s.plan.length).map((s) => tag(s, s.plan.join(' + ')));
  if (plan.length) L.push(`Plan was: ${plan.join('; ')}.`);
  L.push(printed.length || plan.length ? 'Hold 🎤 and talk, or tap ✓ if the plan was followed.' : 'Hold 🎤 and talk about it.');
  return L.join('\n');
}

/** ✓ with nothing printed: the night-before plan becomes the log ("as planned"). */
export function planLog(plan: { courses?: { next?: { label: string; step: { t: string } } | null }[]; exam?: { label: string; subject: string } | null } | null | undefined): AutoLog | null {
  const steps = (plan?.courses ?? []).map((c) => c.next).filter((n): n is { label: string; step: { t: string } } => !!n);
  if (plan?.exam) return { topics: [], phrases: [`revision for ${plan.exam.subject} ${plan.exam.label} (as planned)`], homework: null, empty: false, inLesson: true };
  if (!steps.length) return null;
  return {
    topics: [...new Set(steps.map((s) => s.step.t))],
    phrases: steps.map((s) => `${s.label.replace(/^([A-Z])([a-z])/, (_, a: string, b: string) => a.toLowerCase() + b)} (as planned)`),
    homework: null, empty: false, inLesson: true,
  };
}

/** Lessons ended at the same date and slot time are one lesson to Adrian (a group class). */
export function groupKey(l: { date: string; time: string | null; end: string | null }): string {
  return `${l.date}|${l.time ?? l.end ?? ''}`;
}

/** Minutes between two 'HH:MM' clock readings (b − a). */
export function minutesBetween(a: string, b: string): number {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return m(b) - m(a);
}

/** Ping now? The lesson ended, and not so long ago that the ping would land stale. */
export function pingDue(end: string | null, now: string): boolean {
  if (!end) return false;
  const d = minutesBetween(end, now);
  return d >= 0 && d <= PING_LATE_MIN;
}

// ── reading the note ───────────────────────────────────────────────────────

/** The model's prompt — the same for a voice transcript, a typed reply and a correction. */
export function buildNotePrompt(input: {
  text: string;
  source: 'voice' | 'text';
  students: string[];
  canonical: string[];
  printed?: string | null;
  /** the note recorded before (one NoteRead, or by first name for a group) — the new text corrects it */
  previous?: unknown;
}): string {
  const who = input.students.length > 1
    ? `This was a GROUP lesson with ${joinNames(input.students)}. Put what applies to everyone in "all"; put anything said about one student only under "by" with their first name as the key.`
    : `The student is ${input.students[0] ?? 'the student'}. Use "by": {}.`;
  const prev = input.previous ? `\nWhat was recorded before (the new message CORRECTS or ADDS to it — return the full updated record, keep what it does not change): ${JSON.stringify(input.previous)}` : '';
  return `A Singapore maths tutor just finished a lesson and ${input.source === 'voice' ? 'recorded a quick voice note (transcribed below — expect transcription slips, Singlish and half sentences)' : 'typed a quick note'}. Read it into the lesson log.

${who}
${input.printed ? `Printed for the lesson beforehand: ${input.printed}\n` : ''}The note: """${input.text.slice(0, 1500)}"""${prev}

Topic names you may use (exact spelling): ${input.canonical.join('; ')}

Rules:
- topics: the topics the lesson covered, ONLY from the list; [] if none is named. "Sine rule" → the trigonometry topic that holds it.
- struggled: what the student found hard, as a short phrase that completes "struggled with …" ("which angle goes with which side in the sine rule", "subtracting the quartiles the wrong way round"); null if nothing.
- homework: what was set, in the tutor's words ("exercise 5", "TYS 2019 P1 Q3-6"); null if none.
- next: what to do next lesson, if the tutor said; null otherwise.
- attendance: late / left early / sick, in words; null otherwise. Never guess.
- mastery: "Strong" only if the tutor said they got it well, "Slow" only if the tutor said they were lost or need the topic again, "OK" if said it was fine; null if not said.
- other: anything else worth keeping, a few words in lower case ("got it fast", "prelims next week"); null otherwise. Not a repeat of another field.
- Never invent anything the note does not say.

Reply with ONE JSON object and nothing else:
{"all": {"topics": [], "struggled": null, "homework": null, "next": null, "attendance": null, "mastery": null, "other": null}, "by": {}}`;
}

const str = (v: unknown, n = 300): string | null => {
  const t = typeof v === 'string' ? v.trim().replace(/[.\s]+$/, '') : '';
  return t && !/^(null|none|n\/a|-)$/i.test(t) ? t.slice(0, n) : null;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function checkRead(o: unknown, canonical: string[]): Partial<NoteRead> {
  if (!o || typeof o !== 'object') return {};
  const r = o as Record<string, unknown>;
  const by = new Map(canonical.map((c) => [norm(c), c]));
  const out: Partial<NoteRead> = {};
  if (Array.isArray(r.topics)) out.topics = [...new Set(r.topics.map((t) => by.get(norm(String(t)))).filter((t): t is string => !!t))];
  for (const k of ['struggled', 'homework', 'next', 'attendance', 'other'] as const) {
    if (k in r) out[k] = str(r[k]);
  }
  if ('mastery' in r) out.mastery = r.mastery === 'Strong' || r.mastery === 'OK' || r.mastery === 'Slow' ? r.mastery : null;
  return out;
}

/** The model's JSON → a checked group read (topics only from the list, names only of the lesson's students); null when unreadable. */
export function parseNoteModel(text: string, canonical: string[], students: string[]): GroupRead | null {
  const m = /\{[\s\S]*\}/.exec(text ?? '');
  if (!m) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  const allSrc = o.all && typeof o.all === 'object' ? o.all : o; // a model that skipped the wrapper
  const all: NoteRead = { ...EMPTY_READ, ...checkRead(allSrc, canonical) };
  const by: Record<string, Partial<NoteRead>> = {};
  if (o.by && typeof o.by === 'object') {
    for (const [k, v] of Object.entries(o.by as Record<string, unknown>)) {
      const name = students.find((s) => norm(s) === norm(k) || norm(s.split(/\s+/)[0]) === norm(k));
      if (name) by[name] = checkRead(v, canonical);
    }
  }
  return { all, by };
}

/**
 * Without the model (the call failed, or no key): topics named in the note, "homework …",
 * "struggled with …" / "kept mixing up …", "next time …", "late". The floor the model is held to.
 */
export function parseNotePlain(text: string, canonical: string[]): GroupRead {
  const t = String(text ?? '').trim();
  const base = parseReplyPlain(t, canonical);
  const grab = (re: RegExp) => { const m = re.exec(t); return m ? m[1].trim().replace(/[.,;]+$/, '').slice(0, 300) || null : null; };
  const homework = grab(/\b(?:hw|homework)\b\s*(?:is|was|:|-|–)?\s*([^.;\n]+)/i);
  const struggled = grab(/\b(?:struggl\w*|stuck|confused|kept\s+(?:mixing up|getting wrong|forgetting))\s*(?:with|on|about)?\s*([^.;\n]+)/i);
  const next = grab(/\bnext\s+(?:time|lesson|week)\b\s*[:,-]?\s*([^.;\n]+)/i);
  const attendance = /\b(late|left early|sick|unwell)\b/i.test(t) ? grab(/([^.;\n]*\b(?:late|left early|sick|unwell)\b[^.;\n]*)/i) : null;
  return { all: { ...EMPTY_READ, topics: base.topics, homework, struggled, next, attendance }, by: {} };
}

/** One student's part of a group read: their own words win, the shared words fill the rest. */
export function noteFor(read: GroupRead, student: string): NoteRead {
  const own = read.by[student] ?? {};
  const pick = <K extends keyof NoteRead>(k: K): NoteRead[K] => (own[k] !== undefined && own[k] !== null && !(Array.isArray(own[k]) && !(own[k] as unknown[]).length) ? own[k] as NoteRead[K] : read.all[k]);
  return {
    topics: pick('topics'), struggled: pick('struggled'), homework: pick('homework'), next: pick('next'),
    attendance: pick('attendance'), mastery: pick('mastery'), other: pick('other'),
  };
}

/**
 * A correction on top of the note before it: what the correction says wins, what it leaves
 * empty keeps the earlier value (the model sometimes drops a field it was told to keep).
 */
export function mergeCorrection(prev: NoteRead | null | undefined, next: NoteRead): NoteRead {
  if (!prev) return next;
  const keep = <K extends keyof NoteRead>(k: K): NoteRead[K] => {
    const v = next[k];
    return (v === null || (Array.isArray(v) && !v.length)) ? (prev[k] ?? next[k]) : v;
  };
  return {
    topics: keep('topics'), struggled: keep('struggled'), homework: keep('homework'), next: keep('next'),
    attendance: keep('attendance'), mastery: keep('mastery'), other: keep('other'),
  };
}

/** Did the note say anything at all? */
export function isEmptyRead(r: NoteRead): boolean {
  return !r.topics.length && !r.struggled && !r.homework && !r.next && !r.attendance && !r.mastery && !r.other;
}

// ── writing it ─────────────────────────────────────────────────────────────

/** May the voice note write this lesson? An empty row, an auto log, or an earlier voice note — never a hand-written log. */
export function mayWriteVoice(fields: Record<string, unknown>): boolean {
  if (mayWriteAutoLog(fields)) return true;
  return String(fields['Lesson Notes'] ?? '').startsWith(VOICE_PREFIX);
}

/** The Lesson Notes text: what he said, then what was printed, marked as his voice note. */
export function voiceNotesText(r: NoteRead, log: AutoLog | null, source: 'voice' | 'text'): string {
  const bits = [
    r.struggled ? `struggled with ${r.struggled}` : null,
    r.attendance,
    r.other,
  ].filter(Boolean) as string[];
  const printed = log && !log.empty ? `Printed/handed in: ${log.phrases.join(', ')}.` : '';
  const said = bits.length ? `${bits.join('; ')}.` : '';
  return `${VOICE_PREFIX} ${[said, printed].filter(Boolean).join(' ') || 'lesson done'} — from your ${source === 'voice' ? 'voice note' : 'note'}`;
}

/** The Airtable Lessons patch. His topics win; the auto log's stand when he named none. Status is never touched. */
export function voiceFields(r: NoteRead, log: AutoLog | null, source: 'voice' | 'text'): Record<string, unknown> {
  const topics = r.topics.length ? r.topics : log?.topics ?? [];
  const f: Record<string, unknown> = { 'Lesson Notes': voiceNotesText(r, log, source), 'Progress Logged': true };
  if (topics.length) f['Topics Covered'] = topics.join(', ');
  if (r.homework) f['Homework Assigned'] = r.homework;
  if (r.next) f['Next Lesson Plan'] = r.next;
  if (r.mastery) f['Mastery'] = r.mastery;
  return f;
}

/** The auto log after the note (so the card, the progress note and the next suggestion see his topics). */
export function logAfterNote(log: AutoLog | null, r: NoteRead): AutoLog {
  const base: AutoLog = log ?? { topics: [], phrases: [], homework: null, empty: true, inLesson: false };
  return { ...base, topics: r.topics.length ? r.topics : base.topics, homework: r.homework ?? base.homework, empty: base.empty && !r.topics.length };
}

/** One short line per student: "Eva: sine rule; struggled with which angle goes where; homework ex 5". */
export function noteSummary(first: string, r: NoteRead, log: AutoLog | null): string {
  const topics = r.topics.length ? r.topics : log?.topics ?? [];
  const parts = [
    topics.length ? topics.join(', ') : null,
    r.struggled ? `struggled with ${r.struggled}` : null,
    r.homework ? `homework ${r.homework}` : null,
    r.next ? `next time ${r.next}` : null,
    r.attendance,
    r.mastery === 'Slow' ? 'same step again next time' : null,
    r.other,
  ].filter(Boolean);
  return `${first}: ${parts.length ? parts.join('; ') : 'logged, nothing else picked up'}`;
}

/** The reply to Adrian: "📒 Got it — Eva: …." Starts with 📒 so a reply to it is a correction. */
export function ackText(lines: string[], corrected = false): string {
  const head = `${LINE_MARK} ${corrected ? 'Fixed' : 'Got it'} — `;
  const body = lines.length === 1 ? `${lines[0]}.` : `\n${lines.map((l) => `• ${l}.`).join('\n')}`;
  return `${head}${body}\nReply to this to change anything.`;
}

// ── a voice note sent without replying ─────────────────────────────────────

export interface LooseCandidate { packId: string; name: string; end: string | null; date: string }

/**
 * A voice note Adrian sent without replying to a ping → the lessons it clearly names, among
 * today's lessons that ended up to LOOSE_AFTER_MIN before it (or LOOSE_BEFORE_MIN after).
 * A name is a student's first name or full name as a whole word (spaces optional, "Junwei"
 * = "Jun Wei"). No name → nothing (a guess would log the wrong child).
 */
export function matchLoose(transcript: string, candidates: LooseCandidate[], today: string, now: string): LooseCandidate[] {
  const said = ` ${transcript.toLowerCase().replace(/[^a-z]+/g, ' ')} `;
  const squashed = said.replace(/\s+/g, '');
  const near = candidates.filter((c) => {
    if (c.date !== today || !c.end) return false;
    const d = minutesBetween(c.end, now);
    return d >= -LOOSE_BEFORE_MIN && d <= LOOSE_AFTER_MIN;
  });
  const hit = near.filter((c) => {
    const parts = c.name.toLowerCase().replace(/[^a-z ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const first = parts[0] ?? '';
    if (first.length >= 3 && said.includes(` ${first} `)) return true;
    const full = parts.join('');
    if (full.length >= 5 && squashed.includes(full)) return true;
    // two-part given names ("Jun Wei") squashed together in the transcript
    const two = parts.slice(0, 2).join('');
    return parts.length >= 3 && two.length >= 5 && said.includes(` ${two} `);
  });
  return hit;
}

// ── on the card ────────────────────────────────────────────────────────────

/** "Last time: struggled with which angle goes where. Homework: exercise 5." — null when the note said nothing to show. */
export function lastTimeLine(n: Pick<NoteRead, 'struggled' | 'homework' | 'next' | 'topics'> | null | undefined): string | null {
  if (!n) return null;
  const bits = [
    n.struggled ? `struggled with ${n.struggled}.` : null,
    n.homework ? `Homework: ${n.homework}.` : null,
    n.next ? `You said for next time: ${n.next}.` : null,
  ].filter(Boolean);
  if (!bits.length) return n.topics?.length ? `Last time: ${n.topics.join(', ')}.` : null;
  const s = bits.join(' ');
  return `Last time: ${s}`;
}

/** Re-exported so callers need one import for the prefixes. */
export { AUTO_PREFIX };
