// 📱 iPhone HEIC → JPEG in the browser, before anything is uploaded (27 Oct 2026).
// Browser-only. Every photo door that feeds marking calls this on the picked files:
// /admin/mark-paper, /app/submit (+ ➕ Add pages, the tutor-marked door) and the
// practice photo / Snap / Notebook doors (app/practice/image-downscale.ts).
//
// Step 1: the browser's own decoder (Safari, and Chrome where the OS has the codec)
// draws it onto a canvas. Step 2: heic2any (libheif in the browser, loaded only when a
// HEIC arrives and step 1 failed — Chrome/Edge/Firefox). If both fail the ORIGINAL
// file is returned: it still uploads, and the bot converts it when the paper is queued
// (bot lib/heic-photos.js), so nothing is lost — only the preview is missing.
import { fitWithin, heicJpegName, isHeicFile } from './heic';

/** The site's full-resolution original cap (mark-paper HIRES_MAX_EDGE): ≈300 dpi on A4,
 *  and inside iOS Safari's canvas area limit (a 24 MP iPhone photo is not). */
export const HEIC_MAX_EDGE = 3500;

async function viaCanvas(file: Blob, maxEdge: number, quality: number): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const { w, h } = fitWithin(bmp.width, bmp.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
  } catch { return null; }
}

async function viaHeic2any(file: Blob, maxEdge: number, quality: number): Promise<Blob | null> {
  try {
    const heic2any = (await import('heic2any')).default;
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality });
    const jpeg = Array.isArray(out) ? out[0] : out;
    if (!jpeg) return null;
    // Bring it down to the cap (a decoded JPEG always draws, on every browser).
    return (await viaCanvas(jpeg, maxEdge, quality)) || jpeg;
  } catch { return null; }
}

/** A HEIC/HEIF file → a JPEG File (≤ maxEdge, upright). Anything else comes back as is. */
export async function heicToJpegFile(file: File, maxEdge = HEIC_MAX_EDGE, quality = 0.9): Promise<File> {
  if (!isHeicFile(file)) return file;
  const blob = (await viaCanvas(file, maxEdge, quality)) || (await viaHeic2any(file, maxEdge, quality));
  if (!blob) return file;   // the bot converts it at queue time
  return new File([blob], heicJpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
}

/** Every HEIC in a pick → JPEG, in order. `onProgress` gets "Converting photo 2 of 5…". */
export async function heicFilesToJpeg(files: File[], onProgress?: (msg: string) => void): Promise<File[]> {
  const total = files.filter(isHeicFile).length;
  if (!total) return files;
  const out: File[] = [];
  let n = 0;
  for (const f of files) {
    if (isHeicFile(f)) { n += 1; onProgress?.(`Converting iPhone photo ${n} of ${total}…`); }
    out.push(await heicToJpegFile(f));
  }
  onProgress?.('');
  return out;
}
