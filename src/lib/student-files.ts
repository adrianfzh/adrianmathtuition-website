// Student files — ONE place for every file that is a student's own data:
// hand-in photos, the marking copies and originals, annotated page images,
// the marked / full / hand-annotated PDFs, notebook clippings, assignment
// worksheets, the iPad-inbox uploads.
//
// Decided 5 Sep 2026 (Adrian: "do it"): these files live in the PRIVATE
// Supabase Storage bucket `student-files`, in the same Singapore project as the
// database — not at public-by-URL Vercel Blob addresses and not in the personal
// Dropbox. Nothing about the bucket is reachable without the service key, so
// the ONLY way a browser or the bot gets bytes is
//
//     GET /api/files/<key>            (src/app/api/files/[...key]/route.ts)
//
// which checks who is asking: Adrian's admin session or bearer (the bot uses the
// same bearer it already sends for mark-paper-pdf), or a portal session that OWNS
// the file — a run's files belong to its tagged student and only once the run is
// RELEASED; hand-ins / clippings / assignments belong to the identity in the key.
//
// The reference stored in the database is the canonical URL
//     https://www.adrianmathtuition.com/api/files/<key>
// so every column and JSON field that used to hold a Blob URL keeps holding a
// URL, and readers on the site never HTTP-fetch it: `fetchOurFile(url)` turns a
// key URL into a bucket download and still fetches a legacy Blob URL as before.
// Legacy Blob URLs are recognised everywhere until the backfill rewrites them.
//
// Big uploads from a phone or the iPad go straight to the bucket through a
// SIGNED UPLOAD URL (`createUploadUrl`) — the 4.5MB Vercel body cap never sees
// them, exactly as the old Blob client tokens. The server pins the key (owner
// prefix), which is what lets the receiving route treat "URL under my prefix"
// as proof of ownership, same rule as before.
//
// Keys are the whole model — keep them boring:
//   runs/<runId>/originals/<n>.jpg         full-resolution working photo (the pen base)
//   runs/<runId>/annotated/<n>[-sol|-r].jpg bot-drawn red-pen pages (+ twins)
//   runs/<runId>/marked-photos.pdf         🖼 images PDF (what students get)
//   runs/<runId>/marked-full.pdf           📄 full PDF with transcripts
//   runs/<runId>/annotated.pdf             Adrian's hand-annotated copy (✏️ overlay)
//   runs/<runId>/annotated-<uuid>.pdf      a Notability export he uploaded
//   runs/<runId>/amended-<ts>.pdf          his copy found in Dropbox by name
//   runs/<runId>/annotate-pages/<uuid>.jpg ✏️ overlay page exports (assembled server-side)
//   runs/<runId>/practice-<ts>.docx        the practice-questions Word file
//   uploads/<uuid>/<file>                  pre-run uploads from /admin/mark-paper (originals,
//                                          the question paper) — the run id does not exist yet
//   handins/<identity>/<uuid>.jpg          /app/submit + Telegram /handin photos
//                                          (identity = rec… or acct:<uuid>)
//   clippings/<identity>/<file>            notebook clippings (filename carries the kind)
//   assignments/<identity>/<uuid>.pdf      "From Adrian" worksheets
//   inbox/<file>                           iPad share-sheet inbox (admin only)
//
// The pure half (keys, URLs, ownership) is lib/student-files-url.ts so client
// components can import it; this module re-exports it and adds the bucket I/O.

import { getSupabaseAdmin } from './supabase';
import { isOurBlobUrl } from './blob-url';
import { STUDENT_FILES_BUCKET, assertKey, isValidKey, fileUrl, keyFromUrl, contentTypeFor } from './student-files-url';

export * from './student-files-url';

function bucket() {
  return getSupabaseAdmin().storage.from(STUDENT_FILES_BUCKET);
}

export interface PutResult { key: string; url: string }

/** Store bytes under a key. Re-uploads OVERWRITE by default — a rebuilt PDF
 *  replaces the machine's copy at the same fixed name, like the Dropbox rule. */
export async function putStudentFile(opts: {
  key: string; body: Buffer | Uint8Array | ArrayBuffer | Blob; contentType?: string; upsert?: boolean;
}): Promise<PutResult> {
  const key = assertKey(opts.key);
  const contentType = opts.contentType || contentTypeFor(key);
  const { error } = await bucket().upload(key, opts.body as Blob, { contentType, upsert: opts.upsert !== false });
  if (error) throw new Error(`student-files upload failed for ${key}: ${error.message}`);
  return { key, url: fileUrl(key) };
}

/** The stored bytes as a Blob (its `type` is the stored content type). */
export async function downloadStudentFile(key: string): Promise<Blob> {
  const k = assertKey(key);
  const { data, error } = await bucket().download(k);
  if (error || !data) throw new Error(`student-files download failed for ${k}: ${error?.message || 'no data'}`);
  return data;
}

/**
 * fetch() for our own files: a key URL is read from the bucket, a legacy Blob
 * URL is fetched as before, anything else is refused (never an open proxy).
 * Returns a Response so existing `r.ok / r.body / r.arrayBuffer()` callers
 * work unchanged.
 */
export async function fetchOurFile(url: string, init?: { signal?: AbortSignal }): Promise<Response> {
  const key = keyFromUrl(url);
  if (key) {
    try {
      const blob = await downloadStudentFile(key);
      return new Response(blob, { status: 200, headers: { 'content-type': blob.type || contentTypeFor(key) } });
    } catch (e) {
      return new Response(String((e as Error).message), { status: 404 });
    }
  }
  if (isOurBlobUrl(url)) return fetch(url, init);
  return new Response('not our file', { status: 400 });
}

export interface UploadUrl { uploadUrl: string; token: string; key: string; url: string }

/** A signed URL the browser PUTs the file to directly (bypasses the body cap).
 *  Valid for two hours; the key is fixed by the caller, never by the client. */
export async function createUploadUrl(key: string): Promise<UploadUrl> {
  const k = assertKey(key);
  const { data, error } = await bucket().createSignedUploadUrl(k);
  if (error || !data) throw new Error(`student-files signed upload failed for ${k}: ${error?.message || 'no data'}`);
  return { uploadUrl: data.signedUrl, token: data.token, key: k, url: fileUrl(k) };
}

export async function removeStudentFiles(keys: string[]): Promise<number> {
  const valid = [...new Set(keys.filter(isValidKey))];
  let n = 0;
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const { error } = await bucket().remove(chunk);
    if (error) throw new Error(`student-files remove failed: ${error.message}`);
    n += chunk.length;
  }
  return n;
}

export interface StoredFile { key: string; size: number; createdAt: string; contentType: string }

/** Every object under a prefix, recursively (Storage lists one level at a time). */
export async function listStudentFiles(prefix: string): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  const walk = async (dir: string) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket().list(dir, { limit: 1000, offset });
      if (error) throw new Error(`student-files list failed for ${dir}: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const item of data) {
        const full = dir ? `${dir}/${item.name}` : item.name;
        // Folders come back with no id; files carry metadata.
        if (item.id) {
          const md = (item.metadata || {}) as { size?: number; mimetype?: string };
          out.push({ key: full, size: Number(md.size || 0), createdAt: item.created_at || '', contentType: md.mimetype || contentTypeFor(full) });
        } else await walk(full);
      }
      if (data.length < 1000) break;
    }
  };
  await walk(prefix.replace(/\/+$/, ''));
  return out;
}

export async function removeStudentFilesByPrefix(prefix: string): Promise<number> {
  const files = await listStudentFiles(prefix);
  return files.length ? removeStudentFiles(files.map(f => f.key)) : 0;
}
