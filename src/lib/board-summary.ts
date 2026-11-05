// 🧑‍🏫 The student's summary of a shared board — the pure half (SPEC-TUTOR-TOOLS §8).
// Adrian, 6 Nov 2026: "i want the summary functionality to be for the student, not for the tutor" → "yes".
//
// The student taps Summary on their board and gets one phone screen:
//   What we did today · The method (from the board's own example) · Watch out (their own mistake today
//   and the fix) · Try these (two real questions from our bank, answers hidden until tapped).
// No one checks it before the student reads it, so it is held to the board: it is written only from the
// board's own words (lib/board-read page_text), and every number in it must be on the board — a line
// with a number that is not is sent back once, then dropped (numbersNotOnBoard). The practice questions
// come from the bank through the student serving door (practice_next + studentRow), never written here.
import type { PageText } from './shared-board';

export const SUMMARY_LEVELS = ['S1', 'S2', 'EM', 'AM', 'JC'] as const;
export type SummaryLevel = typeof SUMMARY_LEVELS[number];

export type SummaryPractice = { id: string; stem: string; parts: unknown[]; marks: number | null; figureUrl: string | null; answer: string };
export type BoardSummary = {
  sig: string; at: string;
  didToday: string[];
  method: { title: string; steps: string[] } | null;
  watchOut: { mistake: string; fix: string } | null;
  topic: string | null; level: SummaryLevel | null;
  practice: SummaryPractice[];
  usage?: { inTok: number; outTok: number; calls: number };
};

