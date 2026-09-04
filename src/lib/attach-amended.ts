// Adrian's amended copy, found BY NAME in the paper's Dropbox folder (2 Sep 2026).
//
// He marks up the AI copy in Notability / the AdrianMarker app and saves it into
// the paper's own folder as "Marked (Adrian).pdf" — nothing on the site is
// involved, so the run does not know the file exists. This module is the bridge:
// list the folder, take the newest "Marked (Adrian)*.pdf" (a double save leaves
// "Marked (Adrian) (1).pdf" — still his copy), copy it to Blob, and attach it
// exactly as mark-triage's `attach-amended` does: `annotated_pdf_url` set,
// `pdf_stale` cleared, `pdf_url` untouched.
//
// Two doors: the explicit triage action (`attach-amended-from-dropbox`, force —
// whatever is in the folder wins) and the automatic pass inside `release` /
// `release-with-sheet`, which attaches only when the folder's copy is newer than
// what the run already carries (paper-folder.ts `amendedCopyIsNewer`). Released
// runs refuse — the student already has that copy.
//
// Every failure is reported, none thrown: a Dropbox hiccup on the automatic path
// must not turn into a release that never happens.

import { putStudentFile, runKey } from '@/lib/student-files';
import { dropboxConfigured, getTemporaryLink, listFolder } from './dropbox';
import { getSupabaseAdmin } from './supabase';
import { amendedCopyIsNewer, isAlreadyAttached, paperFolder, pickAmendedCopy } from './paper-folder';

const MAX_BYTES = 50 * 1024 * 1024;

export type AttachOutcome =
  | { status: 'attached'; folder: string; path: string; name: string; modified: string | null; annotatedPdfUrl: string }
  | { status: 'unchanged'; folder: string; path: string; name: string; reason: string }
  | { status: 'none'; folder: string }
  | { status: 'released'; folder: string }
  | { status: 'error'; message: string; folder?: string; notFound?: boolean };

/**
 * Attach the newest "Marked (Adrian)*.pdf" from the paper's folder to the run.
 * `force` = the explicit action: attach whatever is there unless it is the very
 * file already attached. Without it (the release path) only a NEWER copy replaces
 * the current attachment.
 */
export async function attachAmendedFromDropbox(runId: string, opts: { force?: boolean } = {}): Promise<AttachOutcome> {
  const supa = getSupabaseAdmin();
  const { data: run, error } = await supa
    .from('paper_marking_runs')
    .select('id, student_id, student_name, paper_name, created_at, annotated_pdf_url, checked_at, result_json, released_at')
    .eq('id', runId).maybeSingle();
  if (error) return { status: 'error', message: error.message };
  if (!run) return { status: 'error', message: 'run not found', notFound: true };

  const folder = paperFolder(run);
  if (run.released_at) return { status: 'released', folder };
  if (!dropboxConfigured()) return { status: 'error', message: 'Dropbox not configured', folder };

  let entries: Awaited<ReturnType<typeof listFolder>>;
  try {
    entries = await listFolder(folder);
  } catch (e) {
    const msg = (e as Error).message || 'list failed';
    // No folder yet = nothing filed for this paper — not an error, just nothing to attach.
    if (/not_found/.test(msg)) return { status: 'none', folder };
    return { status: 'error', message: msg, folder };
  }

  const cand = pickAmendedCopy(entries);
  if (!cand) return { status: 'none', folder };

  if (isAlreadyAttached(run, cand)) {
    return { status: 'unchanged', folder, path: cand.path, name: cand.name, reason: 'already attached' };
  }
  if (!opts.force && !amendedCopyIsNewer(run, cand)) {
    return { status: 'unchanged', folder, path: cand.path, name: cand.name, reason: 'the attached copy is newer' };
  }

  let annotatedPdfUrl: string;
  try {
    const tmp = await getTemporaryLink(cand.path);
    const res = await fetch(tmp, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) throw new Error(`Dropbox fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('PDF over 50MB');
    const blob = await putStudentFile({
      key: runKey(runId, `amended-${Date.now()}.pdf`), body: buf, contentType: 'application/pdf',
    });
    annotatedPdfUrl = blob.url;
  } catch (e) {
    return { status: 'error', message: `Could not copy ${cand.name}: ${(e as Error).message}`, folder };
  }

  const now = new Date().toISOString();
  const rj = (run.result_json && typeof run.result_json === 'object') ? { ...(run.result_json as Record<string, unknown>) } : {};
  // A copy Adrian wrote the true total on is, by definition, no longer out of date.
  delete rj.pdf_stale;
  rj.amended_from_dropbox = { path: cand.path, modified: cand.modified ?? null, at: now };
  rj.amended_at = now;
  const { error: upErr } = await supa
    .from('paper_marking_runs')
    // His copy arriving = he has been through the paper: ✓ Checked, same as the
    // bot's linkPdf does when an annotated copy is uploaded.
    .update({ annotated_pdf_url: annotatedPdfUrl, result_json: rj, checked_at: run.checked_at || now })
    .eq('id', runId);
  if (upErr) return { status: 'error', message: upErr.message, folder };

  return { status: 'attached', folder, path: cand.path, name: cand.name, modified: cand.modified ?? null, annotatedPdfUrl };
}
