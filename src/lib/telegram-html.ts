// Telegram HTML parse-mode escaper — the three characters Telegram's HTML
// mode treats as markup. Lived in lib/requests.ts until the student-request
// lane was retired on 6 Sep 2026; kept here because the /join flow's Telegram
// ping still needs it.
export function escapeTelegramHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
