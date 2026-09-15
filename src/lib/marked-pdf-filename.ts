// The name a marked script downloads as — the student's copy and Adrian's.
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

import { displayPaperName } from './paper-display-name';

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
  /** `marked` = the pages with the pen on them; `full` = the full report;
   *  `annotated` = the copy Adrian's own pen has been over; `sheet` = the
   *  Practice Again sheet written from that paper. */
  kind?: 'marked' | 'full' | 'annotated' | 'sheet';
}): string {
  const parts = [clean(input.studentName || ''), clean(input.paperName || '') || 'Marked paper', prettyDate(input.dateISO)]
    .filter(Boolean);
  let base = parts.join(' — ');
  if (input.kind === 'full') base += ' (full report)';
  if (input.kind === 'annotated') base += ' (annotated)';
  if (input.kind === 'sheet') base += ' (Practice Again)';
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
  const folded = String(filename || '')
    .replace(/[\u2014\u2013\u2012\u2010]/g, '-')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // `|| 'marked-paper.pdf'` was not enough: a name that is ALL non-ASCII folds to
  // punctuation, not to "". "—" becomes "-", which is truthy, so the fallback never
  // fired and the student's download was called `-`. A name needs a letter or digit
  // to be a name at all.
  const ascii = /[A-Za-z0-9]/.test(folded) ? folded : 'marked-paper.pdf';
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * The name an admin page gives a run's PDF: the student, the paper the way it
 * reads rather than the way it was typed, the date it was marked, and which
 * copy it is. `paperName` is the run's raw `paper_name`.
 */
export function adminPdfName(
  run: { studentName?: string | null; paperName?: string | null; dateISO?: string | null },
  kind: 'marked' | 'full' | 'annotated' | 'sheet' = 'marked',
): string {
  return markedPdfFilename({
    studentName: run.studentName,
    // "A Math · GCE 2021 · Paper 1" reads well on a page; in a filename the
    // middle dots are noise, and the ASCII fold would drop them anyway.
    paperName: displayPaperName(run.paperName, run.studentName).replace(/\s*·\s*/g, ' '),
    dateISO: run.dateISO,
    kind,
  });
}

/**
 * The href an ADMIN page should give a marked PDF, so the file arrives somewhere
 * else under a name that says whose paper it is.
 *
 * Adrian, 15 Sep 2026: "from /admin/desk when i view the pdfs, and try to import
 * them to notability, they are always named something like marked-photos".
 * A stored file's key ends in `marked-photos.pdf` / `marked-full.pdf`, and
 * /api/files serves it under exactly that — so every paper of every student
 * imports under the same three names. Safari's share sheet titles an
 * inline-viewed PDF from the URL's LAST PATH SEGMENT, which is why the name
 * rides in the path here as well as in the header.
 */
export function adminPdfHref(url: string, filename: string, opts: { run?: string | null } = {}): string {
  const q = new URLSearchParams({ url, name: filename, disposition: 'inline' });
  // ?run= marks the paper ✓ Checked — only the send row passes it; looking at a
  // copy from a library or a profile is not checking it.
  if (opts.run) q.set('run', opts.run);
  return `/api/admin/mark-paper-download/${encodeURIComponent(filename)}?${q.toString()}`;
}
