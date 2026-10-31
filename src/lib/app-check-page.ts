// ✅ Check this page — the pure half (SPEC-STUDENT-APP.md §0c, 31 Oct 2026).
//
// The Notebook iPad app sends a picture of ONE notebook page (the worksheet under it, the
// student's ink on top) plus the lines of handwriting it found, each with a number and its
// box. The picture carries the same numbers in small red circles at the left of each line,
// so the marker answers by LINE NUMBER, never by guessing coordinates — the app already
// knows where every line is and puts the tick or cross at its end.
//
// This file: the request check, the prompt, and reading the marker's answer back into a
// shape the app draws. The route (app/api/app/check-page) does auth, cap and the call.

export const CHECK_PAGE_DAILY_CAP = 30;
/** Base64 of the page picture; the app sends a JPEG well under this. */
export const MAX_IMAGE_CHARS = 4_000_000;
export const MAX_LINES = 80;

export interface PageLine {
  n: number;
  /** x, y, width, height in page points (the page is 820 × 1160). */
  box: [number, number, number, number];
}

export interface CheckPageRequest {
  image: string;
  lines: PageLine[];
}

export type LineMark = 'tick' | 'cross';

export interface CheckedLine {
  n: number;
  mark: LineMark;
  /** At most a few words, written beside the line. Empty for a tick. */
  note: string;
}

export interface CheckedQuestion {
  label: string;
  verdict: 'correct' | 'partial' | 'wrong';
  /** One short sentence: what went wrong. Empty when correct. */
  wrong: string;
  /** One short sentence: what to do instead. Empty when correct. */
  fix: string;
  /** The right final answer, when the page shows the question. */
  answer: string;
}

export interface CheckPageResult {
  verdict: 'correct' | 'partial' | 'wrong' | 'unreadable';
  /** One line for the top of the sheet: "2 of 3 right", "Nothing to check on this page". */
  summary: string;
  lines: CheckedLine[];
  questions: CheckedQuestion[];
}

export function parseCheckPageRequest(body: unknown): { ok: true; req: CheckPageRequest } | { ok: false; error: string } {
  const b = (body ?? {}) as { image?: unknown; lines?: unknown };
  if (typeof b.image !== 'string' || !b.image) return { ok: false, error: 'image required' };
  const image = b.image.replace(/^data:[^,]+,/, '');
  if (image.length > MAX_IMAGE_CHARS) return { ok: false, error: 'Page picture too large' };
  if (!Array.isArray(b.lines)) return { ok: false, error: 'lines required' };
  const lines: PageLine[] = [];
  for (const raw of b.lines.slice(0, MAX_LINES)) {
    const l = raw as { n?: unknown; box?: unknown };
    if (!Number.isInteger(l.n) || !Array.isArray(l.box) || l.box.length !== 4) continue;
    const box = l.box.map(Number);
    if (box.some(v => !Number.isFinite(v))) continue;
    lines.push({ n: l.n as number, box: box as PageLine['box'] });
  }
  if (!lines.length) return { ok: false, error: 'Write something on the page first' };
  return { ok: true, req: { image, lines } };
}

export function buildCheckPagePrompt(lines: PageLine[]): string {
  const list = lines.map(l => `${l.n}`).join(', ');
  return `You are a Singapore secondary / JC maths and science tutor checking ONE page of a student's notebook.

The picture is the page. Printed text (a worksheet) may be under the handwriting. The student's handwritten lines are numbered with small red circled numbers at their left: ${list}.

Do this:
1. Find each question the student attempted on this page (printed on the page, or written by the student).
2. Solve it yourself first. Then check the student's working line by line.
3. Mark each numbered handwritten line:
   - "tick" when the step is right (or carries a right answer forward from an earlier slip — mark the slip, not every line after it);
   - "cross" on the line where a mistake is made, and on a wrong final answer.
   Leave out lines that are not working (a doodle, a heading, a crossed-out line).
4. A cross gets a note of at most 6 words, said to the student: what is wrong on that line ("should be ≤", "sign of 4 lost"). A tick gets an empty note.
5. For each question: verdict correct / partial / wrong, one short sentence on what went wrong, one short sentence on what to do instead, and the right final answer.

Rules:
- Plain words. No mark codes (M1, A1), no examiner language, no mention of being a model.
- Write maths as plain text a phone can show: x², √, ≤, ≥, π, fractions as a/b.
- If there is nothing to check (blank, not maths or science, unreadable), say so: verdict "unreadable".
- Judge only what is written. Do not invent working the student did not write.

Answer with ONLY this JSON, nothing before or after:
{"verdict":"correct|partial|wrong|unreadable","summary":"one short line","lines":[{"n":1,"mark":"tick|cross","note":""}],"questions":[{"label":"Q1(a)","verdict":"correct|partial|wrong","wrong":"","fix":"","answer":""}]}`;
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const VERDICTS = ['correct', 'partial', 'wrong'] as const;

/** Reads the marker's reply. Lines it names that the app never sent are dropped. */
export function parseCheckPageReply(text: string, sent: PageLine[]): CheckPageResult {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON in the reply');
  const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const known = new Set(sent.map(l => l.n));
  const seen = new Set<number>();
  const lines: CheckedLine[] = [];
  for (const r of Array.isArray(raw.lines) ? raw.lines : []) {
    const l = r as { n?: unknown; mark?: unknown; note?: unknown };
    const n = Number(l.n);
    if (!known.has(n) || seen.has(n) || (l.mark !== 'tick' && l.mark !== 'cross')) continue;
    seen.add(n);
    lines.push({ n, mark: l.mark, note: l.mark === 'cross' ? clip(l.note, 60) : '' });
  }
  const questions: CheckedQuestion[] = [];
  for (const r of Array.isArray(raw.questions) ? raw.questions.slice(0, 12) : []) {
    const q = r as Record<string, unknown>;
    const verdict = VERDICTS.includes(q.verdict as never) ? (q.verdict as CheckedQuestion['verdict']) : null;
    if (!verdict) continue;
    questions.push({
      label: clip(q.label, 20) || `Question ${questions.length + 1}`,
      verdict,
      wrong: verdict === 'correct' ? '' : clip(q.wrong, 240),
      fix: verdict === 'correct' ? '' : clip(q.fix, 240),
      answer: clip(q.answer, 160),
    });
  }
  let verdict: CheckPageResult['verdict'] =
    raw.verdict === 'unreadable' ? 'unreadable' : VERDICTS.includes(raw.verdict as never) ? (raw.verdict as CheckPageResult['verdict']) : 'wrong';
  // The page verdict follows the questions when the marker's own summary disagrees with them.
  if (verdict !== 'unreadable' && questions.length) {
    verdict = questions.every(q => q.verdict === 'correct') ? 'correct'
      : questions.every(q => q.verdict === 'wrong') ? 'wrong' : 'partial';
  }
  if (verdict === 'unreadable') return { verdict, summary: clip(raw.summary, 120) || 'Nothing to check on this page.', lines: [], questions: [] };
  const right = questions.filter(q => q.verdict === 'correct').length;
  const summary = questions.length > 1 ? `${right} of ${questions.length} right`
    : clip(raw.summary, 120) || (verdict === 'correct' ? 'All correct' : 'One thing to fix');
  return { verdict, summary, lines, questions };
}
