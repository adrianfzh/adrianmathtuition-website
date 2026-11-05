// ⚙️ Setting ideas (5 Nov 2026, Adrian: "but it can suggest to me, and i decide if we add that
// settings > build this (alert me in admin and telegram)"). A student asked the Telegram bot for
// a setting that does not exist yet ("send me answers in Chinese"). The bot never applies it: it
// saves the idea (grouped, with a count) and alerts Adrian. He decides here or on the Telegram
// card. Approved = ON THE TO-BUILD LIST, nothing more; declined = no more alerts.
// Bot side: handlers/settings.js recordIdea (bot repo, docs/COMMANDS.md §Settings in plain words).
// Tables (bot migration 0020): setting_suggestions + setting_suggestion_asks. Pure; tested.

export const IDEA_STATUSES = ['new', 'approved', 'declined'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  new: 'New',
  approved: '👍 To build',
  declined: '👎 No',
};

export function isIdeaStatus(v: unknown): v is IdeaStatus {
  return typeof v === 'string' && (IDEA_STATUSES as readonly string[]).includes(v);
}

export interface IdeaAsk { who: string | null; words: string; created_at: string }
export interface IdeaRow {
  id: number;
  name: string;
  status: IdeaStatus;
  ask_count: number;
  student_count: number;
  first_asked_at: string;
  last_asked_at: string;
  decided_at: string | null;
  decided_by: string | null;
  admin_note: string | null;
  asks: IdeaAsk[];
}

/** New first; inside a status, the most-asked first, then the most recent. */
export function sortIdeas<T extends Pick<IdeaRow, 'status' | 'student_count' | 'last_asked_at'>>(rows: T[]): T[] {
  const rank: Record<IdeaStatus, number> = { new: 0, approved: 1, declined: 2 };
  return rows.slice().sort((a, b) =>
    rank[a.status] - rank[b.status]
    || b.student_count - a.student_count
    || b.last_asked_at.localeCompare(a.last_asked_at));
}

/** "3 students · 4 asks" — the count line on a card. */
export function countLine(r: Pick<IdeaRow, 'student_count' | 'ask_count'>): string {
  const s = `${r.student_count} student${r.student_count === 1 ? '' : 's'}`;
  return r.ask_count > r.student_count ? `${s} · ${r.ask_count} asks` : s;
}