/** The board as it is read now: changes whenever any page's reading changes. */
export function summarySig(pageText: PageText): string {
  const keys = Object.keys(pageText ?? {}).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  const s = keys.map(k => `${k}:${pageText[String(k)]?.sig ?? ''}`).join('|');
  // FNV-1a, twice with different seeds — a change stamp, not a secret (this file is also used in the browser).
  const fnv = (seed: number) => { let h = seed >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  return fnv(0x811c9dc5) + fnv(0x01234567);
}

/** The board's words, page by page, for the writer (empty pages left out). */
export function boardTranscript(pageText: PageText, maxChars = 12_000): string {
  const keys = Object.keys(pageText ?? {}).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  const out = keys.map(k => ({ k, t: (pageText[String(k)]?.text ?? '').trim() })).filter(p => p.t).map(p => `--- Page ${p.k + 1} ---\n${p.t}`).join('\n\n');
  return out.slice(0, maxChars);
}

/** A tutor's free-text level ("Sec 4 A Math", "JC1", "E Math") or a paper subject → the bank's level. */
export function levelFrom(...hints: (string | null | undefined)[]): SummaryLevel | null {
  for (const raw of hints) {
    const h = (raw ?? '').toLowerCase();
    if (!h) continue;
    if (/\bh2\b|\bjc\b|jc ?[12]|a.?level/.test(h)) return 'JC';
    if (/\ba ?math|\bam\b|additional/.test(h)) return 'AM';
    if (/\be ?math|\bem\b|elementary/.test(h)) return 'EM';
    if (/sec(ondary)? ?1|\bs1\b/.test(h)) return 'S1';
    if (/sec(ondary)? ?2|\bs2\b/.test(h)) return 'S2';
  }
  return null;
}

export function buildSummaryPrompt(o: { transcript: string; level: SummaryLevel | null; topics: string[]; feedback?: string }): string {
  return `You are writing a short revision summary for a Singapore secondary or JC maths student, from the shared whiteboard of today's lesson with their tutor.
The whiteboard was read into text below (printed questions, the student's working, the tutor's working, red-pen marking notes). It may have small reading errors.

RULES
- Use ONLY what is on the board. Do not add examples, numbers or methods that are not on it. Every number you write must appear on the board.
- Write for the student, in short plain words, one idea per line. Say "you" to the student and "your tutor" for the tutor.
- Maths goes in $...$ (LaTeX), e.g. $x^2 - 5x + 6 = 0$.
- No warnings, no "check with your tutor", no mention of how this was written.
- If the board has too little maths to summarise, return "didToday": [] and nulls.

Return ONE JSON object and nothing else:
{
  "level": ${o.level ? `"${o.level}"` : 'one of "S1","S2","EM","AM","JC" — the level the board looks like, or null'},
  "topic": the ONE topic the lesson was mainly about, copied EXACTLY from the TOPICS list below, or null if none fits,
  "didToday": 1 to 3 short lines: what was done today (the questions or ideas),
  "method": { "title": a few words naming the main method, "steps": 2 to 6 short steps, shown on the board's own example } or null,
  "watchOut": { "mistake": the mistake the student made on the board today (from crossed-out working or a red-pen note), "fix": how to get it right } or null if there was no mistake on the board
}

TOPICS:
${o.topics.join('\n')}
${o.feedback ? `\nYOUR LAST TRY WAS SENT BACK: ${o.feedback}\n` : ''}
THE BOARD:
${o.transcript}`;
}

export type SummaryDraft = Pick<BoardSummary, 'didToday' | 'method' | 'watchOut' | 'topic' | 'level'>;

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Read the writer's JSON (it may wrap it in a fence); null when there is none. The topic must be in the list. */
export function parseSummary(raw: string, topics: readonly string[], knownLevel: SummaryLevel | null): SummaryDraft | null {
  const m = /\{[\s\S]*\}/.exec(raw ?? '');
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const didToday = Array.isArray(j.didToday) ? (j.didToday as unknown[]).map(x => str(x)).filter(Boolean).slice(0, 3) : [];
  const mt = j.method as Record<string, unknown> | null;
  const steps = mt && Array.isArray(mt.steps) ? (mt.steps as unknown[]).map(x => str(x)).filter(Boolean).slice(0, 6) : [];
  const method = mt && str(mt.title) && steps.length >= 2 ? { title: str(mt.title, 80), steps } : null;
  const wo = j.watchOut as Record<string, unknown> | null;
  const watchOut = wo && str(wo.mistake) && str(wo.fix) ? { mistake: str(wo.mistake), fix: str(wo.fix) } : null;
  const topic = typeof j.topic === 'string' && topics.includes(j.topic) ? j.topic : null;
  const level = knownLevel ?? (SUMMARY_LEVELS.includes(j.level as SummaryLevel) ? j.level as SummaryLevel : null);
  return { didToday, method, watchOut, topic, level };
}

/** The numbers in a line, as written: "x = 2.5" → ["2.5"]. LaTeX command names are ignored; single digits always pass. */
export function numbersIn(text: string): string[] {
  const plain = (text ?? '').replace(/\\[a-zA-Z]+/g, ' ');
  return (plain.match(/\d+(?:\.\d+)?/g) ?? []).filter(n => n.replace('.', '').length > 1);
}

/** The numbers in the draft that are nowhere on the board (each with the line it came from). */
export function numbersNotOnBoard(d: SummaryDraft, transcript: string): { number: string; line: string }[] {
  const board = new Set((transcript.match(/\d+(?:\.\d+)?/g) ?? []));
  const lines = [...d.didToday, ...(d.method ? [d.method.title, ...d.method.steps] : []), ...(d.watchOut ? [d.watchOut.mistake, d.watchOut.fix] : [])];
  const out: { number: string; line: string }[] = [];
  for (const line of lines) for (const n of numbersIn(line)) if (!board.has(n)) out.push({ number: n, line });
  return out;
}

/** After the second try: drop every line that still has a number not on the board (a method left with < 2 steps goes). */
export function dropUnsupported(d: SummaryDraft, transcript: string): SummaryDraft {
  const bad = new Set(numbersNotOnBoard(d, transcript).map(x => x.line));
  const ok = (l: string) => !bad.has(l);
  const steps = d.method ? d.method.steps.filter(ok) : [];
  return {
    ...d,
    didToday: d.didToday.filter(ok),
    method: d.method && ok(d.method.title) && steps.length >= 2 ? { title: d.method.title, steps } : null,
    watchOut: d.watchOut && ok(d.watchOut.mistake) && ok(d.watchOut.fix) ? d.watchOut : null,
  };
}

/** Anything worth showing? */
export function summaryHasContent(d: SummaryDraft): boolean {
  return d.didToday.length > 0 || !!d.method || !!d.watchOut;
}

// ── The note to the parent (Adrian, 6 Nov 2026: "summary would be a good thing to send to parents" → "yes") ──
// Made by the TUTOR, who reads and may edit it before sending it from their own WhatsApp. Three short parts in
// everyday words — less maths than the student's summary — written as the tutor speaking to the parent.
export type ParentNote = { worked: string; watch: string; help: string; at: string; edited?: boolean; usage?: { inTok: number; outTok: number; calls: number } };
export const PARENT_FIELD_MAX = 400;

export function buildParentPrompt(o: { transcript: string; childFirstName: string; feedback?: string }): string {
  return `You are helping a maths tutor in Singapore write a short note to a parent after today's lesson with their child, ${o.childFirstName}.
The lesson's whiteboard was read into text below (printed questions, the child's working, the tutor's working, red-pen marking notes).

RULES
- Use ONLY what is on the board. Every number you write must appear on the board.
- Write as the tutor, to the parent, in warm everyday English a busy parent understands in one read. Use "${o.childFirstName}" or "they".
- Very little maths: name the topic in plain words; at most one short expression if it really helps.
- No warnings, no mention of how this was written.

Return ONE JSON object and nothing else:
{
  "worked": one sentence: what we worked on today,
  "watch": one or two sentences: the one thing to watch (a mistake on the board today, in plain words), or what went well if there was no mistake,
  "help": one sentence: one small, concrete thing the parent can do at home this week
}
${o.feedback ? `\nYOUR LAST TRY WAS SENT BACK: ${o.feedback}\n` : ''}
THE BOARD:
${o.transcript}`;
}

export function parseParentNote(raw: string): Pick<ParentNote, 'worked' | 'watch' | 'help'> | null {
  const m = /\{[\s\S]*\}/.exec(raw ?? '');
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const f = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, PARENT_FIELD_MAX) : '');
  const out = { worked: f(j.worked), watch: f(j.watch), help: f(j.help) };
  return out.worked && out.watch && out.help ? out : null;
}

/** The numbers in a note that are not on the board (the same rule as the summary). */
export function parentNumbersNotOnBoard(n: Pick<ParentNote, 'worked' | 'watch' | 'help'>, transcript: string): string[] {
  return numbersNotOnBoard({ didToday: [n.worked, n.watch, n.help], method: null, watchOut: null, topic: null, level: null }, transcript).map(x => x.number);
}

/** What the tutor sends on WhatsApp with the parent's link. */
export function parentShareText(childFirstName: string, tutorName: string, link: string): string {
  return `Hi, a short note on today's maths lesson with ${childFirstName} — ${tutorName}: ${link}`;
}
