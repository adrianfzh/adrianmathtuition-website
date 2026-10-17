// A question from school with several parts — (a), (b), (c)… — marked part by part (17 Oct 2026, Adrian: "yes" to
// "fix questions with several parts first"). Most Geography questions run (a)–(e) and Social Studies Section B is
// (a) + (b); marked as one question of one type, the marks were wrong. At hand-in, one short read splits the
// question into its parts and the student's answer by part (by its own labels, else by what each piece answers);
// each part becomes its own run — its own type, marks, feedback, exact mark and sample answer — sharing a
// `group_id`, and /app/humanities/group/<id> shows them together with the total. Pure here; the read is in
// lib/humanities-own-points (splitOwnParts), the hand-in in /api/portal/humanities/own.

export interface OwnPart { label: string; question: string; marks: number | null; answer: string }
export interface OwnSplit { stem: string; parts: OwnPart[] }

/** Two or more part labels in the question: "(a) … (b) …", "a) … b) …", "(i) … (ii) …" at the start of a line or after a full stop. */
export function hasParts(question: string): boolean {
  const q = String(question ?? '');
  const letters = q.match(/(^|\n|[.?]\s+)\(?([a-h])\)\s/gi) ?? [];
  const romans = q.match(/(^|\n|[.?]\s+)\((i|ii|iii|iv|v|vi)\)\s/gi) ?? [];
  return letters.length >= 2 || romans.length >= 2;
}

export function splitPrompt(question: string, answer: string): string {
  return [
    'Below is ONE exam question from a Singapore secondary Humanities paper that has several parts, and a student\'s answer to it.',
    'Split both by part.',
    '',
    'QUESTION', question,
    '', "STUDENT'S ANSWER", answer,
    '',
    'Rules:',
    '- "stem": the words before the first part that every part needs (e.g. "Study Fig. 1, which shows …"), or "".',
    '- One entry per part, in order, with its label exactly as printed ("a", "b", "c(i)" …), its own words, and its marks if printed (e.g. [4] → 4), else null.',
    '- "answer": the piece of the student\'s answer for that part, copied EXACTLY, word for word. Use the student\'s own labels when they wrote them; otherwise decide by what each piece answers. "" when the student did not answer that part. Every word of the answer belongs to exactly one part.',
    '',
    'Reply with one JSON object only: {"stem": "…", "parts": [{"label": "a", "question": "…", "marks": 4, "answer": "…"}]}',
  ].join('\n');
}

/** The reply → a split with two or more parts, or null (then the question is marked whole, as before). */
export function parseSplit(reply: string | null | undefined): OwnSplit | null {
  const m = String(reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { stem?: unknown; parts?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const parts = (Array.isArray(j.parts) ? j.parts as Record<string, unknown>[] : [])
    .map(p => {
      const marks = Number(p.marks);
      return {
        label: String(p.label ?? '').replace(/[()]/g, '').trim(),
        question: String(p.question ?? '').trim(),
        marks: Number.isInteger(marks) && marks > 0 && marks <= 30 ? marks : null,
        answer: String(p.answer ?? '').trim(),
      };
    })
    .filter(p => p.label && p.question);
  if (parts.length < 2) return null;
  return { stem: String(j.stem ?? '').trim(), parts };
}

/** What one part's own question reads like: the shared stem, then "(a) …" with its marks. */
export function partQuestion(stem: string, p: OwnPart): string {
  const marks = p.marks && !/\[\s*\d+\s*\]/.test(p.question) ? ` [${p.marks}]` : '';
  return `${stem ? `${stem}\n\n` : ''}(${p.label}) ${p.question}${marks}`;
}

/** The total over the parts once every part has a number: [got, out of], else null. */
export function groupTotal(parts: { got: number | null; outOf: number | null }[]): [number, number] | null {
  if (!parts.length || parts.some(p => p.got == null || p.outOf == null)) return null;
  return [parts.reduce((n, p) => n + (p.got ?? 0), 0), parts.reduce((n, p) => n + (p.outOf ?? 0), 0)];
}
