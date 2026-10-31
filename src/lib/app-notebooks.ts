// Notebook backup for the Notebook iPad app (SPEC-STUDENT-APP.md §0d, 31 Oct 2026,
// Adrian: "yes" to saving the app's notebooks to our server under the student's account).
//
// A notebook on the iPad is a folder of files: notebook.json, one pages/<id>.drawing per
// page, one documents/<id>.pdf per imported PDF. The server keeps the same files in the
// private student-files bucket under
//     notebooks/<identity>/<notebook-id>/<path>
// and one app_notebooks row per notebook: its title, when it last changed on the device,
// and the MANIFEST — every file's path, size and SHA-256 — so a device sends only the
// files that changed and fetches only the files it lacks.
//
// Sending a notebook is two calls, so big files never pass through the website (the 4.5 MB
// body cap): `prepare` (the manifest → a signed upload address per changed file; the app
// PUTs the bytes straight to the bucket), then `commit` (the server checks every file
// arrived with the right size, saves the row, removes files the notebook no longer has).
// The newest change wins (by `updatedAt`); a deleted notebook keeps its row as a
// tombstone so the student's other devices delete their copy too.
//
// Pure half here (paths, manifests, what to send or remove); the routes are
// src/app/api/app/notebooks/**.

import { assertKey } from './student-files-url';

/** One file of a notebook: where it sits in the notebook's folder, its size, its SHA-256 (hex). */
export interface NotebookFile { path: string; size: number; sha256: string }
export type Manifest = Record<string, { size: number; sha256: string }>;

export const MAX_FILES_PER_NOTEBOOK = 3000;
export const MAX_FILE_BYTES = 60 * 1024 * 1024; // a big imported past paper
export const MAX_NOTEBOOK_BYTES = 400 * 1024 * 1024;

const UUID = '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`);
const PATH_RE = new RegExp(`^(notebook\\.json|pages/${UUID}\\.drawing|documents/${UUID}\\.pdf|previews/${UUID}\\.jpg)$`);

export function isNotebookId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

/** Only the kinds of file a notebook holds; nothing else is ever stored. previews/<page>.jpg is
 *  the app's picture of a written page, so the website can show it (§0e). */
export function isNotebookPath(path: unknown): path is string {
  return typeof path === 'string' && PATH_RE.test(path);
}

export function notebookPrefix(identity: string, notebookId: string): string {
  return `notebooks/${identity}/${notebookId.toUpperCase()}`;
}

export function notebookFileKey(identity: string, notebookId: string, path: string): string {
  return assertKey(`${notebookPrefix(identity, notebookId)}/${path}`);
}

export type ManifestParse = { ok: true; manifest: Manifest } | { ok: false; error: string };

/** The manifest the app sends: `{ files: [{ path, size, sha256 }] }`. Checked, never trusted. */
export function parseManifest(body: unknown): ManifestParse {
  const files = (body as { files?: unknown } | null)?.files;
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: 'No files.' };
  if (files.length > MAX_FILES_PER_NOTEBOOK) return { ok: false, error: 'This notebook has too many pages to back up.' };
  const manifest: Manifest = {};
  let total = 0;
  for (const f of files as Partial<NotebookFile>[]) {
    if (!f || !isNotebookPath(f.path)) return { ok: false, error: 'Bad file name.' };
    if (typeof f.size !== 'number' || !Number.isInteger(f.size) || f.size < 0 || f.size > MAX_FILE_BYTES) {
      return { ok: false, error: 'A file in this notebook is too big to back up.' };
    }
    if (typeof f.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(f.sha256)) return { ok: false, error: 'Bad file check.' };
    if (manifest[f.path]) return { ok: false, error: 'A file is listed twice.' };
    manifest[f.path] = { size: f.size, sha256: f.sha256 };
    total += f.size;
  }
  if (!manifest['notebook.json']) return { ok: false, error: 'The notebook’s details are missing.' };
  if (total > MAX_NOTEBOOK_BYTES) return { ok: false, error: 'This notebook is too big to back up.' };
  return { ok: true, manifest };
}

/** Files the server must receive: new, or changed since the stored copy. */
export function filesToSend(stored: Manifest | null | undefined, incoming: Manifest): string[] {
  return Object.keys(incoming).filter(p => {
    const s = stored?.[p];
    return !s || s.sha256 !== incoming[p].sha256 || s.size !== incoming[p].size;
  }).sort();
}

/** Files the notebook no longer has (a deleted page, a PDF no page uses). */
export function filesToRemove(stored: Manifest | null | undefined, incoming: Manifest): string[] {
  return Object.keys(stored || {}).filter(p => !incoming[p]).sort();
}

/** Paths in the manifest that are missing from the bucket, or there with the wrong size. */
export function missingFiles(manifest: Manifest, inBucket: Map<string, number>): string[] {
  return Object.keys(manifest).filter(p => inBucket.get(p) !== manifest[p].size).sort();
}

/** The title and change time the app sends with `commit`. */
export function parseCommit(body: unknown): { ok: true; title: string; updatedAt: string } | { ok: false; error: string } {
  const b = (body || {}) as { title?: unknown; updatedAt?: unknown };
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 200) : '';
  const t = typeof b.updatedAt === 'number' ? b.updatedAt * 1000 : NaN; // seconds since 1970, as the app stores it
  if (!Number.isFinite(t) || t < Date.UTC(2020, 0, 1) || t > Date.now() + 24 * 3600_000) {
    return { ok: false, error: 'Bad change time.' };
  }
  return { ok: true, title: title || 'Untitled', updatedAt: new Date(t).toISOString() };
}

/** Subjects (folders) as the app keeps them. Kept as one list per student. */
export interface AppFolder { id: string; name: string; createdAt: number }

export function parseFolders(body: unknown): { ok: true; folders: AppFolder[] } | { ok: false; error: string } {
  const list = (body as { folders?: unknown } | null)?.folders;
  if (!Array.isArray(list) || list.length > 200) return { ok: false, error: 'Bad subjects list.' };
  const out: AppFolder[] = [];
  for (const f of list as Partial<AppFolder>[]) {
    if (!f || !isNotebookId(f.id) || typeof f.name !== 'string' || typeof f.createdAt !== 'number') {
      return { ok: false, error: 'Bad subject.' };
    }
    out.push({ id: f.id.toUpperCase(), name: f.name.trim().slice(0, 100) || 'Subject', createdAt: f.createdAt });
  }
  return { ok: true, folders: out };
}

/** One written page as Adrian's student page shows it: its number in the notebook and its picture. */
export interface WrittenPage { n: number; pageId: string; picture: string; verdict: string | null; summary: string | null }

/**
 * The written pages of a notebook, in notebook order, from its notebook.json and manifest.
 * A page without a picture (never written on) is left out; the numbers stay the notebook's.
 */
export function writtenPages(notebookJson: unknown, manifest: Manifest): WrittenPage[] {
  const pages = (notebookJson as { pages?: unknown } | null)?.pages;
  if (!Array.isArray(pages)) return [];
  const out: WrittenPage[] = [];
  pages.forEach((p, i) => {
    const id = typeof (p as { id?: unknown })?.id === 'string' ? String((p as { id: string }).id).toUpperCase() : '';
    const picture = `previews/${id}.jpg`;
    if (!isNotebookId(id) || !manifest[picture]) return;
    const check = (p as { check?: { verdict?: unknown; summary?: unknown } }).check;
    out.push({
      n: i + 1, pageId: id, picture,
      verdict: typeof check?.verdict === 'string' ? check.verdict : null,
      summary: typeof check?.summary === 'string' ? check.summary : null,
    });
  });
  return out;
}
