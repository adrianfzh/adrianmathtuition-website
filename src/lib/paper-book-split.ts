// 📚 A combined exam book → one file per paper (10 Sep 2026).
//
// Adrian, on the 2025 Ten-Year-Series scans: "model should be smart enough to
// differentiate between paper 1 and paper 2 in the pdf, should not have to
// split myself."
//
// A TYS book — and many school PDFs — carries Paper 1 and Paper 2 back to back
// in one file. The marker looks a paper up by (school, year, level, paper) and
// the extraction fleet banks one paper per claim, so a book is useless to both
// until it is cut at the second cover. Until tonight that cut was done by hand
// with pdfseparate/pdfunite; the watcher merely left a note asking for it.
//
// The cut is decided here, from the covers a vision model reads off the pages
// (paper-book-split-io.ts does the reading and the slicing; this file is the
// pure part — the prompt, the answer parsing, the chunking arithmetic and the
// plan — and is what the tests pin). A cover is the FIRST page of a paper: the
// page that prints the subject, the syllabus code (4049/01, 4052/02, 9758/01),
// "Paper 1" / "Paper 2" and the year. Everything between one cover and the
// next belongs to that paper; whatever sits before the first cover (a contents
// page) rides with the first paper, whatever follows the last (a formula sheet)
// with the last. A book with one cover is one paper whose number the name
// forgot; a book with none is left exactly as it was.

/** One cover the model found, in the book's own 1-based page numbers. */
export type CoverHit = {
  page: number;
  /** 1–4; null when the cover shows no paper number. */
  paper: number | null;
  /** The exam year printed on the cover, when legible. */
  year: number | null;
  /** The syllabus code printed on the cover ("4049/01"), when legible. */
  code: string | null;
};

/** A slice of the book that is one paper. Pages are 1-based and inclusive. */
export type BookPart = { from: number; to: number; paper: number; year: number | null; code: string | null };

export type SplitPlan =
  | { kind: 'split'; parts: BookPart[] }
  /** One cover: the file is a single paper — here is its number. */
  | { kind: 'single'; paper: number | null; year: number | null }
  | { kind: 'none'; reason: string };

/** The Anthropic PDF document block takes at most this many pages per request. */
export const MAX_PAGES_PER_CALL = 100;
/** …and about 32 MB base64 — keep each slice well under that raw. */
export const MAX_BYTES_PER_CALL = 20 * 1024 * 1024;
/** Books longer than this are not read: nobody drops a 500-page compendium by accident. */
export const MAX_BOOK_PAGES = 400;
/** A real O/A-Level paper is at least this long; two "covers" closer than this are one paper. */
export const MIN_PAPER_PAGES = 4;

export const COVER_PROMPT = `You are looking at pages from a scanned book of Singapore GCE / school mathematics exam papers. Some pages are COVER pages: the first page of an exam paper, printed with the subject (ADDITIONAL MATHEMATICS, MATHEMATICS, H2 MATHEMATICS), a syllabus code such as 4049/01, 4052/02 or 9758/01, the words "Paper 1" or "Paper 2", the exam session or year, and instructions to candidates ("Answer all the questions", "Write your name"). Question pages, answer sheets, formula sheets and contents pages are NOT covers.

List every cover page in the order it appears. For each one give its page position in THIS document (the first page you were given is page 1), the paper number (1, 2, 3 or 4; null if not printed), the exam year as printed (null if not printed) and the syllabus code (null if not printed).

Answer with JSON only, no prose:
{"covers":[{"page":1,"paper":1,"year":2025,"code":"4049/01"}]}
If there is no cover page at all, answer {"covers":[]}.`;

/**
 * Parse the model's answer into covers, in the book's page numbers. `offset`
 * is the number of pages before this slice, so a chunk's page 1 is the book's
 * page offset+1. Tolerant of prose around the JSON and of a bare array; anything
 * unparseable is an empty list, never a throw. Pure.
 */
export function parseCoverAnswer(text: string, offset = 0): CoverHit[] {
  const s = String(text || '');
  const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return [];
  let raw: unknown;
  try { raw = JSON.parse(m[0]); } catch { return []; }
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray((raw as { covers?: unknown }).covers) ? (raw as { covers: unknown[] }).covers : []);
  const out: CoverHit[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const page = Number(r.page);
    if (!Number.isInteger(page) || page < 1) continue;
    const paperN = Number(r.paper);
    const yearN = Number(r.year);
    out.push({
      page: page + offset,
      paper: Number.isInteger(paperN) && paperN >= 1 && paperN <= 4 ? paperN : null,
      year: Number.isInteger(yearN) && yearN >= 1990 && yearN <= 2100 ? yearN : null,
      code: typeof r.code === 'string' && r.code.trim() ? r.code.trim().slice(0, 12) : null,
    });
  }
  return out;
}

