// The name a student's marked script downloads as.
//
// Adrian, 3 Sep 2026: "right now the pdfs in the marked folder is named
// Marked (AI), is that what the students see as well? the pdf should be
// properly named". Students never saw "Marked (AI)" — that is the Dropbox
// filing name inside a per-paper folder. They saw WORSE: the marked PDFs live
// in Vercel Blob under a timestamp path, the links on /app/marking pointed
// straight at Blob, and a cross-origin link ignores `download=`, so a saved
// copy was called "2026-08-28T12-42-31-232-….pdf". The fix is a same-origin
// route (/api/portal/marking-pdf) that streams the file with a
// Content-Disposition filename built here — the same convention the admin
// send row uses: `Student — Paper name — 30 Jul 2026.pdf`.
//
// Pure, tested. Never throws; always returns something ending in .pdf.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-03" (or any ISO instant) → "3 Sep 2026"; junk → "". */
export function prettyDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${d} ${MONTHS[mo - 1]} ${y}`;
}

/** Characters no file system accepts, plus the ones Content-Disposition can't carry unescaped. */
function clean(s: string): string {
  return String(s || '').replace(/["\r\n]/g, '').replace(/[\\/:*?<>|]+/g, '-').replace(/\s+/g, ' ').trim();
}

export function markedPdfFilename(input: {
  studentName?: string | null;
  paperName?: string | null;
  dateISO?: string | null;
  /** `marked` = the pages with the pen on them; `full` = the full report. */
  kind?: 'marked' | 'full';
}): string {
  const parts = [clean(input.studentName || ''), clean(input.paperName || '') || 'Marked paper', prettyDate(input.dateISO)]
    .filter(Boolean);
  let base = parts.join(' — ');
  if (input.kind === 'full') base += ' (full report)';
  if (base.length > 120) base = base.slice(0, 120).trim();
  return `${base}.pdf`;
}

/**
 * The Content-Disposition header for a marked-script download.
 *
 * HTTP header values must be ISO-8859-1 bytes; the pretty filename carries
 * an em dash (U+2014), and `new Headers({...})` throws "Cannot convert
 * argument to a ByteString" on it — which is exactly what happened on
 * production on 3 Sep 2026: every "Open your marked script" tap 500'd from
 * the moment the named download shipped until Chloe Zhang reported "cannot
 * see the paper". So: the quoted `filename=` gets an ASCII fold (dashes → "-",
 * anything non-printable-ASCII dropped) that every client accepts, and the
 * RFC 5987 `filename*=UTF-8''…` carries the real name for clients that read it.
 */
export function contentDisposition(filename: string, disposition: 'inline' | 'attachment' = 'inline'): string {
  const ascii = String(filename || '')
    .replace(/[\u2014\u2013\u2012\u2010]/g, '-')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'marked-paper.pdf';
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
