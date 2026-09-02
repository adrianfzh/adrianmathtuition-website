// One folder per student per paper (Adrian approved, 2 Sep 2026).
//
// Everything about one student's one paper lives in ONE Dropbox folder, paths
// relative to the app folder root (Dropbox/Apps/AdrianMathNotes/):
//
//   /Students/<Student Name>/<YYYY-MM-DD> <paper_name>/Marked (AI).pdf       the assembled images PDF, as built
//   /Students/<Student Name>/<YYYY-MM-DD> <paper_name>/Marked (Adrian).pdf   his amended copy, saved there BY HAND
//   /Students/<Student Name>/<YYYY-MM-DD> <paper_name>/Practice Again.docx   the self-study sheet (sheet worker)
//   /Students/<Student Name>/<YYYY-MM-DD> <paper_name>/Practice Again.pdf
//
// <YYYY-MM-DD> is the marking run's `created_at` in SINGAPORE time — the folder
// the sheet worker already files into uses the same stamp, so the two must agree
// or the sheet and the marked copy land in sibling folders. <paper_name> is
// `paper_marking_runs.paper_name`, <Student Name> is `paper_marking_runs.student_name`.
// Untagged runs (no student_id) file under /Students/_Untagged/.
//
// This module is the ONLY place the rule lives on the website. The bot never
// computes it: it sends the run id to /api/admin/mark-paper-dropbox and the
// route derives the path from the run row — one rule, one repo, nothing to drift.
// `/Marked Papers/<date> <name>.pdf` (lib/dropbox-paper-path.ts) is the legacy
// flat layout, migrated 2 Sep 2026.

import { sgtDateISO } from './sgt';

export const STUDENTS_ROOT = '/Students';
export const UNTAGGED_FOLDER = '_Untagged';
export const MARKED_AI_NAME = 'Marked (AI).pdf';
export const MARKED_ADRIAN_STEM = 'Marked (Adrian)';
/** The Dropbox app folder, as the web UI addresses it. */
export const DROPBOX_APP_ROOT = '/Apps/AdrianMathNotes';

export type PaperRun = {
  student_name?: string | null;
  student_id?: string | null;
  paper_name?: string | null;
  /** ISO string (PostgREST), Postgres text, epoch ms or Date. Missing = now. */
  created_at?: string | number | Date | null;
};

/**
 * One path segment Dropbox will accept and iOS will show: the characters
 * Dropbox rejects outright (\ / : * ? " < > |) become "-", control characters
 * go, runs of whitespace collapse to one space, and trailing spaces/dots are
 * trimmed (Dropbox refuses a name that ends in either). Never a path — a "/"
 * in the input cannot escape the folder.
 */
