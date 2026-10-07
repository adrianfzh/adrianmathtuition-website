// 🚪 A private file opened by someone who is not signed in (7 Oct 2026).
//
// Adrian tapped "🖼 Images" under a marking message in Telegram and got
// {"error":"unauthorized"}: the button opens /api/files/<key>, Telegram's own browser
// had no admin session, and the file door answers 401 JSON — on purpose, because it
// also serves <img src> and PDF viewers, where a redirect would be wrong.
// A PAGE navigation is different: the person is looking at the answer. They are sent
// to /admin/open, which signs them in and then opens the file. Pure.

/** Is this request a person opening the link in a browser tab (not an image, a fetch or a script)? */
export function isPageNavigation(headers: { get(name: string): string | null }): boolean {
  const dest = (headers.get('sec-fetch-dest') || '').toLowerCase();
  if (dest) return dest === 'document';
  const mode = (headers.get('sec-fetch-mode') || '').toLowerCase();
  if (mode) return mode === 'navigate';
  // Older browsers send neither: a tab asks for HTML first, an <img> never does.
  return /^\s*text\/html/i.test(headers.get('accept') || '');
}

/** Only a path of our own file door may be opened after sign-in — never an outside address. */
export function safeFilePath(raw: string | null | undefined): string | null {
  const v = String(raw || '');
  if (!/^\/api\/files\/[A-Za-z0-9._~%!$&'()*+,;=:@/-]+$/.test(v)) return null;
  if (v.includes('//') || v.includes('..') || v.includes('\\')) return null;
  return v;
}

/** Where a signed-out page navigation to `pathname` is sent. */
export function openDoorUrl(pathname: string): string {
  return `/admin/open?file=${encodeURIComponent(pathname)}`;
}
