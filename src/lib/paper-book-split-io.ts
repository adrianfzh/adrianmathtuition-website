// The I/O half of the book splitter: reading covers with a vision model and
// slicing the PDF. The decisions are in paper-book-split.ts (pure, tested);
// this file only moves bytes. Used by /api/cron/extraction-inbox.
//
// The whole PDF (or a ≤100-page slice of it) goes to the model as a document
// block — these scans have no text layer, so a text extractor would see
// nothing, and Vercel has no page rasteriser; the API renders the pages itself.
// One call per slice, a few dozen tokens back. A 34-page TYS book is one call.
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import {
  COVER_PROMPT, MAX_BOOK_PAGES, MAX_BYTES_PER_CALL, chunkRanges, parseCoverAnswer, planSplit,
  type BookPart, type CoverHit, type SplitPlan,
} from './paper-book-split';

export const COVER_MODEL = process.env.BOOK_COVER_MODEL || 'claude-sonnet-5';

export type BookRead = {
  plan: SplitPlan;
  pageCount: number;
  /** Present when plan.kind === 'split': each part's own PDF bytes. */
  parts?: Array<BookPart & { bytes: Uint8Array }>;
  calls: number;
  model: string;
};

/** Pages [from, to] (1-based, inclusive) of `src` as a standalone PDF. */
export async function pdfSlice(src: PDFDocument, from: number, to: number): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const idx: number[] = [];
  for (let i = from - 1; i <= to - 1; i++) idx.push(i);
  const pages = await out.copyPages(src, idx);
  for (const p of pages) out.addPage(p);
  return out.save({ useObjectStreams: false });
}

async function askCovers(client: Anthropic, pdf: Uint8Array, model: string): Promise<string> {
  const res = await client.messages.create({
    model,
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(pdf).toString('base64') } },
        { type: 'text', text: COVER_PROMPT },
      ],
    }],
  });
  return res.content.map(c => (c.type === 'text' ? c.text : '')).join('').trim();
}

/**
 * Every cover the model can see in the book, in the book's page numbers.
 * Slices the book into ≤100-page, ≤20 MB pieces (halving a piece whose bytes
 * come out too large), asks once per piece and offsets the answers.
 */
export async function detectCovers(
  bytes: Uint8Array, src: PDFDocument, opts: { client?: Anthropic; model?: string } = {},
): Promise<{ covers: CoverHit[]; calls: number }> {
  const client = opts.client ?? new Anthropic();
  const model = opts.model ?? COVER_MODEL;
  const n = src.getPageCount();
  const queue = chunkRanges(n);
  const covers: CoverHit[] = [];
  let calls = 0;
  while (queue.length) {
    const [from, to] = queue.shift() as [number, number];
    const whole = from === 1 && to === n;
    const slice = whole ? bytes : await pdfSlice(src, from, to);
    if (slice.byteLength > MAX_BYTES_PER_CALL && to > from) {
      const mid = Math.floor((from + to) / 2);
      queue.unshift([from, mid], [mid + 1, to]);
      continue;
    }
    if (slice.byteLength > MAX_BYTES_PER_CALL) throw new Error(`page ${from} alone is ${Math.round(slice.byteLength / 1e6)} MB — too large to read`);
    const text = await askCovers(client, slice, model);
    covers.push(...parseCoverAnswer(text, from - 1));
    calls++;
  }
  return { covers, calls };
}

/**
 * Read a dropped PDF's covers and, when it holds more than one paper, cut it.
 * Never throws for a bad PDF or a model that answers nonsense — the plan says
 * 'none' with the reason and the caller files the book exactly as before.
 * A model/API failure DOES throw, so the tick can say so and try again next time.
 */
export async function splitBook(bytes: Uint8Array, opts: { client?: Anthropic; model?: string } = {}): Promise<BookRead> {
  const model = opts.model ?? COVER_MODEL;
  let src: PDFDocument;
  try { src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); }
  catch (e) { return { plan: { kind: 'none', reason: `PDF could not be read: ${(e as Error).message.slice(0, 80)}` }, pageCount: 0, calls: 0, model }; }
  const pageCount = src.getPageCount();
  if (pageCount > MAX_BOOK_PAGES) return { plan: { kind: 'none', reason: `${pageCount} pages — longer than a book the watcher reads (${MAX_BOOK_PAGES})` }, pageCount, calls: 0, model };
  if (pageCount < 2) return { plan: { kind: 'none', reason: 'one page' }, pageCount, calls: 0, model };
  const { covers, calls } = await detectCovers(bytes, src, { client: opts.client, model });
  const plan = planSplit(covers, pageCount);
  if (plan.kind !== 'split') return { plan, pageCount, calls, model };
  const parts: Array<BookPart & { bytes: Uint8Array }> = [];
  for (const p of plan.parts) parts.push({ ...p, bytes: await pdfSlice(src, p.from, p.to) });
  return { plan, pageCount, parts, calls, model };
}
