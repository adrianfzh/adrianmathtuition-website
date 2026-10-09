// The AdrianMath worksheet masthead — one design per series, colour and black
// and white — as the website's two worksheet doors print it (9 Oct 2026,
// Adrian: "default should not be in, but I will like them to be in later" →
// a "Brand header" switch, OFF by default). This file is the TypeScript twin
// of the chat skill's `.claude/skills/create-worksheet/worksheet_brand.py`
// (SERIES, SERIES_MONO, LEVELS) and of ADRIAN-STYLE.md §9 — the rule lives
// there; change both together.
//
//   series  header treatment                          accent / block
//   AM      navy band across the page (design B)      orange
//   EM      white, teal rule under the header (A)     teal
//   S1      pale green tinted band                    green
//   S2      white, thick blue bar over the header     bright blue 1F74D6
//   JC      white, thick vertical bar down the LEFT   deep burgundy 7A1F3D
//           edge of the masthead (9 Oct 2026)
//
// Black and white ("i usually print in black and white … the design itself
// will distinguish the papers", 17 Sep 2026): no large fill, ever — headers
// are white or a near-white tint, rules and box shapes tell the series apart,
// the logo is the outlined A, and every colour on the sheet (the orange
// [Ans:] lines) drains to dark grey 404040.
//
//   series  header                                     subject block             page-2 rule
//   AM      white, thick rule over + thin rule under   small solid black tab     thick solid
//   EM      white, one rule under the header           outlined box              double
//   S1      near-white grey tint (F2F2F2)              double-lined box          dotted
//   S2      white, thick bar over the header           heavy rules above/below   dashed
//   JC      white, thick bar down the left edge        box with a heavy left     thick-thin
//                                                      rule, thin elsewhere
//
// Pure data + lookups: no DOM, no docx, no HTML here. The Word builder
// (lib/pick-worksheet-docx.ts) and the PDF stylesheet (lib/render-bot-worksheet.ts)
// both read it, so the two files agree.

export type BrandMode = 'off' | 'colour' | 'mono';
export const BRAND_MODES: { key: BrandMode; label: string }[] = [
  { key: 'off', label: 'Off' },
  { key: 'colour', label: 'Colour' },
  { key: 'mono', label: 'Black & white' },
];
export const isBrandMode = (v: unknown): v is BrandMode => v === 'off' || v === 'colour' || v === 'mono';
/** The two printing modes (everything but 'off'). */
export type BrandPrint = Exclude<BrandMode, 'off'>;

export type BrandSeries = 'AM' | 'EM' | 'S1' | 'S2' | 'JC';
export type RuleStyle = 'single' | 'double' | 'dotted' | 'dashed' | 'thickThinSmallGap';
export type Side = 'top' | 'bottom' | 'left' | 'right';
/** A rule as Word writes it: style, size in eighths of a point, colour hex. */
export type Rule = { style: RuleStyle; sz: number; color: string };
export type FrameRule = Rule & { side: Side };

export type SeriesDesign = {
  tag: string;
  /** band = filled header; plain = white; tint = near-white fill; bar = thick rule over; edge = thick rule down the left. */
  style: 'band' | 'plain' | 'tint' | 'bar' | 'edge';
  /** the header's fill, null = white */
  ground: string | null;
  /** rules on the masthead's own edges */
  frame: FrameRule[];
  accent: string;
  /** the subject block's fill, null = an outlined box */
  block: string | null;
  tagInk: string;
  /** a bar beside the topic title, null = none */
  titleBar: string | null;
  /** rules round the subject block (the mono boxes) */
  blockRules: Partial<Record<Side, { style: RuleStyle; sz: number }>> | null;
  /** the rule under the page-2 running header */
  runRule: Rule;
};

export type Palette = {
  ink: string; math: string; grey: string; pale: string; rule: string;
  bandMath: string; mark: string; bandMark: string;
};

export const NAVY = '1B2A4A';
export const ORANGE = 'E08A3A';
const GREY = '6E7A8E';
const PALE = 'C8D0DE';
const RULE = 'BEC6D2';
const WHITE = 'FFFFFF';
const INK_MONO = '1A1A1A';
const TEAL = '0E8A7D';
const GREEN = '2E9A58';
const BLUE = '1F74D6';
export const BURGUNDY = '7A1F3D';
/** What every colour on a black-and-white sheet drains to. */
export const MONO_DRAIN = '404040';

