// "Keeps coming up" — the Notebook's opt-in soft signal from what a student ASKS
// (Adrian, 10 Sep 2026: "perhaps we can leave it as a toggle in setting … like
// how claude have toggles in settings for students preferences", then "should
// be by skill").
//
// The mistakes list (notebook-mistakes.ts) is fed by verdicts: a released marked
// paper's lost parts and graded practice attempts. A question asked through the
// Ask tab carries NO verdict — the student asked, they did not get it wrong — so
// it never counts there. This module is the softer line beside it: a SKILL the
// student asked the bot about ASK_SIGNAL_MIN or more times inside one fortnight
// is "coming up"; when the following fortnight is quieter it is "coming up
// less"; after that it is gone.
//
// The skill is the bank's sub-group (`subgroups.name` — "Proofs using the
// Pythagorean identity", the filing Find and Practice already share), stamped
// by the bot on every linked ask into Supabase `ask_skills` (bot
// lib/ask-skill.js). An ask the bot could not file under a sub-group falls back
// to its topic, so a line is never lost — but a topic line and a skill line
// never merge. Nothing is stored on the app side: lines are derived at render
// time from the rows, so the fade needs no sweep and the switch no cleanup.
//
// Off by default; on only when `portal_accounts.prefs.ask_signal === true`
// (Settings → "Show skills I keep asking about", lib/portal-prefs.ts whitelist).
//
// Pure: no I/O. The Supabase read is lib/ask-signal-store.ts.

export const ASK_SIGNAL_PREF = 'ask_signal';
/** Asks about one skill inside a fortnight before it becomes a line. */
export const ASK_SIGNAL_MIN = 3;
/** The fortnight. */
export const ASK_WINDOW_DAYS = 14;
/** How far back a line can still be derived (this fortnight + the one before). */
export const ASK_LOOKBACK_DAYS = ASK_WINDOW_DAYS * 2;
/** A timestamp this far ahead of "now" is clock skew, not the future. */
const SKEW_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

export type AskSubject = 'AM' | 'EM' | null;

/** One ask, as ask_skills records it. */
export interface AskRow {
  /** The bank sub-skill the bot filed the ask under; null when it could not. */
  skill: string | null | undefined;
  /** The canonical topic ("Trigonometry (Identities)"); a legacy "AM: …" prefix is tolerated. */
  topic: string | null | undefined;
  /** 'AM' | 'EM' when the ask was an O-Level paper's; anything else counts as none. */
  subject?: string | null | undefined;
  /** ISO instant of the ask. */
  at: string | null | undefined;
}

export type AskSignalState = 'up' | 'less';

export interface AskSignalLine {
  /** Grouping key — `skill:` or `topic:` plus the case-folded name. */
  key: string;
  /** The sub-skill, or null for a topic-only line. */
  skill: string | null;
  /** The topic (the line's own topic, or the skill's). */
  topic: string;
  /** The paper when every ask carried the same one, else null. */
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
 * Split a topic label into paper prefix + topic. The bot's Topic labels are
 * "AM: …" / "EM: …" on the web path and bare on Telegram; ask_skills stores
 * the bare topic, but a prefixed one is still understood. Blank, "unknown"
 * and "general" are not topics.
 */
export function parseAskTopic(label: unknown): { subject: AskSubject; topic: string } | null {
  if (typeof label !== 'string') return null;
  let text = label.trim();
  let subject: AskSubject = null;
  const m = /^(AM|EM|JC2?|S[1-4])\s*:\s*(.*)$/i.exec(text);
  if (m) {
    const p = m[1].toUpperCase();
    subject = p === 'AM' || p === 'EM' ? p : null;
    text = m[2].trim();
  }
  if (!text || /^(unknown|general|none|n\/a|-)$/i.test(text)) return null;
  return { subject, topic: text };
}

/** Case- and punctuation-insensitive grouping key. */
export function askTopicKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function subjectOf(raw: unknown): AskSubject {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return s === 'AM' || s === 'EM' ? s : null;
}

interface Group {
  skill: string | null;
  topics: Map<string, number>;
  subjects: Set<AskSubject>;
  recent: number;
  previous: number;
  lastAt: number;
}

/**
 * Derive the lines from the student's asks. Rows outside the look-back, with
 * no usable topic or an unparseable time are ignored. Asks group by skill
 * when the bot filed one, else by topic. A group with ASK_SIGNAL_MIN+ asks in
 * the last fortnight is `up`; otherwise ASK_SIGNAL_MIN+ in the fortnight
 * before makes it `less`; anything else is not a line.
 * Order: up before less, then the busier line, then the most recent ask.
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
    const skill = typeof row.skill === 'string' && row.skill.trim() ? row.skill.trim() : null;
    const key = skill ? `skill:${askTopicKey(skill)}` : `topic:${askTopicKey(parsed.topic)}`;
    if (key === 'skill:' || key === 'topic:') continue;
    let g = groups.get(key);
    if (!g) {
      g = { skill, topics: new Map(), subjects: new Set(), recent: 0, previous: 0, lastAt: 0 };
      groups.set(key, g);
    }
    g.topics.set(parsed.topic, (g.topics.get(parsed.topic) ?? 0) + 1);
    g.subjects.add(subjectOf(row.subject) ?? parsed.subject);
    if (t >= recentFrom) g.recent += 1;
    else g.previous += 1;
    if (t > g.lastAt) g.lastAt = t;
  }

  const lines: AskSignalLine[] = [];
  for (const [key, g] of groups) {
    const state: AskSignalState | null =
      g.recent >= ASK_SIGNAL_MIN ? 'up' : g.previous >= ASK_SIGNAL_MIN ? 'less' : null;
    if (!state) continue;
    let topic = '';
    let best = -1;
    for (const [name, n] of g.topics) {
      if (n > best) { best = n; topic = name; }
    }
    const subject = g.subjects.size === 1 ? [...g.subjects][0] : null;
    lines.push({
      key,
      skill: g.skill,
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
    return askLineTitle(a).localeCompare(askLineTitle(b));
  });
}

/** The bold line: the skill, or the topic when the bot could not file the ask. */
export function askLineTitle(line: Pick<AskSignalLine, 'skill' | 'topic'>): string {
  return line.skill ?? line.topic;
}

/** The grey line under a skill: its topic (with the paper when known). Empty for a topic-only line. */
export function askLineContext(line: Pick<AskSignalLine, 'skill' | 'topic' | 'subject'>): string {
  if (!line.skill) return '';
  return line.subject ? `${line.subject} · ${line.topic}` : line.topic;
}

/** The state word on the pill. */
export function askStateLabel(state: AskSignalState): string {
  return state === 'up' ? 'Keeps coming up' : 'Coming up less';
}

/** The line under the title — what happened, in the student's terms. */
export function askSignalLine(line: AskSignalLine): string {
  if (line.state === 'up') {
    return `you asked about this ${line.recent} times in the last 2 weeks`;
  }
  return `${line.previous} times the fortnight before · ${line.recent === 0 ? 'none since' : `${line.recent} since`}`;
}
