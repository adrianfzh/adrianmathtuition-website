// 📷 Free photo-quality check in the browser (5 Nov 2026, Adrian: "Yes, build it").
// SPEC-PHOTO-QUALITY.md. A clearly blurry, dark or tiny photo is caught on the student's
// phone BEFORE it is sent for an expensive read — plain pixel maths on a canvas, instant,
// nothing downloaded. The student always has "Use anyway".
//
// `scoreGrey` and `judge` + LIMITS are the SAME as the bot's lib/photo-quality.js
// (adrianmath-telegram-bot, docs/SOLVER.md §Photo-quality check) — change both together.
// Limits measured on 758 real student photos: 0 flagged.

export const TARGET = 640; // longest side of the measured copy

export const LIMITS = {
  tinySide: 200,    // LONGEST side of the original under this = a thumbnail
  blurEdge: 30,     // strongest-edge score under this = no crisp ink anywhere
  dark: 40,         // mean grey (0–255) under this …
  darkEdge: 60,     // … with edges this weak = too dark (a dark-mode screenshot has strong edges)
  bright: 235,      // mean grey over this on a picture with no edges …
  brightClip: 0.85, // … and most pixels pure white = washed out
};

export type PhotoIssue = 'small' | 'dark' | 'bright' | 'blurry';
export type PhotoScores = { mean: number; darkFrac: number; clipFrac: number; lapVar: number; edge: number; maxSide?: number | null };
export type PhotoCheck = { ok: boolean; issues: PhotoIssue[]; scores: PhotoScores | null; ms: number; error?: string };

/** Scores for one greyscale picture. Pure. */
export function scoreGrey(g: ArrayLike<number>, w: number, h: number): PhotoScores {
  let sum = 0, dark = 0, clip = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const v = g[i];
    sum += v;
    if (v < 40) dark++;
    if (v > 250) clip++;
  }
  const hist = new Uint32Array(1021);
  let lsum = 0, lsq = 0, m = 0;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      lsum += lap; lsq += lap * lap; m++;
      hist[lap < 0 ? -lap : lap]++;
    }
  }
  const want = Math.max(1, Math.floor(m * 0.005));
  let acc = 0, edge = 0;
  for (let v = 1020; v >= 0; v--) { acc += hist[v]; if (acc >= want) { edge = v; break; } }
  const meanLap = m ? lsum / m : 0;
  return {
    mean: n ? sum / n : 0,
    darkFrac: n ? dark / n : 0,
    clipFrac: n ? clip / n : 0,
    lapVar: m ? lsq / m - meanLap * meanLap : 0,
    edge,
  };
}

/** The verdict from the scores. Pure. */
export function judge(s: PhotoScores, limits = LIMITS): { ok: boolean; issues: PhotoIssue[] } {
  const issues: PhotoIssue[] = [];
  if (s.maxSide != null && s.maxSide < limits.tinySide) issues.push('small');
  if (s.mean < limits.dark && s.edge < limits.darkEdge) issues.push('dark');
  else if (s.edge < limits.blurEdge) issues.push(s.mean > limits.bright && s.clipFrac > limits.brightClip ? 'bright' : 'blurry');
  return { ok: issues.length === 0, issues };
}

function round(s: PhotoScores): PhotoScores {
  const o: Record<string, number | null | undefined> = {};
  for (const [k, v] of Object.entries(s)) o[k] = typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
  return o as PhotoScores;
}

/**
 * Check one picked file in the browser. Never throws: anything it cannot read (a PDF, a HEIC
 * the browser cannot decode) counts as fine — the check must never block a student.
 */
export async function checkPhotoFile(file: File): Promise<PhotoCheck> {
  const t0 = performance.now();
  const pass = (error?: string): PhotoCheck => ({ ok: true, issues: [], scores: null, ms: Math.round(performance.now() - t0), error });
  if (!file.type.startsWith('image/')) return pass('not an image');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('undecodable'));
      i.src = url;
    });
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) return pass('no size');
    const k = Math.min(1, TARGET / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return pass('no canvas');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722) | 0;
    const s = scoreGrey(g, w, h);
    s.maxSide = Math.max(W, H);
    const v = judge(s);
    return { ...v, scores: round(s), ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return pass(e instanceof Error ? e.message : 'failed');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One plain line naming the problem, for the "retake?" card. */
export function issueLine(issues: PhotoIssue[]): string {
  if (issues.includes('dark')) return 'This photo looks too dark. Try more light, or turn on the flash.';
  if (issues.includes('bright')) return 'This photo looks washed out. Move away from the glare.';
  if (issues.includes('blurry')) return 'This photo looks blurry. Hold the phone steady and tap to focus.';
  if (issues.includes('small')) return 'This photo is very small. Use the full-size photo.';
  return 'This photo may be hard to read.';
}

/** Log one check (scores only, never the picture). Fire and forget. */
export function logPhotoCheck(source: string, r: PhotoCheck, sentAnyway = false): void {
  if (!r.scores) return;
  try {
    void fetch('/api/photo-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, ok: r.ok, issues: r.issues, scores: r.scores, ms: r.ms, sent_anyway: sentAnyway }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* best effort */ }
}