export const PALETTE_COLOUR: Palette = { ink: NAVY, math: ORANGE, grey: GREY, pale: PALE, rule: RULE, bandMath: ORANGE, mark: 'mark_navy.png', bandMark: 'mark_white.png' };
export const PALETTE_MONO: Palette = { ink: INK_MONO, math: '808080', grey: '666666', pale: 'BFBFBF', rule: 'BFBFBF', bandMath: 'A6A6A6', mark: 'mark_outline.png', bandMark: 'mark_white.png' };

const single = (sz: number, color: string): Rule => ({ style: 'single', sz, color });

export const SERIES: Record<BrandSeries, SeriesDesign> = {
  AM: { tag: 'A MATH', style: 'band', ground: NAVY, frame: [], accent: ORANGE, block: ORANGE, tagInk: NAVY, titleBar: ORANGE, blockRules: null, runRule: single(8, ORANGE) },
  EM: { tag: 'E MATH', style: 'plain', ground: null, frame: [{ side: 'bottom', ...single(18, TEAL) }], accent: TEAL, block: TEAL, tagInk: WHITE, titleBar: null, blockRules: null, runRule: single(8, TEAL) },
  S1: { tag: 'SEC 1', style: 'tint', ground: 'E9F5ED', frame: [], accent: GREEN, block: GREEN, tagInk: WHITE, titleBar: GREEN, blockRules: null, runRule: single(8, GREEN) },
  S2: { tag: 'SEC 2', style: 'bar', ground: null, frame: [{ side: 'top', ...single(36, BLUE) }], accent: BLUE, block: BLUE, tagInk: WHITE, titleBar: null, blockRules: null, runRule: single(8, BLUE) },
  // JC (9 Oct 2026): the one series with a VERTICAL element — a thick burgundy
  // bar down the left edge of the masthead, white header, burgundy block and
  // PRACTICE, a burgundy bar beside the title. Older students, a darker colour.
  JC: { tag: 'JC H2', style: 'edge', ground: null, frame: [{ side: 'left', ...single(36, BURGUNDY) }], accent: BURGUNDY, block: BURGUNDY, tagInk: WHITE, titleBar: BURGUNDY, blockRules: null, runRule: single(8, BURGUNDY) },
};

export const SERIES_MONO: Record<BrandSeries, SeriesDesign> = {
  AM: { tag: 'A MATH', style: 'plain', ground: null, frame: [{ side: 'top', ...single(24, INK_MONO) }, { side: 'bottom', ...single(6, INK_MONO) }], accent: INK_MONO, block: INK_MONO, tagInk: WHITE, titleBar: INK_MONO, blockRules: null, runRule: single(12, INK_MONO) },
  EM: { tag: 'E MATH', style: 'plain', ground: null, frame: [{ side: 'bottom', ...single(12, INK_MONO) }], accent: INK_MONO, block: null, tagInk: INK_MONO, titleBar: null, blockRules: { top: { style: 'single', sz: 12 }, left: { style: 'single', sz: 12 }, bottom: { style: 'single', sz: 12 }, right: { style: 'single', sz: 12 } }, runRule: { style: 'double', sz: 6, color: INK_MONO } },
  S1: { tag: 'SEC 1', style: 'tint', ground: 'F2F2F2', frame: [], accent: INK_MONO, block: WHITE, tagInk: INK_MONO, titleBar: 'A6A6A6', blockRules: { top: { style: 'double', sz: 6 }, left: { style: 'double', sz: 6 }, bottom: { style: 'double', sz: 6 }, right: { style: 'double', sz: 6 } }, runRule: { style: 'dotted', sz: 12, color: INK_MONO } },
  S2: { tag: 'SEC 2', style: 'bar', ground: null, frame: [{ side: 'top', ...single(36, INK_MONO) }], accent: INK_MONO, block: null, tagInk: INK_MONO, titleBar: null, blockRules: { top: { style: 'single', sz: 18 }, bottom: { style: 'single', sz: 18 } }, runRule: { style: 'dashed', sz: 12, color: INK_MONO } },
  // a thick bar down the left edge; the subject in a box whose left rule is heavy; a thick-thin rule on page 2
  JC: { tag: 'JC H2', style: 'edge', ground: null, frame: [{ side: 'left', ...single(36, INK_MONO) }], accent: INK_MONO, block: null, tagInk: INK_MONO, titleBar: INK_MONO, blockRules: { top: { style: 'single', sz: 6 }, right: { style: 'single', sz: 6 }, bottom: { style: 'single', sz: 6 }, left: { style: 'single', sz: 24 } }, runRule: { style: 'thickThinSmallGap', sz: 12, color: INK_MONO } },
};

