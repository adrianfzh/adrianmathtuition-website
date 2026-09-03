// Releasing the marked paper and its self-study sheet in one action.
//
// Step 7 of the teaching round was two taps: Release in triage, then build the
// assignment on the student's profile. Adrian does both every time, in that
// order, and a paper released without its sheet is the half that teaches nothing.
//
// THE FILENAME PROBLEM (Adrian, 1 Sep 2026). The obvious design — "release the
// PDF sitting in the folder" — is wrong twice over: an old export left behind
// makes it ambiguous, and he would have to keep the folder clean forever. The
// obvious fix — "use the exact name the worker filed" — is also wrong, because
// the names are NOT consistent: the workers have produced both
// "Practice Again (Wave 1) — klaire am tys 2021 p1.docx" and
// "2026-08-31 Practice Again — kiara am tys 2022 p1.docx", and he re-exports the
// PDF by hand after editing, so its name is whatever Word offered him.
//
// So: prefer the recorded path, fall back to the folder, and when the folder is
// ambiguous ASK rather than guess. A wrong PDF reaching a student is worse than
// one more tap.
//
// SINCE 2 SEP 2026 THE FOLDER IS SHARED. The sheet lives in the paper's own
// folder (/Students/<Student>/<date> <paper>/, lib/paper-folder.ts) next to
// "Marked (AI).pdf" and "Marked (Adrian).pdf". Those two are never the sheet:
// they are dropped from the listing before anything is chosen, and the
// "only PDF" / "ask" fallbacks look only at PDFs named "Practice Again…" — the
// fixed sheet name, which a Word re-export keeps.

import { isMarkedCopy, isSheetPdf } from './paper-folder';

export type SheetFile = { path: string; name: string; modified?: string | null };

export type PdfChoice =
  | { kind: 'recorded'; path: string }
  | { kind: 'only'; path: string }
  | { kind: 'ambiguous'; candidates: SheetFile[] }
  | { kind: 'none' };

const isPdf = (n: string) => /\.pdf$/i.test(n);

/** The base name without extension, lowercased — so a re-export keeps its identity
 *  even when Word changes the extension or the case. */
export function stem(pathOrName: string): string {
  const base = String(pathOrName || '').split('/').pop() || '';
  return base.replace(/\.[^.]+$/, '').trim().toLowerCase();
}

/**
 * Which PDF to release.
 *
 * In order:
 *  1. the exact path the worker recorded, if it is still there;
 *  2. a PDF whose name matches the DOCX the worker filed — this is the common
 *     case, because exporting from Word keeps the base name and only changes the
 *     extension, and it survives the naming being inconsistent between runs;
 *  3. the only "Practice Again…" PDF in the folder, when there is exactly one;
 *  4. otherwise ask — every "Practice Again…" candidate returned, newest first,
 *     and nothing chosen.
 *
 * `folder` is the listing of the sheet's own folder — which is also the paper's
 * folder, so "Marked (AI).pdf" / "Marked (Adrian).pdf" sit in it; they are
 * excluded before any step. Passing an empty list is fine: the answer is then
 * 'none', never a guess.
 */
export function choosePdf(
  recordedPdfPath: string | null | undefined,
  recordedDocxPath: string | null | undefined,
  folder: SheetFile[],
): PdfChoice {
  const files = (folder || []).filter(f => f && f.name && isPdf(f.name) && !isMarkedCopy(f.name));

  const rec = String(recordedPdfPath || '').trim().toLowerCase();
  if (rec && files.some(f => f.path.toLowerCase() === rec)) {
    return { kind: 'recorded', path: recordedPdfPath as string };
  }

  // The DOCX's own name, re-exported as a PDF — what actually happens when he
  // edits the sheet and hits Save as PDF.
  const docStem = stem(recordedDocxPath || '');
  if (docStem) {
    const twin = files.filter(f => stem(f.name) === docStem);
    if (twin.length === 1) return { kind: 'recorded', path: twin[0].path };
  }

  // Past the recorded path and the DOCX twin, only the fixed sheet name counts:
  // a stray differently-named PDF is not "the only PDF" any more.
  const sheets = files.filter(f => isSheetPdf(f.name));
  if (sheets.length === 1) return { kind: 'only', path: sheets[0].path };
  if (sheets.length === 0) return { kind: 'none' };

  const newestFirst = [...sheets].sort((a, b) =>
    String(b.modified || '').localeCompare(String(a.modified || '')));
  return { kind: 'ambiguous', candidates: newestFirst };
}

/** The folder a sheet lives in, from either recorded path. */
export function sheetFolder(pdfPath?: string | null, docxPath?: string | null): string | null {
  const p = String(pdfPath || docxPath || '');
  if (!p.includes('/')) return null;
  return p.slice(0, p.lastIndexOf('/')) || null;
}

/**
 * What the response says when the sheet job's honest answer was "nothing to
 * teach" (sheet_jobs.result.noSheet — see lib/sheet-jobs.ts). There is no PDF to
 * look for and no assignment to write: the marked paper goes out on its own, and
 * saying so is the difference between "released, deliberately without a sheet"
 * and the old 404 "No PDF in the sheet's folder yet".
 */
export function noSheetNote(reason: string): string {
  const why = String(reason || '').trim();
  return `No self-study sheet for this paper${why ? ` — ${why}` : ''}. Released the marked paper on its own.`;
}

/** What to tell Adrian when the PDF cannot be picked for him. */
export function ambiguityMessage(choice: PdfChoice): string | null {
  if (choice.kind === 'none') {
    return 'No PDF in the sheet’s folder yet — export the edited DOCX to PDF first, then release.';
  }
  if (choice.kind === 'ambiguous') {
    return `${choice.candidates.length} PDFs in that folder and none matches the sheet’s own name — pick the one to send.`;
  }
  return null;
}
