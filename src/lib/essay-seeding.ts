// The seeded essay bench (2 Oct 2026). A clean essay has known slips PLANTED in
// it, so the truth is known by construction — no marked scripts needed (the
// science bench's idea, for essays). The marker should find every plant, give
// it the right code, and mark little else. Pure; tested. The runner is
// scripts/essay-calibration/seeded.ts.

export interface Plant {
  /** Words in the CLEAN essay, written exactly once there. */
  find: string;
  /** The slip that replaces them. */
  replace: string;
  /** The error code the marker should give it (lib/essay-codes). */
  code: string;
}
export interface PlantSpan extends Plant { start: number; end: number }
export interface SeededMark { start: number; end: number; code: string | null }

/**
 * Plant the slips. Every `find` must be in the clean essay exactly once and two
 * plants may not overlap — a set that breaks either rule is refused, because
 * then the truth would not be known. Spans are offsets in the SEEDED text.
 */
export function applyPlants(clean: string, plants: readonly Plant[]): { text: string; spans: PlantSpan[] } {
  const placed = plants.map(p => {
    const at = clean.indexOf(p.find);
    if (!p.find || at < 0) throw new Error(`plant not in the essay: "${p.find}"`);
    if (clean.indexOf(p.find, at + 1) >= 0) throw new Error(`plant is in the essay more than once: "${p.find}"`);
    if (p.replace === p.find) throw new Error(`plant changes nothing: "${p.find}"`);
    return { p, at };
  }).sort((a, b) => a.at - b.at);
  let text = '', pos = 0;
  const spans: PlantSpan[] = [];
  for (const { p, at } of placed) {
    if (at < pos) throw new Error(`plants overlap at "${p.find}"`);
    text += clean.slice(pos, at);
    spans.push({ ...p, start: text.length, end: text.length + p.replace.length });
    text += p.replace;
    pos = at + p.find.length;
  }
  return { text: text + clean.slice(pos), spans };
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

export interface SeededScore {
  planted: number;
  found: number;
  rightCode: number;
  /** Marks on the seeded essay that touch no plant. */
  extra: number;
  foundRate: number;
  /** Of the plants found, the share given the planted code. */
  codeRate: number;
  missed: PlantSpan[];
  wrongCode: { plant: PlantSpan; got: string | null }[];
}

/** Score one marking of the seeded essay against the plants. */
export function scorePlants(spans: readonly PlantSpan[], marks: readonly SeededMark[]): SeededScore {
  const missed: PlantSpan[] = [];
  const wrongCode: { plant: PlantSpan; got: string | null }[] = [];
  let found = 0, rightCode = 0;
  for (const s of spans) {
    const hits = marks.filter(m => overlaps(m, s));
    if (!hits.length) { missed.push(s); continue; }
    found++;
    if (hits.some(m => m.code === s.code)) rightCode++;
    else wrongCode.push({ plant: s, got: hits[0].code });
  }
  const extra = marks.filter(m => !spans.some(s => overlaps(m, s))).length;
  return {
    planted: spans.length, found, rightCode, extra,
    foundRate: spans.length ? found / spans.length : 1,
    codeRate: found ? rightCode / found : 1,
    missed, wrongCode,
  };
}

export const SEEDED_GATE = { foundRate: 0.9, codeRate: 0.8 } as const;

/**
 * The verdict. `cleanMarks` = how many marks the CLEAN essay got (the noise
 * floor); the seeded essay may carry that many extra marks and a few more
 * (a planted slip can make the words beside it read wrongly too).
 */
export function seededVerdict(score: SeededScore, cleanMarks: number): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (score.foundRate < SEEDED_GATE.foundRate) reasons.push(`found ${score.found} of ${score.planted} planted slips (needs 90%)`);
  if (score.codeRate < SEEDED_GATE.codeRate) reasons.push(`right code on ${score.rightCode} of ${score.found} found (needs 80%)`);
  const allowed = cleanMarks + Math.max(2, Math.ceil(score.planted * 0.25));
  if (score.extra > allowed) reasons.push(`${score.extra} marks on words that were not planted (the clean essay got ${cleanMarks}; allowed ${allowed})`);
  return { pass: reasons.length === 0, reasons };
}
