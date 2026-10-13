// 🔑 A student changed their password (Adrian, 13 Oct 2026: "notify me when student
// changes password"). Pure; tested. The page that changed it (the reset email's page or
// Settings) calls POST /api/portal/password-changed after the change works; the route
// checks the login really changed in the last few minutes, then sends this one line to
// the students topic. The password itself is never sent anywhere.

export type PasswordChangeWhere = 'reset' | 'settings';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** True when the login was updated within `withinMs` of `now` — a stale call is not a change. */
export function changedRecently(updatedAt: string | null | undefined, now: number, withinMs = 5 * 60_000): boolean {
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt);
  return Number.isFinite(t) && now - t >= -60_000 && now - t <= withinMs;
}

export function passwordChangedLine(s: { name?: string | null; email?: string | null; where: PasswordChangeWhere }): string {
  const who = esc((s.name || '').trim() || (s.email || '').trim() || 'A student');
  const how = s.where === 'reset' ? 'from the reset email' : 'in Settings';
  return `🔑 <b>${who}</b> changed their password (${how}).`;
}
