// Pure, client-safe half of lib/student-files.ts: keys, canonical URLs and
// ownership rules. No Supabase import — browser components use this to turn a
// stored reference into an <img src> / <a href>, and the server module
// re-exports everything here beside the bucket I/O. Read the header of
// lib/student-files.ts for the model.

import { isOurBlobUrl } from './blob-url';

export const STUDENT_FILES_BUCKET = 'student-files';
export const FILES_ROUTE = '/api/files/';
/** The origin every stored reference carries — preview and prod share one bucket
 *  and one database, so the reference must not depend on which deploy wrote it. */
export const CANONICAL_ORIGIN = 'https://www.adrianmathtuition.com';

const ROOTS = ['runs', 'uploads', 'handins', 'clippings', 'assignments', 'inbox'] as const;
type Root = typeof ROOTS[number];
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._:()\- ]{0,120}$/;

/** True for a key this module is willing to store or serve. */
export function isValidKey(key: string): boolean {
  if (typeof key !== 'string' || key.length === 0 || key.length > 400) return false;
  const segs = key.split('/');
  if (segs.length < 2) return false;
  if (!(ROOTS as readonly string[]).includes(segs[0])) return false;
  return segs.every(s => SEGMENT.test(s) && s !== '.' && s !== '..' && !s.endsWith('.'));
}

export function assertKey(key: string): string {
  if (!isValidKey(key)) throw new Error(`bad student-file key: ${JSON.stringify(key).slice(0, 80)}`);
  return key;
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

/** The canonical URL stored in the database for a key. */
export function fileUrl(key: string): string {
  return `${CANONICAL_ORIGIN}${FILES_ROUTE}${encodeKey(assertKey(key))}`;
}

/** The key inside a /api/files/ URL (any origin, or a relative path), else null. */
export function keyFromUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  let path: string;
  try {
    path = u.startsWith('/') ? u.split('?')[0] : new URL(u).pathname;
  } catch { return null; }
  if (!path.startsWith(FILES_ROUTE)) return null;
  let key: string;
  try { key = path.slice(FILES_ROUTE.length).split('/').map(decodeURIComponent).join('/'); }
  catch { return null; }
  return isValidKey(key) ? key : null;
}

/**
 * What a page should put in <img src> / <a href>: a key URL becomes the
 * SAME-ORIGIN path (so the session cookie rides along on the preview deploy
 * too — a cross-site <img> never carries a Lax cookie), anything else passes
 * through untouched (legacy Blob URLs, foreign links).
 */
export function fileHref(u: string | null | undefined): string {
  const key = keyFromUrl(u);
  return key ? `${FILES_ROUTE}${encodeKey(key)}` : (u || '');
}

/** A URL this site may fetch and re-serve: a student-files key URL, or a legacy
 *  Vercel Blob URL from before the move. Replaces isOurBlobUrl at every gate. */
export function isOurFileUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  return keyFromUrl(u) !== null || isOurBlobUrl(u);
}

export type FileOwner =
  | { kind: 'run'; runId: string }
  | { kind: 'student'; identity: string }
  | { kind: 'admin' };

/** Who may read a key besides Adrian. Pure. */
export function ownerOf(key: string): FileOwner {
  const [root, second] = assertKey(key).split('/');
  switch (root as Root) {
    case 'runs': return { kind: 'run', runId: second };
    case 'handins':
    case 'clippings':
    case 'assignments': return { kind: 'student', identity: second };
    default: return { kind: 'admin' };
  }
}

const TYPES: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', gif: 'image/gif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
export function contentTypeFor(key: string): string {
  const ext = (key.match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
  return TYPES[ext] || 'application/octet-stream';
}

/** Whitelisted extension for a user-supplied filename, else the fallback. */
export function safeExt(filename: string | null | undefined, allowed: readonly string[], fallback: string): string {
  const raw = (String(filename || '').match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

/** A filename segment safe inside a key. */
export function safeName(name: string | null | undefined, fallback = 'file'): string {
  const s = String(name || '').replace(/[^\w.\- ()]/g, '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '').slice(0, 100);
  return s || fallback;
}

// ── key builders ─────────────────────────────────────────────────────────────
const uuid = () => globalThis.crypto.randomUUID();
export const runKey = (runId: string, part: string) => assertKey(`runs/${runId}/${part}`);
export const uploadKey = (file: string) => assertKey(`uploads/${uuid()}/${file}`);
export const handinKey = (identity: string, ext: string) => assertKey(`handins/${identity}/${uuid()}.${ext}`);
export const clippingKey = (identity: string, file: string) => assertKey(`clippings/${identity}/${file}`);
export const assignmentKey = (identity: string) => assertKey(`assignments/${identity}/${uuid()}.pdf`);
export const inboxKey = (file: string) => assertKey(`inbox/${file}`);

/** Every /api/files/ key URL found anywhere in a JSON-ish value (for deletes). */
export function collectFileKeys(value: unknown): string[] {
  const keys = new Set<string>();
  const seen = new Set<unknown>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') { const k = keyFromUrl(v); if (k) keys.add(k); return; }
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    for (const x of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) walk(x);
  };
  walk(value);
  return [...keys];
}
