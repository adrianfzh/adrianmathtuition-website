// Archive a Practice Again sheet into the private student-files store.
//
// Adrian, 7 Sep 2026, on Rainie's returned sheet marked "no question found —
// marked from the working alone": "the questions are exactly in the Practice
// Again sheet — marker should be made aware of this and use the questions
// there". For the marker to read the sheet it needs a stable, fetchable URL —
// not a Dropbox path that the tray cron deletes a month after release and
// that a rename (the 7 Sep sweep) silently breaks. So the sheet is copied into
// the run's own store the moment the worker files it (`done`), not only at
// release: `runs/<runId>/practice-again.pdf` (+ `.docx`), stamped on the SOURCE
// run as `result_json.practice_again_archive`. release-with-sheet archives
// again at release (the PDF that actually went out, after Adrian's edits) and
// overwrites these keys — same shape, newer files.
//
// The bot's `attachPracticeAgainSheet` (lib/practice-again-attach.js) then
// attaches `practice_again_archive.pdf_url` as the hand-in's question paper.
import { downloadFile } from './dropbox';
import { putStudentFile, runKey } from './student-files';
import { getSupabaseAdmin } from './supabase';

export type SheetArchive = { at: string; pdf_url?: string; docx_url?: string; stage: 'done' | 'release' };

export async function archiveSheetToStore(
  runId: string,
  paths: { pdfPath?: string | null; docxPath?: string | null },
  stage: SheetArchive['stage'] = 'done',
): Promise<{ ok: true; archive: SheetArchive } | { ok: false; error: string }> {
  try {
    if (!paths.pdfPath && !paths.docxPath) return { ok: false, error: 'no sheet files recorded on the job' };
    const archive: SheetArchive = { at: new Date().toISOString(), stage };
    if (paths.pdfPath) {
      const pdfBuf = await downloadFile(paths.pdfPath);
      archive.pdf_url = (await putStudentFile({ key: runKey(runId, 'practice-again.pdf'), body: pdfBuf, contentType: 'application/pdf' })).url;
    }
    if (paths.docxPath) {
      const docxBuf = await downloadFile(paths.docxPath);
      archive.docx_url = (await putStudentFile({
        key: runKey(runId, 'practice-again.docx'), body: docxBuf,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })).url;
    }
    const supa = getSupabaseAdmin();
    const { data: row, error: readErr } = await supa.from('paper_marking_runs').select('result_json').eq('id', runId).maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    const rj = (row?.result_json && typeof row.result_json === 'object') ? row.result_json as Record<string, unknown> : {};
    const { error } = await supa.from('paper_marking_runs')
      .update({ result_json: { ...rj, practice_again_archive: archive } }).eq('id', runId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, archive };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