export function folderSegment(raw: string | null | undefined, fallback: string): string {
  const s = String(raw ?? '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return s || fallback;
}

/**
 * The paper's part of the folder name. A run is sometimes named after the
 * uploaded file ("(Zane) WA3 S2 Math Revision Worksheet.pdf"), so a trailing
 * file extension is dropped first; "kevin 2025:2026 working" becomes
 * "kevin 2025-2026 working" — the same spelling the bot filed it under.
 * Capped at 80 chars so the whole path stays well inside Dropbox's limits.
 */
export function paperNameSegment(name: string | null | undefined): string {
  const stripped = String(name ?? '').replace(/\.(pdf|jpe?g|png|heic)$/i, '');
  return folderSegment(stripped, 'untitled paper').slice(0, 80).replace(/[. ]+$/, '') || 'untitled paper';
}

/** Tagged runs file under the student's name; anything else under _Untagged. */
export function studentSegment(run: Pick<PaperRun, 'student_id' | 'student_name'>): string {
  if (!run.student_id) return UNTAGGED_FOLDER;
  const name = folderSegment(run.student_name, '');
  return name || UNTAGGED_FOLDER;
}

function instantOf(at: PaperRun['created_at']): number {
  if (at == null || at === '') return Date.now();
  if (at instanceof Date) return at.getTime();
  if (typeof at === 'number') return at;
  // PostgREST hands back ISO-8601; a raw Postgres timestamp ("2026-09-01
  // 16:57:42.9+00") also turns up in scripts — normalise both before parsing.
  const iso = String(at).trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Date.now() : ms;
}

/** "<YYYY-MM-DD> <paper_name>" — the Singapore day the run was created. */
export function paperFolderName(run: Pick<PaperRun, 'paper_name' | 'created_at'>): string {
  return `${sgtDateISO(instantOf(run.created_at))} ${paperNameSegment(run.paper_name)}`;
}

/** The paper's folder: /Students/<Student Name>/<YYYY-MM-DD> <paper_name> */
export function paperFolder(run: PaperRun): string {
  return `${STUDENTS_ROOT}/${studentSegment(run)}/${paperFolderName(run)}`;
}

/** Where the assembled marked PDF (images mode) is filed. Re-builds OVERWRITE it. */
export function markedAiPath(run: PaperRun): string {
  return `${paperFolder(run)}/${MARKED_AI_NAME}`;
}

/**
 * Adrian's amended copy is found BY NAME, never by a recorded path: he saves it
 * into the folder himself from Notability / the AdrianMarker app, and a double
 * save leaves "Marked (Adrian) (1).pdf" — which still counts. Any PDF whose
 * stem starts with "Marked (Adrian)" matches; pickAmendedCopy takes the newest.
 */
export const markedAdrianPattern = /^Marked \(Adrian\).*\.pdf$/i;

/** Either of the marked copies — what the sheet chooser must never pick up. */
export function isMarkedCopy(name: string | null | undefined): boolean {
  return /^Marked \((AI|Adrian)\)/i.test(String(name ?? '').trim());
}

/** The self-study sheet's PDF: "Practice Again.pdf", "Practice Again 2.pdf", "Practice Again (1).pdf". */
export function isSheetPdf(name: string | null | undefined): boolean {
  return /^Practice Again.*\.pdf$/i.test(String(name ?? '').trim());
}

export type FolderEntry = { name: string; path: string; modified?: string | null; tag?: string };

/** The newest "Marked (Adrian)*.pdf" in a folder listing, or null. */
export function pickAmendedCopy<T extends FolderEntry>(entries: T[]): T | null {
  const hits = (entries || []).filter(e =>
    e && e.name && (!e.tag || e.tag === 'file') && markedAdrianPattern.test(e.name.trim()));
  if (!hits.length) return null;
  hits.sort((a, b) => timeOf(b.modified) - timeOf(a.modified));
  return hits[0];
}

function timeOf(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** What the run remembers about the last copy attached from Dropbox (result_json.amended_from_dropbox). */
export type AmendedRecord = { path?: string; modified?: string | null; at?: string };

/**
 * Should the amended copy in the folder replace what the run has attached now?
 *
 *  - nothing attached → yes;
 *  - the very file already attached (same path + modified) → no;
 *  - otherwise only when the Dropbox file is NEWER than the current attachment.
 *    "When it was attached" is, in order: the modified stamp of the Dropbox copy
 *    last attached, the `amended_at` stamp attach-amended writes, else
 *    `checked_at` (the bot stamps it when an annotated copy links onto the run —
 *    the in-browser ✏️ Annotate path). With no stamp at all we cannot tell, so
 *    the automatic path leaves the current copy alone; the explicit action
 *    (`force`) still attaches.
 */
export function amendedCopyIsNewer(
  run: { annotated_pdf_url?: string | null; checked_at?: string | null; result_json?: unknown },
  candidate: { path: string; modified?: string | null },
): boolean {
  if (!run.annotated_pdf_url) return true;
  const rj = (run.result_json && typeof run.result_json === 'object') ? run.result_json as Record<string, unknown> : {};
  const rec = (rj.amended_from_dropbox && typeof rj.amended_from_dropbox === 'object')
    ? rj.amended_from_dropbox as AmendedRecord : null;
  if (rec?.path && rec.path.toLowerCase() === candidate.path.toLowerCase()
      && timeOf(rec.modified) === timeOf(candidate.modified)) return false;
  const attachedAt = rec?.modified ?? (typeof rj.amended_at === 'string' ? rj.amended_at : null) ?? run.checked_at ?? null;
  if (!attachedAt) return false;
  return timeOf(candidate.modified) > timeOf(attachedAt);
}

/** Is this the same Dropbox file the run already attached? */
export function isAlreadyAttached(run: { result_json?: unknown }, candidate: { path: string; modified?: string | null }): boolean {
  const rj = (run.result_json && typeof run.result_json === 'object') ? run.result_json as Record<string, unknown> : {};
  const rec = (rj.amended_from_dropbox && typeof rj.amended_from_dropbox === 'object')
    ? rj.amended_from_dropbox as AmendedRecord : null;
  return !!(rec?.path && rec.path.toLowerCase() === candidate.path.toLowerCase()
    && timeOf(rec.modified) === timeOf(candidate.modified));
}

/** The folder in Dropbox's web UI — the 📂 link on triage / the papers library. */
export function dropboxWebUrl(folder: string): string {
  const segs = `${DROPBOX_APP_ROOT}${folder.startsWith('/') ? folder : `/${folder}`}`
    .split('/').filter(Boolean).map(encodeURIComponent);
  return `https://www.dropbox.com/home/${segs.join('/')}`;
}
