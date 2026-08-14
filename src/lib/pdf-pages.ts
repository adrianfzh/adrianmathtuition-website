// Client-side PDF → page images, shared by both paper intakes (admin
// /admin/mark-paper and student /app/submit).
//
// A scanned PDF of a student's working is rasterised to one JPEG per page IN THE
// BROWSER, then fed into the normal photo path — so marking, the Gemini bounding
// boxes and the red-pen overlay all see a plain image and need no changes. Doing it
// here (not server-side) also keeps a fat scan off the 4.5MB request-body ceiling.
//
// Browser-only: uses canvas + dynamic import of the pdf.js browser build. Never
// import from a server component or route.

// The worker is served from /public rather than bundled: its version must match the
// installed pdfjs-dist exactly or pdf.js throws, and pdf-worker-asset.test.ts pins that.
async function loadPdfjs() {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const pdfjs = (await import('pdfjs-dist/build/pdf.mjs' as string)) as any;
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return pdfjs;
}

/**
 * Rasterise every page of `file` to a JPEG File named `<base>-pN.jpg`.
 *
 * `maxEdge` defaults to 2600 — the same cap as the original-photo uploads: these
 * page images are also what gets uploaded to Blob as the full-res base the bot
 * draws the red pen onto, so rendering small here would put the resolution
 * ceiling right back (the marking copy is still downscaled separately, so model
 * cost is unchanged).
 */
export async function pdfToPageImages(
  file: File,
  onPage: (done: number, total: number) => void,
  maxEdge = 2600,
): Promise<File[]> {
  const pdfjs = await loadPdfjs();
  // disableFontFace draws glyphs as paths instead of installing @font-face rules —
  // the page is only ever rasterised, never shown, so the document-level font
  // machinery is pure risk here.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true }).promise;
  const base = file.name.replace(/\.pdf$/i, '');
  const pages: File[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const unit = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, maxEdge / Math.max(unit.width, unit.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      // PDF pages have no background of their own — without this, JPEG turns the
      // transparent paper black and the marker sees nothing.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // intent 'print' is what makes this reliable off-screen. The default 'display'
      // intent paces the paint loop with requestAnimationFrame, which a hidden or
      // backgrounded tab never fires — the render promise then never settles and the
      // conversion hangs with no error. 'print' paces with timers instead.
      await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
      if (blob) pages.push(new File([blob], `${base}-p${n}.jpg`, { type: 'image/jpeg' }));
      page.cleanup?.();
      onPage(n, doc.numPages);
    }
  } finally { await doc.destroy?.(); }
  return pages;
}
