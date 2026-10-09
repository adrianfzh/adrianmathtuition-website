// The brand masthead in the picker's Word file — `worksheet_brand.py` ported
// to docx-js, piece for piece (9 Oct 2026). The masthead is a borderless
// four-cell table (logo 2.0 · AdrianMath/TUITION 4.5 · level line 6.1 ·
// subject block 3.4 cm), then the topic in Georgia 19 pt, the PRACTICE line,
// the Name / Date line; the footer "AdrianMath Tuition · adrianmathtuition.com
// | Page x of y" on every page and the running header "AdrianMath · topic |
// SERIES · level" from page 2 (a title page with its own blank header). Which
// colours and rules each series uses is lib/worksheet-brand.ts (SERIES,
// SERIES_MONO); nothing here decides a design.
'use client';

import {
  Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Header, Footer,
  AlignmentType, BorderStyle, WidthType, TableLayoutType, ShadingType, VerticalAlign,
  PageNumber, LineRuleType, type IBorderOptions, type IParagraphOptions,
} from 'docx';
import {
  brandDesign, practiceBits, runningSmall,
  type BrandLevel, type BrandPrint, type Rule, type RuleStyle, type Side, type SeriesDesign, type Palette,
} from './worksheet-brand';

/** cm → twips the way python-docx's Cm() rounds (through EMU). */
const CM = (cm: number) => Math.round(cm * 360000 / 635);
const TEXT_W_CM = 16.0;
const WHITE = 'FFFFFF';
const ARIAL = 'Arial';

const STYLE: Record<RuleStyle, (typeof BorderStyle)[keyof typeof BorderStyle]> = {
  single: BorderStyle.SINGLE, double: BorderStyle.DOUBLE, dotted: BorderStyle.DOTTED,
  dashed: BorderStyle.DASHED, thickThinSmallGap: BorderStyle.THICK_THIN_SMALL_GAP,
};
const NIL: IBorderOptions = { style: BorderStyle.NIL, size: 0, color: 'auto' };
const rule = (r: Rule): IBorderOptions => ({ style: STYLE[r.style], size: r.sz, color: r.color, space: 0 });

/** Table borders: the named sides, every other side nil (worksheet_brand._table_borders). */
function tableBorders(sides: Partial<Record<Side, Rule>>) {
  return {
    top: sides.top ? rule(sides.top) : NIL, bottom: sides.bottom ? rule(sides.bottom) : NIL,
    left: sides.left ? rule(sides.left) : NIL, right: sides.right ? rule(sides.right) : NIL,
    insideHorizontal: NIL, insideVertical: NIL,
  };
}

type RunOpts = { size?: number; bold?: boolean; color?: string; font?: string; spacing?: number };
/** An Arial run; `size` in points, `spacing` in twentieths of a point (w:spacing). */
const run = (text: string, o: RunOpts = {}) => new TextRun({
  text, font: o.font ?? ARIAL, size: Math.round((o.size ?? 9) * 2), bold: o.bold ?? false, color: o.color ?? '000000',
  ...(o.spacing ? { characterSpacing: o.spacing } : {}),
});
/** PAGE / NUMPAGES as a real Word field. */
const field = (which: 'CURRENT' | 'TOTAL_PAGES', o: RunOpts) => new TextRun({
  children: [which === 'CURRENT' ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES],
  font: ARIAL, size: Math.round((o.size ?? 8) * 2), color: o.color ?? '000000',
});

/** A paragraph with no space round it and single line spacing (worksheet_brand._tight). */
function tight(children: TextRun[] | ImageRun[], o: { before?: number; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; rightIndent?: number; border?: IParagraphOptions['border'] } = {}) {
  return new Paragraph({
    spacing: { before: Math.round((o.before ?? 0) * 20), after: Math.round((o.after ?? 0) * 20), line: 240 },
    ...(o.align ? { alignment: o.align } : {}),
    ...(o.rightIndent ? { indent: { right: o.rightIndent } } : {}),
    ...(o.border ? { border: o.border } : {}),
    children,
  });
}

