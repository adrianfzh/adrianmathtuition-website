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
  /** The printed text of the worksheet page under the writing (the PDF's own text), when
   *  there is one. Used only to find the question in our bank and its answer. */
  printed: string;
}

/** 'unsure' = the two looks disagreed on this line: drawn as a red "?" (Adrian, 1 Nov 2026). */
export type LineMark = 'tick' | 'cross' | 'unsure';

export interface CheckedLine {
  n: number;
  mark: LineMark;
  /** At most a few words, written beside the line. Empty for a tick. */
  note: string;
  /** A cross only: the line as it should read, written in red under the wrong line
   *  (Adrian, 31 Oct 2026: "yes" to the red pen writing the correct line). Empty when the
   *  slip is not one line's worth (a missed step, an unreadable line). */
  correct: string;
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
  const printed = typeof (b as { printed?: unknown }).printed === 'string' ? (b as { printed: string }).printed.slice(0, 6000) : '';
  return { ok: true, req: { image, lines, printed } };
}

/** A question from our bank that is printed on the page, with its right answer. */
export interface KeyQuestion { text: string; answer: string; solution: string }

function keyBlock(key: KeyQuestion[]): string {
  if (!key.length) return '';
  const qs = key.map((k, i) => `Question ${i + 1}: ${k.text}\nCorrect answer: ${k.answer}${k.solution ? `\nWorked solution: ${k.solution}` : ''}`).join('\n\n');
  return `

Our records hold the question(s) printed on this page, with the correct answers:

${qs}

Use these answers. A final answer that agrees with them is right, even when written in an equivalent form. If the student's working disagrees with them, find the line where it goes wrong. Never mention these records, a source, a school or a paper to the student.`;
}

export function buildCheckPagePrompt(lines: PageLine[], key: KeyQuestion[] = []): string {
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
   A cross also gets "correct": that same line as it should read, written the way the student would write it, carrying on from their own earlier lines (at most 40 characters, e.g. "10 > 5x"). It is written in red under their line, so it must be the corrected line itself — no words like "should be". Leave it empty when no single line fixes it. A tick gets an empty "correct".
5. For each question: verdict correct / partial / wrong, one short sentence on what went wrong, one short sentence on what to do instead, and the right final answer.

Rules:
- Plain words. No mark codes (M1, A1), no examiner language, no mention of being a model.
- Write maths as plain text a phone can show: x², √, ≤, ≥, π, fractions as a/b.
- If there is nothing to check (blank, not maths or science, unreadable), say so: verdict "unreadable".
- Judge only what is written. Do not invent working the student did not write.

Answer with ONLY this JSON, nothing before or after:
{"verdict":"correct|partial|wrong|unreadable","summary":"one short line","lines":[{"n":1,"mark":"tick|cross","note":"","correct":""}],"questions":[{"label":"Q1(a)","verdict":"correct|partial|wrong","wrong":"","fix":"","answer":""}]}${keyBlock(key)}`;
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
    const l = r as { n?: unknown; mark?: unknown; note?: unknown; correct?: unknown };
    const n = Number(l.n);
    if (!known.has(n) || seen.has(n) || (l.mark !== 'tick' && l.mark !== 'cross')) continue;
    seen.add(n);
    const cross = l.mark === 'cross';
    lines.push({ n, mark: l.mark, note: cross ? clip(l.note, 60) : '', correct: cross ? clip(l.correct, 60) : '' });
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

/**
 * Two looks at the same page (the main marker and a second, smaller one, run at the same
 * time; Adrian, 1 Nov 2026: "yes" to the second look). The second look can only RAISE a doubt:
 * a line the main look ticked and the second crossed gets a red "?" ("check this line"), no
 * correct line. A cross from the main look stays a cross — on the 20-page bench every
 * disagreement was the small marker ticking a line the main marker rightly crossed (a slip, or
 * the wrong final answer after one), and a "?" there hid a real mistake. Lines after the main
 * look's first cross carry an earlier slip forward and are left alone. The questions,
 * verdict and summary stay the main look's.
 */
export function mergeLooks(main: CheckPageResult, second: CheckPageResult | null): CheckPageResult {
  if (!second || main.verdict === 'unreadable' || second.verdict === 'unreadable') return main;
  const other = new Map(second.lines.map(l => [l.n, l.mark]));
  const firstCross = Math.min(...main.lines.filter(l => l.mark === 'cross').map(l => l.n), Infinity);
  const lines = main.lines.map(l => {
    if (l.mark !== 'tick' || l.n > firstCross || other.get(l.n) !== 'cross') return l;
    return { n: l.n, mark: 'unsure' as const, note: 'check this line', correct: '' };
  });
  return { ...main, lines };
}

/**
 * Phrases to look the printed page up by in the bank's search_text: runs of four plain words
 * (no maths), spread over the page. search_text is LaTeX-stripped and lowered, so words match
 * and symbols would not.
 */
export function keyPhrases(printed: string, max = 10): string[] {
  const chunks = printed.toLowerCase().replace(/[’']/g, '').split(/[^a-z ]+/);
  const phrases: string[] = [];
  for (const c of chunks) {
    const words = c.split(' ').filter(w => w.length >= 2);
    for (let i = 0; i + 4 <= words.length; i += 3) {
      const p = words.slice(i, i + 4).join(' ');
      if (p.length >= 16 && !phrases.includes(p)) phrases.push(p);
    }
  }
  if (phrases.length <= max) return phrases;
  const step = phrases.length / max;
  return Array.from({ length: max }, (_, i) => phrases[Math.floor(i * step)]);
}

/**
 * Which bank rows the page shows: a row must be hit by at least two phrases (one, when the
 * page gave only one usable phrase). A phrase that hits many rows is boilerplate and is
 * dropped before counting. Best first.
 */
export function pickKeyRows(hits: string[][], tooMany: number): string[] {
  let usable = hits.filter(h => h.length > 0 && h.length < tooMany);
  if (usable.length === 1 && usable[0].length > 3) usable = []; // one phrase alone must be near-unique
  const count = new Map<string, number>();
  for (const h of usable) for (const id of new Set(h)) count.set(id, (count.get(id) || 0) + 1);
  const need = usable.length <= 1 ? 1 : 2;
  return [...count.entries()].filter(([, c]) => c >= need).sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
