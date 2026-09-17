// The remark on the marked cover (17 Sep 2026, Adrian: "remarks should say
// something useful — like 'Well done. The marks you lost are all careless
// ones, and those are the easiest to get back' is okay, not any generic
// statements"). One line under the score, built from FACTS the cover already
// has: how many marks went to careless slips, to method, to stopping short,
// and how this paper compares with the student's last paper at the same level.
// When the facts do not support a specific sentence, the cover says NOTHING —
// a generic line is worse than none.
//
// The sentences are Adrian's; edit REMARK_BANK, keep the placeholders. Every
// remark is pure and tested (cover-remark.test.ts); front-page-build.ts feeds
// it and front-page-html.ts prints it.
import type { ErrorKindTotals } from './error-kinds';

export type RemarkFacts = {
  awarded: number;
  max: number;
  kinds: ErrorKindTotals | null | undefined;
  /** The student's previous released paper at the same level, when there is one. */
  previous?: { awarded: number; max: number } | null;
};

/** {lost} = marks lost, {careless} / {concept} / {incomplete} = marks by kind,
 *  {prevPct} / {pct} = percentages. */
export const REMARK_BANK = {
  // Written the way a Singapore secondary teacher talks to a Sec 1–4 student:
  // short, direct, what happened and what to do (Adrian, 17 Sep 2026: "you are
  // talking to students … no code-speak").
  full: 'Full marks. Well done — keep it up.',
  fewCareless: 'Well done. The marks you lost are all careless mistakes, and those are the easiest to get back.',
  mostlyCareless: 'You lost {lost} marks, and {careless} of them were careless mistakes — a wrong sign, a number copied wrongly, an answer not rounded properly. Check every answer before you move on and you will get these marks back.',
  mostlyConcept: 'You lost {lost} marks, and {concept} of them were because the method was wrong. Go through the corrections on your paper and do the practice — these are the marks to work on.',
  mostlyIncomplete: 'You lost {lost} marks, and {incomplete} of them were because you stopped before the final answer. Your working was right — always finish the question and write the final answer clearly.',
  mixed: 'You lost {lost} marks: {careless} were careless mistakes and {concept} were because the method was wrong. Check your answers to get the careless ones back, and go through the corrections for the rest.',
  up: ' Your last paper was {prevPct}% — this is an improvement. Keep it up.',
  down: ' Your last paper was {prevPct}%. Go through the corrections carefully before the next one.',
} as const;

function fill(t: string, v: Record<string, number | string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
}

/** The remark, or null when nothing specific can be said. */
export function coverRemark(f: RemarkFacts): string | null {
  const max = Number(f.max) || 0, awarded = Number(f.awarded) || 0;
  if (max <= 0 || awarded < 0 || awarded > max) return null;
  const lost = max - awarded;
  const pct = Math.round((awarded / max) * 100);
  let line: string | null = null;
  if (lost === 0) line = REMARK_BANK.full;
  else if (f.kinds && f.kinds.lostTotal > 0) {
    const k = f.kinds;
    const careless = k.careless, concept = k.concept, incomplete = k.incomplete;
    const labelled = careless + concept + incomplete;
    // Say nothing when most of the lost marks carry no kind — the sentence would be a guess.
    if (labelled * 2 >= k.lostTotal) {
      const v = { lost, careless, concept, incomplete };
      if (lost <= 3 && careless === lost) line = REMARK_BANK.fewCareless;
      else if (careless * 10 >= lost * 6) line = fill(REMARK_BANK.mostlyCareless, v);
      else if (concept * 2 >= lost) line = fill(REMARK_BANK.mostlyConcept, v);
      else if (incomplete * 2 >= lost) line = fill(REMARK_BANK.mostlyIncomplete, v);
      else if (careless > 0 && concept > 0) line = fill(REMARK_BANK.mixed, v);
    }
  }
  if (!line) return null;
  // The comparison rides only when it says something: a previous paper at the
  // same level and a move of three points or more.
  const p = f.previous;
  if (p && Number(p.max) > 0) {
    const prevPct = Math.round((Number(p.awarded) / Number(p.max)) * 100);
    if (pct - prevPct >= 3) line += fill(REMARK_BANK.up, { prevPct, pct });
    else if (prevPct - pct >= 3) line += fill(REMARK_BANK.down, { prevPct, pct });
  }
  return line;
}
