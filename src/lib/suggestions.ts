// 💡 Suggest something (5 Oct 2026, Adrian: "how about a suggestion button … that
// give a message students can suggest what they need for their exams, if reasonable
// and helpful - i will try to add it").
//
// Pure; tested. The rules for one suggestion: its length, the daily cap, which
// subject chips a student is offered, the statuses Adrian sets, and the one plain
// Telegram line he gets. The store is lib/suggestions-store.ts; the student's door
// is POST /api/portal/suggestions; his page is /admin/suggestions.

import { allowedSubjects, paperSubjectForMarkSubject, type SubjectAccount } from './portal-subjects';
import { studentSciences } from './portal-prefs';

export const MAX_SUGGESTION_CHARS = 500;
/** Suggestions a student may send in one Singapore day. */
export const DAILY_SUGGESTION_CAP = 3;

export const SUGGESTION_STATUSES = ['new', 'planned', 'done', 'no'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/** The words on Adrian's status buttons. */
export const STATUS_LABEL: Record<SuggestionStatus, string> = {
  new: 'New', planned: 'Planned', done: 'Done', no: 'Not now',
};

export function isSuggestionStatus(s: unknown): s is SuggestionStatus {
  return (SUGGESTION_STATUSES as readonly string[]).includes(String(s));
}

/**
 * The text as stored: trimmed, runs of blank lines folded to one, spaces inside a
 * line folded. `null` = nothing to send; a text over the limit is refused, never cut
 * (the box stops the student at the limit, so only a hand-made request gets here).
 */
export function cleanSuggestion(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const text = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return { ok: false, error: 'Write a few words first.' };
  if (text.length > MAX_SUGGESTION_CHARS) return { ok: false, error: `Keep it under ${MAX_SUGGESTION_CHARS} characters.` };
  return { ok: true, text };
}

/** The subject chips a student is offered: their maths subjects, then the sciences they take. */
export function suggestionSubjects(account: (SubjectAccount & { prefs?: unknown }) | null | undefined): string[] {
  const out: string[] = [...allowedSubjects(account)];
  const sci = studentSciences(account?.prefs);
  for (const s of sci?.subjects ?? []) {
    const name = paperSubjectForMarkSubject(s);
    if (name) out.push(name);
  }
  return out;
}

/** The subject as stored: one of the student's own chips, else null (a chip is optional). */
export function cleanSubject(raw: unknown, offered: readonly string[]): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return offered.includes(s) ? s : null;
}

/** May the student send another today? `sentToday` = their rows since SGT midnight. */
export function underDailyCap(sentToday: number): boolean {
  return sentToday < DAILY_SUGGESTION_CAP;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The Telegram line to the students topic: name, subject, the text. HTML. */
export function suggestionTelegramLine(s: { name?: string | null; subject?: string | null; text: string }): string {
  const name = esc((s.name || '').trim() || 'A student');
  const subject = s.subject ? ` · ${esc(s.subject)}` : '';
  return `💡 <b>${name}</b>${subject} suggests:\n${esc(s.text)}`;
}

/** Newest first, the new ones on top. */
export function sortSuggestions<T extends { status: string; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    Number(b.status === 'new') - Number(a.status === 'new') || b.created_at.localeCompare(a.created_at));
}
