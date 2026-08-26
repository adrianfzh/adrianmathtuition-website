// Shared page layout for every PDF built out of marked pages — the 🖼/📄 builds
// (mark-paper-pdf) and the ✏️ Annotate flatten (mark-paper-annotate-pdf) import
// THIS, so an annotated document can never drift from the plain one. Server-only
// (pdf-lib): import from API routes, never from client components.

import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';

// EVERY page is laid out at this width (A4 portrait points) and the image is scaled to
// it, so the whole document reads as one script. Pages used to be sized to their own
// pixel dimensions — a wide photo strip became a short squat page and a typeset sheet a
// tall one, so "the transcript is larger than the marked page itself" (Adrian, Jul 2026).
// Height stays proportional rather than fixed to A4: letterboxing a two-page CamScanner
// spread into portrait would shrink the working to a band adrift in white space.
export const PAGE_W = 595;

// Height of the header strip added above the FIRST page to carry the paper total.
// The total lives on the first marked page, not on a cover sheet of its own (Adrian,
// Jul 2026: "don't have to put the first page") — a marked script starts with the work.
export const stripHeight = (pageWidth: number) => Math.max(34, Math.round(pageWidth * 0.062));

// Whether this document gets the PAPER TOTAL strip at all (Adrian, 26 Aug 2026:
// "for normal practices, there is no need to give a total score. only give total
// score for exam papers/test papers"). The signal is where the denominator CAME
// FROM (the bot's paper-totals grounding, threaded through `totals.max_source`):
// an OFFICIAL total — matched in the known-paper registry, or typed into the
// "out of ___" box — means an exam/test paper and gets the strip; a counted
// guess-sum means a topical practice and gets clean pages with no header. The
// "out of" box doubles as the manual override: type the total to force the strip
// on anything. Both PDF routes and the ✏️ Annotate flatten share this gate.
export function shouldStampPaperTotal(maxSource: string | null | undefined): boolean {
  return maxSource === 'registry' || maxSource === 'override';
}

// Paper total, drawn into that strip. It sits on the LEFT and is labelled, because the
// annotated photo already carries a hand-circled PAGE total in its top-right corner and
// two unlabelled red scores stacked in one corner read as a contradiction.
export async function drawPaperTotal(
  pdfDoc: PDFDocument,
  page: PDFPage,
  p: { width: number; imgHeight: number; studentName: string; studentLevel: string; totalAwarded: number; totalMax: number },
): Promise<void> {
  const reg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const strip = stripHeight(p.width);
  const red = rgb(0.816, 0.204, 0.173);
  const pad = Math.round(strip * 0.3);
  const yMid = p.imgHeight + strip / 2;

  // The image is drawn at y=0, so the strip is bare page above it — paint it white so a
  // JPEG's edge tint doesn't bleed into the label.
  page.drawRectangle({ x: 0, y: p.imgHeight, width: p.width, height: strip, color: rgb(1, 1, 1) });

  const label = 'PAPER TOTAL';
  const score = `${p.totalAwarded} / ${p.totalMax}`;
  const labelSize = Math.round(strip * 0.24), scoreSize = Math.round(strip * 0.46);
  const boxW = pad * 2 + Math.max(bold.widthOfTextAtSize(score, scoreSize), reg.widthOfTextAtSize(label, labelSize));
  const boxH = strip * 0.82;
  page.drawRectangle({
    x: pad, y: yMid - boxH / 2, width: boxW, height: boxH,
    borderColor: red, borderWidth: Math.max(1.5, strip * 0.028),
  });
  page.drawText(label, { x: pad * 2, y: yMid + boxH * 0.08, font: reg, size: labelSize, color: red });
  page.drawText(score, { x: pad * 2, y: yMid - boxH * 0.42, font: bold, size: scoreSize, color: red });

  const who = [p.studentName, p.studentLevel].filter(Boolean).join('  ·  ');
  const dateStr = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });
  const meta = [who, dateStr, 'Marked by AdrianMath'].filter(Boolean).join('   ·   ');
  const metaSize = Math.round(strip * 0.22);
  page.drawText(meta, {
    x: p.width - pad - reg.widthOfTextAtSize(meta, metaSize), y: yMid - metaSize * 0.35,
    font: reg, size: metaSize, color: rgb(0.42, 0.447, 0.502),
  });
}
