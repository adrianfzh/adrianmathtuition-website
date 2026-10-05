// The lesson log that fills itself (5 Oct 2026). Adrian: "i hardly use lesson
// log even after so many iterations, need something more helpful or
// automatable, that just logs without me doing anything.. how to do it for
// physical lessons..."
//
// What already happens in a physical lesson becomes the log, with no typing:
//   - an item printed from the student's Next lesson page that day (or given)
//   - a sheet the kiosk printed for them that day
//   - work they handed in from the lesson day up to two days after
// At the lesson's end ONE Telegram ping asks how it went (lib/lesson-voice.ts:
// a voice note, a typed reply or ✓); no reply = the entry stands as "auto (not confirmed)".
// Pure pieces here (tested in lesson-autolog.test.ts); the I/O lives in
// lib/next-lesson-store.ts and the two crons.

/** Every auto entry's Lesson Notes starts with this, so a hand-written log is never overwritten. */
export const AUTO_PREFIX = 'Auto log:';
export const AUTO_UNCONFIRMED = 'auto (not confirmed)';
export const AUTO_CONFIRMED = 'confirmed by Adrian';
/** The end-of-lesson line's first characters — the bot knows a reply is to one of these by it. */
export const LINE_MARK = '📒';
/** Hand-ins this many days after the lesson still count as the lesson's work. */
export const HANDIN_DAYS = 2;

/** The ✓ under the line: "ll:ok:<pack uuid>" (≤ 64 bytes), handled by the bot (lib/lesson-log.js). */
export function okCallback(packId: string): string {
  return `ll:ok:${packId}`;
}

/** Slot `Time` → the end, 'HH:MM' 24h: '5-7pm' → '19:00', '11am-1pm' → '13:00', '9-11am' → '11:00'. */
export function slotEndHHMM(time: string | null | undefined): string | null {
  const m = /-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*$/i.exec(String(time ?? '').trim());
  if (!m) return null;
  let h = Number(m[1]);
  if (h < 1 || h > 12) return null;
  const pm = m[3].toLowerCase() === 'pm';
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

export interface PrintedItem { title: string; topic: string | null; kind: string; label?: string | null }
export interface HandedIn { name: string; topics?: string[] }

export interface AutoLog {
  /** canonical topics, for `Topics Covered` */
  topics: string[];
  /** short phrases for the line and the notes, most important first */
  phrases: string[];
  homework: string | null;
  empty: boolean;
  /** something was printed / given / kiosk-printed for the lesson — only then does Adrian get the line */
  inLesson: boolean;
}

const lcFirst = (s: string) => s.replace(/^([A-Z])([a-z])/, (_, a: string, b: string) => a.toLowerCase() + b);

/** What happened in the lesson, from what was printed, kiosk-printed and handed in. */
export function composeAutoLog(input: { printed: PrintedItem[]; kiosk?: { topic: string }[]; handins?: HandedIn[] }): AutoLog {
  const topics: string[] = [];
  const phrases: string[] = [];
  const addTopic = (t: string | null | undefined) => { const s = (t ?? '').trim(); if (s && !topics.includes(s)) topics.push(s); };
  const addPhrase = (p: string) => { if (!phrases.includes(p)) phrases.push(p); };

  const order: Record<string, number> = { practice: 0, chat: 1, set: 2, 'practice-again': 3, warmup: 4 };
  const printed = [...input.printed].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  for (const p of printed) {
    const what = lcFirst(p.label || p.topic || p.title);
    if (p.kind === 'warmup') addPhrase(`warm-up on ${what}`);
    else if (p.kind === 'set') addPhrase(`${p.title} (printed)`);
    else if (p.kind === 'practice-again') addPhrase('their Practice Again sheet');
    else addPhrase(`${what} (printed pack)`);
    // a warm-up is revision of old mistakes, not today's topic
    if (p.kind !== 'warmup' && p.kind !== 'practice-again') addTopic(p.topic);
  }
  for (const k of input.kiosk ?? []) { addTopic(k.topic); addPhrase(`${lcFirst(k.topic)} (kiosk sheet)`); }
  for (const h of input.handins ?? []) {
    addPhrase(`handed in ${h.name}`);
  }
  return { topics, phrases, homework: null, empty: phrases.length === 0, inLesson: printed.length + (input.kiosk?.length ?? 0) > 0 };
}

/** The Lesson Notes text of an auto entry. */
export function autoNotes(log: AutoLog, state: 'unconfirmed' | 'confirmed', extra?: string | null): string {
  const what = log.empty ? 'nothing recorded' : log.phrases.join(', ');
  const tail = state === 'confirmed' ? AUTO_CONFIRMED : AUTO_UNCONFIRMED;
  return `${AUTO_PREFIX} ${what}${extra ? `. Adrian: ${extra}` : ''} — ${tail}`;
}

/** May the auto log write this lesson? Only when nobody logged it by hand. */
export function mayWriteAutoLog(fields: Record<string, unknown>): boolean {
  if (!fields['Progress Logged']) return true;
  return String(fields['Lesson Notes'] ?? '').startsWith(AUTO_PREFIX);
}

/** The Airtable patch for an auto entry (Topics Covered as the comma string every writer uses). */
export function autoLogFields(log: AutoLog, state: 'unconfirmed' | 'confirmed', extra?: string | null): Record<string, unknown> {
  const f: Record<string, unknown> = { 'Lesson Notes': autoNotes(log, state, extra), 'Progress Logged': true };
  if (log.topics.length) f['Topics Covered'] = log.topics.join(', ');
  if (log.homework) f['Homework Assigned'] = log.homework;
  return f;
}

/**
 * A reply in plain words, read without a model (the fallback when the model
 * call fails, and the floor it is checked against): canonical topics named in
 * it, and "hw: …" / "homework …" as the homework.
 */
export function parseReplyPlain(text: string, canonical: string[]): { topics: string[]; homework: string | null; note: string } {
  const t = String(text ?? '').trim();
  const lower = ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const topics: string[] = [];
  // longest names first, so "Trigonometry (Identities)" beats "Trigonometry"
  for (const c of [...canonical].sort((a, b) => b.length - a.length)) {
    const key = ` ${c.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
    if (key.trim().length >= 4 && lower.includes(key) && !topics.some((x) => x.toLowerCase().includes(c.toLowerCase()))) topics.push(c);
  }
  const hw = /\b(?:hw|homework)\b\s*[:\-–]?\s*(.+)$/i.exec(t);
  return { topics, homework: hw ? hw[1].trim().slice(0, 300) || null : null, note: t.slice(0, 500) };
}

// A reply to the ping (voice or typed) is read by lib/lesson-voice.ts (buildNotePrompt /
// parseNoteModel, parseNotePlain on top of parseReplyPlain) — ONE reader since 5 Oct 2026.
