// Whether a fresh marking can ship its photos inline, or must mark the saved
// run by id instead. Vercel rejects request bodies over 4.5MB at the PLATFORM
// level (unliftable — see CLAUDE.md); the base64 page images are the bulk of
// the 'direct' body, so past this threshold the call would 413 at the edge
// before our route ever runs. 1MB of headroom covers the URLs, field names and
// JSON punctuation around the images. The 25-page phone-photographed prelim
// that hit this: 13 Aug 2026.
export const INLINE_BODY_LIMIT = 3.5 * 1024 * 1024;

// base64 is ASCII, so string length IS the byte count the body will carry.
export function markInlineBytes(pdfBase64: string | null, images: { base64: string }[]): number {
  return (pdfBase64 ? pdfBase64.length : 0) + images.reduce((s, im) => s + im.base64.length, 0);
}

// The saved pending run can stand in for the inline payload only when it is
// COMPLETE — marking it must be the SAME marking, not a lossy one:
//  - the save-paper row exists (pendingId),
//  - every page's original reached Blob (a hole would mark a partial paper),
//  - every page decoded in the browser (an undecodable page is stored as raw
//    camera bytes the server may not read — inline stays the safety net there),
//  - the question paper, when one is attached, reached Blob too.
export function canMarkFromStored(args: {
  pendingId: string | null;
  originalUrls: (string | null)[];
  decoded: boolean[];
  hasPaperPdf: boolean;
  paperPdfUrl: string | null;
}): boolean {
  return !!args.pendingId
    && args.originalUrls.length > 0
    && args.originalUrls.every(Boolean)
    && args.decoded.every(Boolean)
    && (!args.hasPaperPdf || !!args.paperPdfUrl);
}
