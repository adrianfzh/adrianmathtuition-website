// Which column on `paper_marking_runs` holds which marked copy.
//
// Two writers now put URLs on a run: the bot's `link-pdf` phase, and
// /api/admin/mark-paper-pdf, which links its own output server-side the moment the
// upload lands (so a browser that drops the 2-minute connection can't lose a PDF
// that was already built). Two writers means the mapping has to be one shared,
// tested thing — sending the images copy to `pdf_url` would silently overwrite the
// full marked script with a photos-only one, and nothing would look wrong until
// Adrian opened it in front of a parent.
export type MarkedPdfKind = 'full' | 'photos' | 'annotated';
export type MarkedPdfColumn = 'pdf_url' | 'photos_pdf_url' | 'annotated_pdf_url';

/** Mirrors linkPdf() in the bot (handlers/webchat.js) — anything unrecognised is
 *  the full marked script, which is what every pre-'photos' caller meant. */
export function markedPdfColumn(kind: string | null | undefined): MarkedPdfColumn {
  if (kind === 'photos') return 'photos_pdf_url';
  if (kind === 'annotated') return 'annotated_pdf_url';
  return 'pdf_url';
}
