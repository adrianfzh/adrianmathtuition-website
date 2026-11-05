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

// ── The Telegram card (5 Nov 2026, Adrian: "Yes" to "when you decide on the website, the Telegram
// card changes straight away"). The words are the bot's own (bot lib/settings-words.js
// ideaCardText + handlers/settings.js handleIdeaCallback), so the card reads the same whichever
// side decided. Decided → the decision line and no buttons; back to New (Undo) → the buttons again.

export interface IdeaCardRow {
  id: number; name: string; status: IdeaStatus; ask_count: number; student_count: number;
  first_who: string | null; first_words: string | null;
}

export function ideaCardText(r: IdeaCardRow): string {
  return [
    '💡 New setting idea from the bot',
    '',
    `"${r.name}"`,
    `Asked by: ${r.first_who || 'a student'} — "${String(r.first_words || '').slice(0, 200)}"`,
    `Students asking: ${r.student_count}${r.ask_count > r.student_count ? ` (${r.ask_count} asks)` : ''}`,
    '',
    'The bot did not change anything. 👍 Add it puts it on the to-build list (nothing is built or switched on). 👎 No stops these alerts.',
  ].join('\n');
}

export const DECISION_LINE: Record<Exclude<IdeaStatus, 'new'>, string> = {
  approved: '👍 Added to the to-build list on the admin site. Nothing was built or switched on.',
  declined: '👎 Declined on the admin site — no more alerts about this idea.',
};

/** What the Telegram card should become after a decision on the website. */
export function ideaCardEdit(r: IdeaCardRow): { text: string; reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] } } {
  if (r.status === 'new') {
    return { text: ideaCardText(r), reply_markup: { inline_keyboard: [[
      { text: '👍 Add it', callback_data: `sg_ok:${r.id}` },
      { text: '👎 No', callback_data: `sg_no:${r.id}` },
    ]] } };
  }
  return { text: `${ideaCardText(r)}\n\n${DECISION_LINE[r.status]}`, reply_markup: { inline_keyboard: [] } };
}
