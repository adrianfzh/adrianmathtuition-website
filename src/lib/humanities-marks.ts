// A level as a school mark (15 Oct 2026, Adrian: "yes" to showing school-style marks). Schools mark a
// levels-of-response answer by settling the level, then a mark inside that level's range. Our reader
// settles the level only, so we show the RANGE the schools give that level ("about 4–5 out of 6").
//
// The ranges are the common ones in the ~500 banked school schemes (humanities_questions.scheme, counted
// 15 Oct 2026), lined up against OUR levels (schemes.json): where a school uses more levels than we do
// (comparison, surprise and usefulness often run to L5–L6), their lower levels are folded into ours by
// what each level asks for. A mark total not in the table is scaled from the skill's usual total.
// Pure; no I/O.

type Bands = [number, number][];

/** skill → marks → one [lo, hi] per our level, Level 1 first. */
const TABLE: Record<string, Record<number, Bands>> = {
  inference: { 5: [[1, 1], [2, 3], [4, 5]], 6: [[1, 2], [3, 4], [5, 6]] },
  comparison: { 6: [[1, 2], [3, 4], [5, 5], [6, 6]], 7: [[1, 2], [3, 4], [5, 6], [7, 7]] },
  reliability: { 6: [[1, 1], [2, 3], [4, 5], [6, 6]], 7: [[1, 1], [2, 3], [4, 5], [6, 7]] },
  usefulness: { 6: [[1, 1], [2, 3], [4, 5], [6, 6]], 7: [[1, 1], [2, 3], [4, 5], [6, 7]] },
  purpose: { 5: [[1, 1], [2, 2], [3, 4], [5, 5]], 6: [[1, 1], [2, 2], [3, 4], [5, 6]], 7: [[1, 1], [2, 3], [4, 5], [6, 7]] },
  surprise: { 6: [[1, 1], [2, 3], [4, 5], [6, 6]], 7: [[1, 2], [3, 4], [5, 6], [7, 7]] },
  how_far: { 10: [[1, 1], [2, 4], [5, 8], [9, 10]] },
  sr_explain: { 7: [[1, 1], [2, 4], [5, 7]] },
  sr_weigh: { 8: [[1, 2], [3, 4], [5, 7], [8, 8]] },
  hist_evaluate: { 10: [[1, 3], [4, 5], [6, 8], [9, 10]] },
  geo_evaluate: { 9: [[1, 3], [4, 6], [7, 9]] },
};

/** The usual mark total of each type, for a question that does not print its marks. */
export const USUAL_MARKS: Record<string, number> = {
  inference: 5, comparison: 6, reliability: 7, usefulness: 7, purpose: 6, surprise: 7,
  how_far: 10, sr_explain: 7, sr_weigh: 8, hist_evaluate: 10, geo_evaluate: 9,
};

/** The mark range of each level for this type and total, or null when the type is not level-marked. */
export function markBands(skill: string, marks?: number | null): Bands | null {
  const bySkill = TABLE[skill];
  if (!bySkill) return null;
  const total = marks && marks > 0 ? marks : USUAL_MARKS[skill];
  if (bySkill[total]) return bySkill[total];
  // Scale the usual table to this total: each level keeps its share, the ranges stay joined.
  const ref = bySkill[USUAL_MARKS[skill]] ?? Object.values(bySkill)[0];
  const top = ref[ref.length - 1][1];
  const out: Bands = [];
  let prev = 0;
  for (const [, hi] of ref) {
    const h = Math.max(prev + 1, Math.round((hi / top) * total));
    out.push([prev + 1, Math.min(h, total)]);
    prev = Math.min(h, total);
  }
  out[out.length - 1][1] = total;
  return out.every(([a, b]) => a <= b) ? out : null;
}

/** The marks an answer read at levels lo…hi would earn: [from, to, total], or null. */
export function markRange(skill: string, marks: number | null | undefined, lo: number, hi: number): [number, number, number] | null {
  const bands = markBands(skill, marks);
  if (!bands) return null;
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  if (a < 1 || b > bands.length) return null;
  return [bands[a - 1][0], bands[b - 1][1], bands[bands.length - 1][1]];
}

/** "4 to 5 out of 6 marks" for an answer read at levels lo…hi, or null. */
export function marksForLevels(skill: string, marks: number | null | undefined, lo: number, hi: number): string | null {
  const r = markRange(skill, marks, lo, hi);
  if (!r) return null;
  const [from, to, total] = r;
  return `${from === to ? from : `${from} to ${to}`} out of ${total} marks`;
}

/** The marks a question prints, e.g. "[6]" at its end. */
export function printedMarks(question: string): number | null {
  const m = question.match(/\[\s*(\d{1,2})\s*(?:marks?|m)?\s*\]/i) ?? question.match(/\((\d{1,2})\s*marks?\)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 && n <= 30 ? n : null;
}