/** questions.level (and the /ws level tokens) → series, the small line under the subject block, the level line. */
export const LEVELS: Record<string, [BrandSeries, string, string]> = {
  AM: ['AM', 'SEC 4', 'Sec 4 Additional Mathematics'],
  S3_AM: ['AM', 'SEC 3', 'Sec 3 Additional Mathematics'],
  AM_NA: ['AM', 'SEC 5 N(A)', 'Sec 5 N(A) Additional Mathematics'],
  EM: ['EM', 'SEC 4', 'Sec 4 Mathematics'],
  S3_EM: ['EM', 'SEC 3', 'Sec 3 Mathematics'],
  EM_NA: ['EM', 'SEC 4 N(A)', 'Sec 4 N(A) Mathematics'],
  S3_EM_NA: ['EM', 'SEC 3 N(A)', 'Sec 3 N(A) Mathematics'],
  S3_EM_NT: ['EM', 'SEC 3 N(T)', 'Sec 3 N(T) Mathematics'],
  S1: ['S1', 'MATHEMATICS', 'Sec 1 Mathematics'],
  S2: ['S2', 'MATHEMATICS', 'Sec 2 Mathematics'],
  JC: ['JC', 'H2 MATH', 'JC H2 Mathematics'],
  JC1: ['JC', 'H2 MATH', 'JC1 H2 Mathematics'],
  JC2: ['JC', 'H2 MATH', 'JC2 H2 Mathematics'],
  H2: ['JC', 'H2 MATH', 'JC H2 Mathematics'],
};

export type BrandLevel = { level: string; series: BrandSeries; small: string; levelLine: string };

/** The design for one level; null when no series owns it (the sheet then prints the regular format). */
export function brandLevelInfo(level: string | null | undefined): BrandLevel | null {
  const key = (level ?? '').trim().toUpperCase();
  const hit = LEVELS[key];
  if (!hit) return null;
  return { level: key, series: hit[0], small: hit[1], levelLine: hit[2] };
}

/** The level a sheet of several questions is branded as: the most common
 *  level among them that has a design (ties → the first seen). Null when none has. */
export function brandForLevels(levels: (string | null | undefined)[]): BrandLevel | null {
  const tally = new Map<string, number>();
  for (const l of levels) {
    const info = brandLevelInfo(l);
    if (info) tally.set(info.level, (tally.get(info.level) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [l, n] of tally) if (best === null || n > (tally.get(best) ?? 0)) best = l;
  return best ? brandLevelInfo(best) : null;
}

export function brandDesign(series: BrandSeries, mode: BrandPrint): { cfg: SeriesDesign; k: Palette } {
  return mode === 'mono' ? { cfg: SERIES_MONO[series], k: PALETTE_MONO } : { cfg: SERIES[series], k: PALETTE_COLOUR };
}

/** The small line in the running header: "Sec 4", "Sec 3 N(A)" — none for the plain Mathematics series. */
export function runningSmall(small: string): string | null {
  if (small === 'MATHEMATICS') return null;
  return small.split(' ').map((w) => (/^N\([AT]\)$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');
}

/** "3 questions   ·   12 marks" — the bits after PRACTICE. */
export function practiceBits(n: number | null, marks: number | null): string[] {
  const bits: string[] = [];
  if (n) bits.push(`${n} question${n === 1 ? '' : 's'}`);
  if (marks) bits.push(`${marks} marks`);
  return bits;
}

/** The remembered switch position in this browser; 'off' when nothing is stored. */
export function readBrandMode(key: string): BrandMode {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return isBrandMode(v) ? v : 'off';
  } catch { return 'off'; }
}
export function storeBrandMode(key: string, mode: BrandMode): void {
  try { localStorage.setItem(key, mode); } catch { /* private window */ }
}
