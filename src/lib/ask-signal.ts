// "Keeps coming up" — the Notebook's opt-in soft signal from what a student ASKS
// (Adrian, 10 Sep 2026: "perhaps we can leave it as a toggle in setting … like
// how claude have toggles in settings for students preferences").
//
// The mistakes list (notebook-mistakes.ts) is fed by verdicts: a released marked
// paper's lost parts and graded practice attempts. A question asked through the
// Ask tab carries NO verdict — the student asked, they did not get it wrong — so
// it never counts there. This module is the softer line beside it: a topic the
// student asked the bot about ASK_SIGNAL_MIN or more times inside one fortnight
// is "coming up"; when the following fortnight is quieter it is "coming up
// less"; after that it is gone. Nothing is stored — the lines are derived at
// render time from the bot's Airtable `Questions` log (one row per ask, `Topic`
// stamped by the bot's classifier, `Student` linked when the portal token
// identified them), so the fade needs no sweep and the switch needs no cleanup.
//
// Off by default; on only when `portal_accounts.prefs.ask_signal === true`
// (Settings → "Count what I ask about", lib/portal-prefs.ts whitelist).
//
// Pure: no I/O. The Airtable read is lib/ask-signal-store.ts.

export const ASK_SIGNAL_PREF = 'ask_signal';
/** Asks about one topic inside a fortnight before it becomes a line. */
export const ASK_SIGNAL_MIN = 3;
/** The fortnight. */
export const ASK_WINDOW_DAYS = 14;
/** How far back a line can still be derived (this fortnight + the one before). */
export const ASK_LOOKBACK_DAYS = ASK_WINDOW_DAYS * 2;
/** A Timestamp this far ahead of "now" is clock skew, not the future. */
const SKEW_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

export type AskSubject = 'AM' | 'EM' | null;

/** One ask, as the Questions log records it. */
export interface AskRow {
  /** The bot's Topic label — "AM: Trigonometry (Identities)", "EM: Mensuration", or bare "Vectors". */
  topic: string | null | undefined;
  /** ISO instant of the ask (Airtable `Timestamp`). */
  at: string | null | undefined;
}

export type AskSignalState = 'up' | 'less';

export interface AskSignalLine {
  /** Grouping key — the topic with its paper prefix stripped, case-folded. */
  key: string;
  /** The topic as the bot most often spelt it (prefix stripped). */
  topic: string;
  /** The paper prefix when every ask carried the same one, else null. */
  subject: AskSubject;
  /** Asks in the last ASK_WINDOW_DAYS. */
  recent: number;
  /** Asks in the fortnight before that. */
  previous: number;
  state: AskSignalState;
  /** ISO instant of the latest ask counted. */
  lastAt: string;
}

/** True only for an explicit `true` — a missing or malformed prefs blob is "off". */
export function askSignalOn(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return false;
  return (prefs as Record<string, unknown>)[ASK_SIGNAL_PREF] === true;
}

/**
 * Split the bot's label into paper prefix + topic. The web solver writes
 * "AM: …" / "EM: …"; the Telegram path writes the bare topic; science rows
 * carry no topic at all. Blank, "unknown" and "general" are not topics.
 */
export function parseAskTopic(label: unknown): { subject: AskSubject; topic: string } | null {
  if (typeof label !== 'string') return null;
  let text = label.trim();
  let subject: AskSubject = null;
  const m = /^(AM|EM)\s*:\s*(.*)$/i.exec(text);
  if (m) {
    subject = m[1].toUpperCase() as 'AM' | 'EM';
    text = m[2].trim();
  }
  if (!text || /^(unknown|general|none|n\/a|-)$/i.test(text)) return null;
  return { subject, topic: text };
}

/** Case- and punctuation-insensitive grouping key. */
export function askTopicKey(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

interface Group {
  spellings: Map<string, number>;
  subjects: Set<AskSubject>;
  recent: number;
  previous: number;
  lastAt: number;
}

/**
 * Derive the lines from the student's asks. Rows outside the look-back, with
 * no usable topic or an unparseable time are ignored. A topic with
 * ASK_SIGNAL_MIN+ asks in the last fortnight is `up`; otherwise ASK_SIGNAL_MIN+
 * in the fortnight before makes it `less`; anything else is not a line.
 * Order: up before less, then the busier topic, then the most recent ask.
 */
export function askSignalLines(rows: readonly AskRow[], now: Date = new Date()): AskSignalLine[] {
  const nowMs = now.getTime();
  const recentFrom = nowMs - ASK_WINDOW_DAYS * DAY_MS;
  const lookbackFrom = nowMs - ASK_LOOKBACK_DAYS * DAY_MS;
  const groups = new Map<string, Group>();

  for (const row of rows) {
    const parsed = parseAskTopic(row.topic);
    if (!parsed) continue;
    const t = typeof row.at === 'string' ? Date.parse(row.at) : NaN;
    if (!Number.isFinite(t) || t < lookbackFrom || t > nowMs + SKEW_MS) continue;
    const key = askTopicKey(parsed.topic);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = { spellings: new Map(), subjects: new Set(), recent: 0, previous: 0, lastAt: 0 };
      groups.set(key, g);
    }
    g.spellings.set(parsed.topic, (g.spellings.get(parsed.topic) ?? 0) + 1);
    g.subjects.add(parsed.subject);
    if (t >= recentFrom) g.recent += 1;
    else g.previous += 1;
    if (t > g.lastAt) g.lastAt = t;
  }

  const lines: AskSignalLine[] = [];
  for (const [key, g] of groups) {
    const state: AskSignalState | null =
      g.recent >= ASK_SIGNAL_MIN ? 'up' : g.previous >= ASK_SIGNAL_MIN ? 'less' : null;
    if (!state) continue;
    let topic = key;
    let best = -1;
    for (const [spelling, n] of g.spellings) {
      if (n > best) { best = n; topic = spelling; }
    }
    const subject = g.subjects.size === 1 ? [...g.subjects][0] : null;
    lines.push({
      key,
      topic,
      subject,
      recent: g.recent,
      previous: g.previous,
      state,
      lastAt: new Date(g.lastAt).toISOString(),
    });
  }

  return lines.sort((a, b) => {
    if (a.state !== b.state) return a.state === 'up' ? -1 : 1;
    const an = a.state === 'up' ? a.recent : a.previous;
    const bn = b.state === 'up' ? b.recent : b.previous;
    if (an !== bn) return bn - an;
    if (a.lastAt !== b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
    return a.topic.localeCompare(b.topic);
  });
}

/** The state word on the pill. */
export function askStateLabel(state: AskSignalState): string {
  return state === 'up' ? 'Keeps coming up' : 'Coming up less';
}

/** The line under the topic — what happened, in the student's terms. */
export function askSignalLine(line: AskSignalLine): string {
  if (line.state === 'up') {
    return `you asked about this ${line.recent} times in the last 2 weeks`;
  }
  return `${line.previous} times the fortnight before · ${line.recent === 0 ? 'none since' : `${line.recent} since`}`;
}
