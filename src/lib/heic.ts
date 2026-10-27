// 📱 iPhone HEIC photos — the pure half (27 Oct 2026, Adrian: "fix HEIC uploads for good").
//
// The bot's image library cannot decode HEIC, so a HEIC page that reached the marking
// queue failed its drawing three times (run 0a38a960, a Chrome upload from the Mac).
// Every photo door now turns HEIC into JPEG in the browser BEFORE upload
// (lib/heic-browser.ts: the browser's own decoder on Safari, heic2any everywhere else),
// and the bot converts anything that still arrives as HEIC when the paper is queued
// (bot lib/heic-photos.js). This file holds the checks both browser helpers share.

/** HEIC/HEIF by type or by file name (Chrome often reports an empty type for .heic). */
export function isHeicFile(f: { name?: string | null; type?: string | null }): boolean {
  const type = String(f.type || '').toLowerCase();
  if (type === 'image/heic' || type === 'image/heif' || type === 'image/heic-sequence' || type === 'image/heif-sequence') return true;
  return /\.(heic|heif)$/i.test(String(f.name || ''));
}

/** IMG_1234.HEIC → IMG_1234.jpg; a name with no extension gains .jpg; empty → photo.jpg. */
export function heicJpegName(name: string | null | undefined): string {
  const n = String(name || '').trim();
  if (!n) return 'photo.jpg';
  return /\.(heic|heif)$/i.test(n) ? n.replace(/\.(heic|heif)$/i, '.jpg') : `${n}.jpg`;
}

/** Scale (w, h) down so the longer side is at most maxEdge — never up. */
export function fitWithin(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const s = Math.min(1, maxEdge / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
