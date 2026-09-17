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
  // talking to students … no code-speak"; "are some of the remarks too long?"
  // — two short sentences at most, the comparison one clause).
  full: 'Full marks. Well done — keep it up.',
  fewCareless: 'Well done. The marks you lost are all careless mistakes, and those are the easiest to get back.',
  mostlyCareless: '{careless} of the {lost} marks you lost were careless mistakes. Check every answer before you move on.',
  mostlyConcept: '{concept} of the {lost} marks you lost were from using the wrong method. Go through the corrections and do the practice.',
  mostlyIncomplete: '{incomplete} of the {lost} marks you lost were because you stopped before the final answer. Always finish the question.',
  mixed: '{careless} careless mistakes, {concept} marks from the wrong method. Check your answers, and go through the corrections.',
  up: ' Up from {prevPct}% last paper — keep it up.',
  down: ' This is a big drop from {prevPct}% last paper — come and talk to me about it.',
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
  // The comparison rides only when it says something. An improvement of five
  // points or more is worth a word. A DROP is mentioned only when it is drastic
  // — fifteen points or more, the size that says something went wrong — and
  // never as a scold: a harder paper is not a worse student (Adrian, 17 Sep
  // 2026: "creates unnecessary pressure, this may be a genuinely more difficult
  // paper. only mention it if there is a drastic change").
  const p = f.previous;
  if (p && Number(p.max) > 0) {
    const prevPct = Math.round((Number(p.awarded) / Number(p.max)) * 100);
    if (pct - prevPct >= 5) line += fill(REMARK_BANK.up, { prevPct, pct });
    else if (prevPct - pct >= 15) line += fill(REMARK_BANK.down, { prevPct, pct });
  }
  return line;
}
