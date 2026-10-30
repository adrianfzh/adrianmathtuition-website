// Which admin links are FILE doors (29 Oct 2026, Adrian: "when i go into images on phone,
// there are no options for me to go back or to download/save"). The admin hub is installed
// on his phone (manifest-admin.json, display 'standalone'); inside it a same-site link that
// opens a PDF shows the file full-screen with no toolbar — no back, no save. Those links go
// to the share sheet instead (components/AdminFileDoors.tsx). Pure: no DOM here.

/** A same-site /api/ link opened in a new tab or as a download — the ones that hand back a file. */
export function isFileDoor(href: string, origin: string, opts: { newTab: boolean; download: boolean }): boolean {
  if (!opts.newTab && !opts.download) return false;
  let u: URL;
  try { u = new URL(href, origin); } catch { return false; }
  if (u.origin !== origin) return false;   // another site opens in its own viewer, which has Done
  return u.pathname.startsWith('/api/') || /\.pdf$/i.test(u.pathname);
}

const EXT: Record<string, string> = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/zip': 'zip', 'text/csv': 'csv',
};

/** The file name to share: the link's ?name=, else its last path piece, with the right ending. */
export function shareFileName(href: string, origin: string, contentType: string): string {
  const u = new URL(href, origin);
  const type = contentType.split(';')[0].trim().toLowerCase();
  const ext = EXT[type] ?? '';
  let base = u.searchParams.get('name') || decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || 'file');
  base = base.replace(/[\\/:*?"<>|]/g, '-').trim() || 'file';
  // No date in a name that is sent on (30 Oct 2026, Adrian: "remove the date when
  // sending"): "Abel — paper 1 — 28 Oct 2026.pdf" goes out as "Abel — paper 1.pdf".
  base = base.replace(/\s*—\s*\d{1,2} [A-Z][a-z]{2,8} \d{4}(?=(\.[a-z0-9]{2,4})?$)/i, '').trim() || base;
  if (ext && !base.toLowerCase().endsWith(`.${ext}`)) base = `${base.replace(/\.[a-z0-9]{2,4}$/i, '')}.${ext}`;
  return base;
}

/** Only real files go to the share sheet; a page (HTML) or JSON still opens as before. */
export function isShareableType(contentType: string): boolean {
  const t = contentType.split(';')[0].trim().toLowerCase();
  return t !== '' && !t.startsWith('text/html') && t !== 'application/json';
}
