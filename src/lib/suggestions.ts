// 💡 Suggestions (5 Oct 2026, Adrian: "how about a suggestion button … that give a
// message students can suggest what they need for their exams, if reasonable and
// helpful - i will try to add it"; then: one text box, a "Stay anonymous" box, no
// subjects, no daily limit).
//
// Pure; tested. The rules for one suggestion: its length, the duplicate guard (the
// only abuse guard, and it needs no identity), the statuses Adrian sets, and the one
// plain Telegram line he gets. The store is lib/suggestions-store.ts; the student's
// page is /app/suggestions (POST /api/portal/suggestions); his is /admin/suggestions.

export const MAX_SUGGESTION_CHARS = 500;
/** The same text sent again within this long is dropped quietly (a double tap, a resend). */
export const DUPLICATE_WINDOW_MS = 60_000;

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
 * line folded. A text over the limit is refused, never cut (the box stops the
 * student at the limit, so only a hand-made request gets here).
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

/** Is this text an exact repeat of one stored in the last minute? Compared case-blind. */
export function isRecentDuplicate(text: string, recent: { text: string; created_at: string }[], now: number): boolean {
  const key = text.trim().toLowerCase();
  return recent.some((r) => r.text.trim().toLowerCase() === key && now - Date.parse(r.created_at) < DUPLICATE_WINDOW_MS);
}

/** What a stored row holds about who sent it. Anonymous = nothing at all. */
export function senderFields(
  anonymous: boolean,
  who: { accountId: string; identity: string; name: string | null },
): { anonymous: boolean; account_id: string | null; airtable_student_id: string | null; student_name: string | null } {
  return anonymous
    ? { anonymous: true, account_id: null, airtable_student_id: null, student_name: null }
    : { anonymous: false, account_id: who.accountId, airtable_student_id: who.identity, student_name: who.name };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The Telegram line to the students topic: who (or "Anonymous") and the text. HTML. */
export function suggestionTelegramLine(s: { name?: string | null; anonymous: boolean; text: string }): string {
  const who = s.anonymous ? 'Anonymous' : esc((s.name || '').trim() || 'A student');
  return `💡 <b>${who}</b> suggests:\n${esc(s.text)}`;
}

/** Newest first, the new ones on top. */
export function sortSuggestions<T extends { status: string; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    Number(b.status === 'new') - Number(a.status === 'new') || b.created_at.localeCompare(a.created_at));
}
