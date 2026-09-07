// Read a scanned paper's cover (I/O half of the ScanSnap watcher, 7 Sep 2026).
// One vision call on the first page or two: is this a student's answered exam
// script, whose is it, which paper. The pure decisions (naming, matching) are in
// lib/scan-inbox.ts; this file only talks to the model and parses its JSON.
import Anthropic from '@anthropic-ai/sdk';
import type { CoverReading } from './scan-inbox';

export const SCAN_READER_MODEL = process.env.SCAN_READER_MODEL || 'claude-sonnet-5';

const PROMPT = `You are looking at the first page(s) of a PDF that came off a document scanner in a Singapore maths tuition centre. Decide what it is and read its cover.

Answer with ONE JSON object and nothing else:
{
  "is_exam_script": true|false,   // a STUDENT'S ANSWERED exam or practice paper: printed questions with the student's handwritten working (a blank paper, notes, a worksheet with no handwriting, a receipt, a textbook page → false)
  "reason": "one short sentence",
  "student_name": "the student's full name as written on the paper, or null",
  "given_name": "the name they go by — the given name(s) only, e.g. 'Tze Hin', 'Kassandra', 'Rainie' — or null",
  "subject": "A Math" | "E Math" | "H2 Math" | "H1 Math" | "Other" | null,   // Additional Mathematics = A Math; Elementary Mathematics / Mathematics (Sec) = E Math; JC H2 Mathematics = H2 Math
  "exam": "tys" | "prelim" | "practice set N" | "test set N" | "mye" | "eoy" | "waN" | "promo" | "mock" | "other" | null,   // tys = a GCE O/A-Level past-year paper (Cambridge/SEAB header, or a Ten-Year-Series page)
  "school": "the school on the paper, short form if printed (e.g. 'SJC', 'Xinmin', 'Hwa Chong'), or null",
  "year": 2024 | null,            // the paper's year (the exam year printed on it), not today's date
  "paper": 1 | 2 | null,          // Paper 1 / Paper 2 as printed
  "confidence": 0.0-1.0
}
Read handwriting carefully; names are often written in the top corner or on a name line. If the pages are working only (no printed questions), it is still an exam script if it is clearly answers to a paper. Do not guess a name that is not on the page — use null.`;

export async function readScanCover(pages: Array<{ jpeg: Buffer }>, client = new Anthropic()): Promise<{ reading: CoverReading | null; raw: string; model: string }> {
  const content: Anthropic.MessageParam['content'] = [];
  for (const p of pages.slice(0, 2)) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.jpeg.toString('base64') } });
  }
  content.push({ type: 'text', text: PROMPT });
  const res = await client.messages.create({ model: SCAN_READER_MODEL, max_tokens: 400, messages: [{ role: 'user', content }] });
  const raw = res.content.map(c => (c.type === 'text' ? c.text : '')).join('').trim();
  return { reading: parseReading(raw), raw, model: SCAN_READER_MODEL };
}

/** The model's JSON, tolerant of a code fence. Pure. */
export function parseReading(raw: string): CoverReading | null {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
    const subject = str(j.subject);
    return {
      is_exam_script: j.is_exam_script === true,
      reason: str(j.reason),
      student_name: str(j.student_name),
      given_name: str(j.given_name),
      subject: subject && ['A Math', 'E Math', 'H2 Math', 'H1 Math', 'Other'].includes(subject) ? (subject as CoverReading['subject']) : null,
      exam: str(j.exam),
      school: str(j.school),
      year: num(j.year),
      paper: num(j.paper),
      confidence: num(j.confidence),
    };
  } catch { return null; }
}