/**
 * Page ranges to read in one call each: at most `maxPages` a call. Ranges are
 * 1-based inclusive `[from, to]`. Pure — byte-size splitting is the I/O side's
 * job (it halves a range whose slice comes out too large).
 */
export function chunkRanges(pageCount: number, maxPages = MAX_PAGES_PER_CALL): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const n = Math.max(0, Math.floor(pageCount));
  const size = Math.max(1, Math.floor(maxPages));
  for (let from = 1; from <= n; from += size) out.push([from, Math.min(n, from + size - 1)]);
  return out;
}

/**
 * The plan: where to cut, or why not.
 *
 *  - two or more covers, each at least MIN_PAPER_PAGES after the one before,
 *    every paper number present and no (year, paper) pair repeated → 'split';
 *  - exactly one cover → 'single' with the number it printed;
 *  - none, or covers that contradict each other → 'none' with the reason, and
 *    the caller leaves the file as it was (queued whole, the old note).
 *
 * Covers closer together than a paper can be are the model seeing the same
 * cover twice (a cover and its "blank page" verso, or a page that repeats the
 * header): the later one is dropped, never trusted. Pure.
 */
export function planSplit(covers: CoverHit[], pageCount: number): SplitPlan {
  const n = Math.floor(pageCount);
  if (!Number.isInteger(n) || n < 1) return { kind: 'none', reason: 'no pages' };
  const sorted = [...covers].filter(c => c.page >= 1 && c.page <= n).sort((a, b) => a.page - b.page);
  const kept: CoverHit[] = [];
  for (const c of sorted) {
    const prev = kept[kept.length - 1];
    if (prev && c.page - prev.page < MIN_PAPER_PAGES) continue;
    kept.push(c);
  }
  if (kept.length === 0) return { kind: 'none', reason: 'no cover page found' };
  if (kept.length === 1) return { kind: 'single', paper: kept[0].paper, year: kept[0].year };
  if (kept.some(c => c.paper === null)) return { kind: 'none', reason: `${kept.length} covers found but one shows no paper number` };
  const seen = new Set<string>();
  for (const c of kept) {
    const id = `${c.year ?? '?'}|${c.paper}`;
    if (seen.has(id)) return { kind: 'none', reason: `two covers both say ${c.year ? c.year + ' ' : ''}Paper ${c.paper}` };
    seen.add(id);
  }
  if (n - kept[kept.length - 1].page + 1 < MIN_PAPER_PAGES) {
    return { kind: 'none', reason: `the last cover (page ${kept[kept.length - 1].page}) leaves fewer than ${MIN_PAPER_PAGES} pages` };
  }
  const parts: BookPart[] = kept.map((c, i) => ({
    from: i === 0 ? 1 : c.page,
    to: i === kept.length - 1 ? n : kept[i + 1].page - 1,
    paper: c.paper as number,
    year: c.year,
    code: c.code,
  }));
  return { kind: 'split', parts };
}

/**
 * The file name one part gets — the fleet's own convention, the one the inbox
 * parser reads back: `AM GCE 2025 Paper 1.pdf`, `EM PRELIM 2024 Pierce Paper 2.pdf`,
 * `JC2 GCE 2025 Paper 1.pdf`. A national paper's school IS the exam, so it is
 * not repeated; a school paper keeps its school exactly as staged. The year is
 * the cover's when it printed one, else the book's. Pure.
 */
export function partFileName(
  book: { level: string; year: number; school: string; examType: string | null },
  part: Pick<BookPart, 'paper' | 'year'>,
  ext = 'pdf',
): string {
  const exam = (book.examType || 'PRELIM').toUpperCase();
  const year = part.year ?? book.year;
  const national = book.school.toUpperCase() === 'GCE' || exam === 'GCE';
  const school = national ? '' : ` ${book.school}`;
  return `${book.level} ${national ? 'GCE' : exam} ${year}${school} Paper ${part.paper}.${ext}`;
}

/** "AM GCE 2025 Paper 1 (pp. 1–16), Paper 2 (pp. 17–34)" — for the row's notes and the tick's response. Pure. */
export function describeParts(parts: BookPart[]): string {
  return parts.map(p => `Paper ${p.paper}${p.year ? ` (${p.year})` : ''} pp. ${p.from}–${p.to}`).join(', ');
}
