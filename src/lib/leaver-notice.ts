// The Telegram line Adrian gets when a student downloads all their marked
// papers or deletes their account (2 Oct 2026). Pure; tested.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function leaverNotice(
  kind: 'download' | 'delete',
  who: { name?: string | null; email?: string | null; papers?: number; tuition?: boolean; left?: boolean },
): string {
  const name = esc((who.name || '').trim() || (who.email || '').trim() || 'A student');
  const email = who.name?.trim() && who.email?.trim() ? ` (${esc(who.email.trim())})` : '';
  const left = who.left ? '\nTheir account is deactivated.' : '';
  if (kind === 'download') {
    const n = who.papers ?? 0;
    return `⬇️ <b>${name}</b>${email} downloaded all their marked papers — ${n} paper${n === 1 ? '' : 's'}.${left}`;
  }
  return `🗑 <b>${name}</b>${email} deleted their app account.${who.tuition ? '\nA tuition student. Lessons and billing records are untouched.' : ''}${left}`;
}