/** The logo's bytes from public/brand/, or null when it cannot be fetched (the masthead then prints without it). */
async function logoBytes(file: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`/brand/${file}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength ? buf : null;
  } catch { return null; }
}

/** The 1.35 cm triangle-A mark as an image run (51 px at 96 dpi). */
function logoRun(buf: ArrayBuffer) {
  const px = Math.round(1.35 / 2.54 * 96);
  return new ImageRun({ data: buf, transformation: { width: px, height: px } } as ConstructorParameters<typeof ImageRun>[0]);
}

function masthead(cfg: SeriesDesign, k: Palette, lv: BrandLevel, logo: ArrayBuffer | null): Table {
  const band = cfg.style === 'band';
  const ground = cfg.ground;
  const pad = ground ? 170 : 110;
  const sideL = ground ? 160 : cfg.style === 'edge' ? 200 : 0;
  const sideR = ground ? 160 : 0;
  const widths = [2.0, 4.5, 6.1, 3.4].map(CM);
  const frame: Partial<Record<Side, Rule>> = {};
  for (const f of cfg.frame) frame[f.side] = f;
  const cell = (children: Paragraph[], w: number, extra: Partial<ConstructorParameters<typeof TableCell>[0]> = {}) => new TableCell({
    children, width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    ...(ground ? { shading: { fill: ground, type: ShadingType.CLEAR, color: 'auto' } } : {}),
    ...extra,
  });

  const logoCell = cell([tight(logo ? [logoRun(logo)] : [])], widths[0]);
  const wordCell = cell([
    tight([run('Adrian', { size: 17, bold: true, color: band ? WHITE : k.ink }), run('Math', { size: 17, bold: true, color: band ? k.bandMath : k.math })]),
    tight([run('TUITION', { size: 7.5, bold: true, color: band ? k.pale : k.grey, spacing: 60 })]),
  ], widths[1]);
  const levelCell = cell([
    tight([run(lv.levelLine, { size: lv.levelLine.length <= 22 ? 10 : 9, bold: true, color: band ? WHITE : k.ink })], { align: AlignmentType.RIGHT, rightIndent: CM(0.35) }),
    tight([run('adrianmathtuition.com', { size: 8, color: band ? k.pale : k.grey })], { align: AlignmentType.RIGHT, rightIndent: CM(0.35) }),
  ], widths[2]);
  const blockBorders: Partial<Record<Side, IBorderOptions>> = {};
  for (const s of ['top', 'left', 'bottom', 'right'] as Side[]) {
    const r = cfg.blockRules?.[s];
    if (r) blockBorders[s] = { style: STYLE[r.style], size: r.sz, color: cfg.tagInk, space: 0 };
  }
  const blockExtra: Partial<ConstructorParameters<typeof TableCell>[0]> = {
    ...(cfg.block ? { shading: { fill: cfg.block, type: ShadingType.CLEAR, color: 'auto' } } : {}),
    ...(cfg.blockRules ? { borders: blockBorders } : {}),
  };
  const blockCell = cell([
    tight([run(cfg.tag, { size: 17, bold: true, color: cfg.tagInk, spacing: 10 })], { align: AlignmentType.CENTER }),
    tight([run(lv.small, { size: 7, bold: true, color: cfg.tagInk, spacing: 40 })], { align: AlignmentType.CENTER }),
  ], widths[3], blockExtra);

  return new Table({
    rows: [new TableRow({ children: [logoCell, wordCell, levelCell, blockCell] })],
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    borders: tableBorders(frame),
    margins: { marginUnitType: WidthType.DXA, top: pad, bottom: pad, left: sideL, right: sideR },
  });
}

function titleBlock(cfg: SeriesDesign, k: Palette, topic: string, subtitle: string, n: number, marks: number | null): Paragraph[] {
  const bar = cfg.titleBar ? { left: { style: BorderStyle.SINGLE, size: 36, space: 8, color: cfg.titleBar } } : undefined;
  const out: Paragraph[] = [];
  out.push(tight([run(topic, { font: 'Georgia', size: 19, bold: true, color: k.ink })], { before: 12, after: 1, border: bar }));
  const bits = practiceBits(n, marks);
  out.push(tight([
    run('PRACTICE', { size: 9, bold: true, color: cfg.accent, spacing: 20 }),
    ...(bits.length ? [run('   ·   ' + bits.join('   ·   '), { size: 9, color: k.grey })] : []),
  ], { after: subtitle ? 1 : 4, border: bar }));
  if (subtitle) out.push(tight([run(subtitle, { size: 9, color: k.grey })], { after: 4, border: bar }));
  out.push(tight([
    run('Name ', { size: 8.5, color: k.grey }), run('_'.repeat(38), { size: 8.5, color: k.rule }),
    run('      Date ', { size: 8.5, color: k.grey }), run('_'.repeat(16), { size: 8.5, color: k.rule }),
  ], { after: 8, border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 6, color: k.rule } } }));
  return out;
}

/** A left/right line in a header or footer: a borderless two-cell table with one
 *  ruled edge, followed by the part's own paragraph kept at 1 pt (worksheet_brand._two_sided). */
function twoSided(left: TextRun[], right: TextRun[], side: 'top' | 'bottom', r: Rule): (Table | Paragraph)[] {
  const widths = [10.5, 5.5].map(CM);
  const tbl = new Table({
    rows: [new TableRow({ children: [
      new TableCell({ children: [tight(left)], width: { size: widths[0], type: WidthType.DXA } }),
      new TableCell({ children: [tight(right, { align: AlignmentType.RIGHT })], width: { size: widths[1], type: WidthType.DXA } }),
    ] })],
    width: { size: CM(TEXT_W_CM), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: tableBorders({ [side]: r }),
    margins: { marginUnitType: WidthType.DXA, top: side === 'top' ? 50 : 0, bottom: side === 'bottom' ? 50 : 0, left: 0, right: 0 },
  });
  const stub = new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: '', size: 2 })] });
  return [tbl, stub];
}

export type BrandDocxParts = {
  /** the masthead table and the title block — the first things in the body */
  top: (Table | Paragraph)[];
  headers: { default: Header; first: Header };
  footers: { default: Footer; first: Footer };
  /** page margins the branded sheet uses (bottom 1.7 cm, header 0.9, footer 0.7) */
  margin: { top: number; bottom: number; left: number; right: number; header: number; footer: number };
};

/** Everything the branded Word file adds round the questions. */
export async function brandDocxParts(mode: BrandPrint, lv: BrandLevel, topic: string, subtitle: string, nQuestions: number, marks: number | null): Promise<BrandDocxParts> {
  const { cfg, k } = brandDesign(lv.series, mode);
  const logo = await logoBytes(cfg.style === 'band' ? k.bandMark : k.mark);
  const top: (Table | Paragraph)[] = [masthead(cfg, k, lv, logo), ...titleBlock(cfg, k, topic, subtitle, nQuestions, marks)];

  const footerLine = () => twoSided(
    [run('AdrianMath Tuition', { size: 8, bold: true, color: k.ink }), run('  ·  adrianmathtuition.com', { size: 8, color: k.grey })],
    [run('Page ', { size: 8, color: k.grey }), field('CURRENT', { size: 8, color: k.grey }), run(' of ', { size: 8, color: k.grey }), field('TOTAL_PAGES', { size: 8, color: k.grey })],
    'top', { style: 'single', sz: 4, color: k.rule },
  );
  const small = runningSmall(lv.small);
  const running = twoSided(
    [run('Adrian', { size: 8, bold: true, color: k.ink }), run('Math', { size: 8, bold: true, color: k.math }), run('  ·  ' + topic, { size: 8, color: k.grey })],
    [run(cfg.tag, { size: 8.5, bold: true, color: cfg.accent, spacing: 10 }), ...(small ? [run('  ·  ' + small, { size: 8, color: k.grey })] : [])],
    'bottom', cfg.runRule,
  );
  return {
    top,
    headers: { default: new Header({ children: running }), first: new Header({ children: [new Paragraph({ children: [] })] }) },
    footers: { default: new Footer({ children: footerLine() }), first: new Footer({ children: footerLine() }) },
    margin: { top: CM(2), bottom: CM(1.7), left: CM(2.5), right: CM(2.5), header: CM(0.9), footer: CM(0.7) },
  };
}
