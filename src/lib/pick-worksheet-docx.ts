// The worksheet picker's DOCX — the create-worksheet skill's house file
// (.claude/skills/create-worksheet/worksheet_lib.py) built in the browser with
// native Word equations. Measured against that file line for line (9 Oct 2026,
// Adrian: one kitchen per job, and the picker's Word file matching the Python
// house style):
//   page      A4, margins top 2 / bottom 1 / left 2.5 / right 2.5 cm
//   body      Times New Roman 9.5 pt, 1.5 line spacing, no space before/after
//   title     12 pt bold navy 1F4E79, centred, 6 pt after
//   subtitle  10 pt italic, centred, 8 pt after
//   "1."      real Word numbering, number at the margin, text at 1.0 cm
//   "(a)"     real Word numbering under the question's TEXT: label at 1.0 cm,
//             text at 2.0 cm; a sub-part "(i)" one tab further (2.0 / 3.0 cm);
//             a question with no stem puts "(a)" on the number's own line
//   marks     "\t[n]" on a right tab at 15.5 cm; a marked paragraph stops
//             1.4 cm short of the right edge so the tab is never eaten
//   space     real blank lines under each marked paragraph, 4 a mark and one
//             more for a [1]; the part and ALL its lines travel together
//             (ac56ad3b, Adrian 9 Oct 2026: a part's space was cut across a
//             page end — the part is the unit, ADRIAN-STYLE.md §5; the Python
//             library still glues only the first two lines)
//   figures   centred, 4 pt above and below, trimmed to the ink, at most
//             10.5 cm wide and 8 cm tall, never upscaled; glued to the text
//             either side
//   [Ans: …]  ONE orange (843C0C) right-aligned line at the end of each
//             question, glued to the line above it
//   pages     with working space, every question after the first starts on
//             a fresh page — the GCE paper's rule (4375f32f, Adrian 9 Oct
//             2026); a compact sheet flows on. The Python library does not.
// Unit tests on the document.xml: lib/pick-worksheet-docx.test.ts.
//
// Browser-only: the OMML pipeline (lib/lesson-docx.ts) needs KaTeX's DOM output
// and JSZip. The PDF twin of this file is lib/render-bot-worksheet.ts; both read
// the same lib/pick-worksheet model.
'use client';

import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, TabStopType,
  LevelFormat, LevelSuffix, Tab, type IParagraphOptions,
} from 'docx';
import { splitMathInline, latexToOMML, OmmlRegistry, injectOmmlIntoDocxBuffer, blobToArrayBuffer } from './lesson-docx';
import { ansLine, flatParts, workingLines, joinMultilineMath, type PickQuestion, type PickPart } from './pick-worksheet';

const NAVY = '1F4E79';
const ANSWER_ORANGE = '843C0C';
/** cm → twips the way python-docx's Cm() rounds (through EMU): 15.5 cm = 8787, 2.5 cm = 1417. */
const CM = (cm: number) => Math.round(cm * 360000 / 635);
export const LAYOUT = {
  marksTab: CM(15.5),        // 8787
  marksRightIndent: CM(1.4), // 794
  qText: CM(1.0),            // 567 — "1." at the margin, text here
  partText: CM(2.0),         // 1134 — "(a)" at 1.0 cm, text here
  subText: CM(3.0),          // 1701 — "(i)" at 2.0 cm, text here
  bodyHalfPt: 19,            // 9.5 pt
  line: 360,                 // 1.5 lines
  figMaxCm: 10.5,
  figMaxHeightCm: 8.0,
  figPadPx: 6,               // trim_to_ink pad_in=0.06 at 96 dpi
} as const;

/** Inline markdown (bold) + $…$ maths → runs; maths becomes an OMML token. */
function runs(text: string, reg: OmmlRegistry, opts: { color?: string; bold?: boolean; italics?: boolean } = {}): TextRun[] {
  const out: TextRun[] = [];
  const src = joinMultilineMath(text).replace(/\s*\n\s*/g, ' ');
  for (const part of splitMathInline(src)) {
    if (part.type === 'math') {
      const omml = latexToOMML(part.value, { displayMode: false, color: opts.color ?? null });
      out.push(new TextRun({ text: reg.token(omml), color: opts.color }));
    } else {
      for (const seg of part.value.split(/(\*\*[^*]+\*\*)/g)) {
        if (!seg) continue;
        const b = /^\*\*([^*]+)\*\*$/.exec(seg);
        out.push(new TextRun({ text: b ? b[1] : seg, bold: opts.bold || !!b, italics: opts.italics, color: opts.color }));
      }
    }
  }
  return out;
}

// ── figures ──────────────────────────────────────────────────────────────

/** Pixel size from a PNG / JPEG / GIF header — no decoder, so it works in a
 *  test runner too. Null when the bytes are not one of those. */
export function imageSize(buf: ArrayBuffer): { w: number; h: number } | null {
  const b = new DataView(buf);
  if (buf.byteLength >= 24 && b.getUint32(0) === 0x89504e47) return { w: b.getUint32(16), h: b.getUint32(20) };
  if (buf.byteLength >= 10 && b.getUint8(0) === 0x47 && b.getUint8(1) === 0x49) return { w: b.getUint16(6, true), h: b.getUint16(8, true) };
  if (buf.byteLength >= 4 && b.getUint16(0) === 0xffd8) {
    let i = 2;
    while (i + 9 < buf.byteLength) {
      if (b.getUint8(i) !== 0xff) { i++; continue; }
      const marker = b.getUint8(i + 1);
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = b.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: b.getUint16(i + 5), w: b.getUint16(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** The printed width of a figure, in cm — worksheet_lib._picture over the bank
 *  builders' fig_cm: never wider than 10.5 cm, never taller than 8 cm, never
 *  upscaled past its natural 96-dpi size. */
export function figureWidthCm(wPx: number, hPx: number): number {
  const natural = wPx / 96 * 2.54;
  let w = Math.min(LAYOUT.figMaxCm, natural);
  const h = w * hPx / wPx;
  if (h > LAYOUT.figMaxHeightCm) w *= LAYOUT.figMaxHeightCm / h;
  return Math.round(w * 100) / 100;
}

/** Trim a PNG's white border in the browser (worksheet_lib trim_to_ink): the
 *  drawing keeps the size it was going to print at, only the border goes.
 *  Returns the new bytes with the ink's share of the old width, or null when
 *  there is no canvas (a test runner) or the pixels cannot be read. */
async function trimToInk(buf: ArrayBuffer, mime: string, size: { w: number; h: number }): Promise<{ buf: ArrayBuffer; keep: number } | null> {
  try {
    if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const bmp = await createImageBitmap(new Blob([buf], { type: mime }));
    canvas.width = size.w; canvas.height = size.h;
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, size.w, size.h);
    let x0 = size.w, y0 = size.h, x1 = -1, y1 = -1;
    for (let y = 0; y < size.h; y++) {
      for (let x = 0; x < size.w; x++) {
        const i = (y * size.w + x) * 4;
        const ink = data[i + 3] > 10 && (255 - data[i] > 10 || 255 - data[i + 1] > 10 || 255 - data[i + 2] > 10);
        if (ink) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) return null;
    const pad = LAYOUT.figPadPx;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(size.w - 1, x1 + pad); y1 = Math.min(size.h - 1, y1 + pad);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w >= size.w - 1 && h >= size.h - 1) return null;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => out.toBlob(r, 'image/png'));
    if (!blob) return null;
    return { buf: await blobToArrayBuffer(blob), keep: w / size.w };
  } catch { return null; }
}

async function figureBytes(url: string): Promise<{ buf: ArrayBuffer; mime: string }> {
  let res = await fetch(url);
  if (!res.ok || res.type === 'opaque') res = await fetch(url + (url.includes('?') ? '&' : '?') + 'docx=1', { mode: 'cors', cache: 'reload' });
  if (!res.ok) throw new Error(String(res.status));
  const mime = res.headers.get('content-type') || 'image/png';
  const buf = await res.arrayBuffer();
  if (!buf.byteLength) throw new Error('empty');
  return { buf, mime };
}

async function figurePara(url: string): Promise<IParagraphOptions> {
  try {
    let { buf, mime } = await figureBytes(url);
    let size = imageSize(buf) ?? { w: 320, h: 220 };
    let widthCm = figureWidthCm(size.w, size.h);
    const trimmed = await trimToInk(buf, mime, size);
    if (trimmed) {
      widthCm = Math.round(widthCm * trimmed.keep * 100) / 100;
      buf = trimmed.buf;
      size = imageSize(buf) ?? size;
    }
    const wPx = Math.round(widthCm / 2.54 * 96);
    const hPx = Math.round(wPx * size.h / size.w);
    return {
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80, line: LAYOUT.line },
      keepNext: true,
      children: [new ImageRun({ data: buf, transformation: { width: wPx, height: hPx } } as ConstructorParameters<typeof ImageRun>[0])],
    };
  } catch {
    return {
      alignment: AlignmentType.CENTER,
      spacing: { line: LAYOUT.line },
      children: [new TextRun({ text: `[figure unavailable: ${url.split('/').pop() ?? url}]`, italics: true, color: '999999' })],
    };
  }
}

// ── numbering ────────────────────────────────────────────────────────────

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ROMANS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];

/** Real Word numbering is only safe when the bank's labels ARE the sequence
 *  Word would print — (a)(b)(c) or (i)(ii)(iii) from the first label on. A
 *  gap or an odd label ("(b)(2)") falls back to typed labels for that group. */
export function labelFormat(labels: string[]): 'letter' | 'roman' | null {
  if (!labels.length) return null;
  const low = labels.map((l) => l.toLowerCase());
  if (low.every((l, i) => l === ROMANS[i])) return 'roman';
  if (low.every((l, i) => l === LETTERS[i])) return 'letter';
  return null;
}

type NumberingEntry = NonNullable<ConstructorParameters<typeof Document>[0]['numbering']>['config'][number];

/** A list that restarts at `start` with the house indents for its depth. */
function listLevel(reference: string, fmt: 'letter' | 'roman', depth: number, start: number) {
  const left = depth === 0 ? LAYOUT.partText : LAYOUT.subText;
  return {
    reference,
    levels: [{
      level: 0,
      format: fmt === 'roman' ? LevelFormat.LOWER_ROMAN : LevelFormat.LOWER_LETTER,
      text: '(%1)',
      alignment: AlignmentType.LEFT,
      suffix: LevelSuffix.TAB,
      start,
      style: { paragraph: { indent: { left, hanging: CM(1.0) } } },
    }],
  };
}

type Item = IParagraphOptions & { keepNext?: boolean };

export async function buildPickWorksheetDocx(input: { title: string; subtitle: string; questions: PickQuestion[]; workingSpace?: boolean }): Promise<Blob> {
  const { title, subtitle, questions, workingSpace = true } = input;
  const reg = new OmmlRegistry();
  const items: Item[] = [];
  const numbering: NumberingEntry[] = [
    { reference: 'q', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, suffix: LevelSuffix.TAB, style: { paragraph: { indent: { left: LAYOUT.qText, hanging: LAYOUT.qText } } } }] },
  ];
  const last = () => items[items.length - 1];
  const glue = () => { if (items.length) last().keepNext = true; };   // worksheet_lib keep_with_next on the paragraph just written

  const marksTab = { type: TabStopType.RIGHT, position: LAYOUT.marksTab };
  // a real <w:tab/> before "[n]", as python-docx writes it
  const marksRun = (m: number | null) => (m ? [new TextRun({ children: [new Tab(), `[${m}]`] })] : []);

  /** worksheet_lib workspace(): real blank lines (Word discards a big
   *  space_after at a page break). The part's text and every line but the
   *  last keep together, so a page end never cuts a part's space in two. */
  const workspace = (marks: number | null) => {
    const n = workingSpace ? workingLines(marks) : 0;
    if (n <= 0) return;
    glue();
    for (let i = 0; i < n; i++) {
      items.push({ spacing: { line: LAYOUT.line, before: 0, after: 0 }, keepNext: i < n - 1, children: [new TextRun({ text: '' })] });
    }
  };
  const figure = async (url: string) => {
    glue();                                   // a figure keeps with the stem above …
    items.push(await figurePara(url));        // … and with the part below (keepNext inside)
  };

  items.push({ alignment: AlignmentType.CENTER, spacing: { line: LAYOUT.line, after: 120 }, children: [new TextRun({ text: title, bold: true, size: 24, color: NAVY })] });
  if (subtitle.trim()) {
    items.push({ alignment: AlignmentType.CENTER, spacing: { line: LAYOUT.line, after: 160 }, children: [new TextRun({ text: subtitle.trim(), italics: true, size: 20 })] });
  }

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const stemLines = q.stem ? q.stem.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean) : [];
    const hasParts = q.parts.length > 0;
    const stemMarks = !hasParts && q.marks ? q.marks : null;
    const flat = flatParts(q.parts);
    // A question with no stem puts its first part on the number's own line —
    // "1.  (a) Find …" — unless a figure prints between the number and the parts.
    const stemless = !stemLines.length && hasParts && !q.images.length && !flat[0].part.imagesBefore.length;

    // every later question on a fresh page when there is working space (GCE rule)
    const freshPage = workingSpace && qi > 0 ? { pageBreakBefore: true } : {};
    if (!stemless) {
      items.push({
        ...freshPage,
        numbering: { reference: 'q', level: 0 },
        spacing: { line: LAYOUT.line },
        ...(stemMarks && stemLines.length <= 1 ? { indent: { right: LAYOUT.marksRightIndent }, tabStops: [marksTab] } : {}),
        children: [...runs(stemLines[0] ?? '', reg), ...(stemMarks && stemLines.length <= 1 ? marksRun(stemMarks) : [])],
      });
      for (let i = 1; i < stemLines.length; i++) {
        const lastLine = i === stemLines.length - 1;
        items.push({
          indent: { left: LAYOUT.qText, ...(stemMarks && lastLine ? { right: LAYOUT.marksRightIndent } : {}) },
          spacing: { line: LAYOUT.line },
          ...(stemMarks && lastLine ? { tabStops: [marksTab] } : {}),
          children: [...runs(stemLines[i], reg), ...(stemMarks && lastLine ? marksRun(stemMarks) : [])],
        });
      }
      if (stemMarks) workspace(stemMarks);
      for (const u of q.images) await figure(u);
    }

    // Parts: real Word numbering per sibling group (restarts per question and
    // per parent part), typed labels when the bank's labels are not a sequence.
    const groupRef = new Map<PickPart[], string | null>();
    const groupFmt = (siblings: PickPart[], depth: number, path: string, startAt: number) => {
      if (groupRef.has(siblings)) return groupRef.get(siblings)!;
      const fmt = labelFormat(siblings.map((p) => p.label));
      let ref: string | null = null;
      if (fmt) {
        ref = `p${qi}-${path}`;
        numbering.push(listLevel(ref, fmt, depth, startAt));
      }
      groupRef.set(siblings, ref);
      return ref;
    };
    const siblingsOf = (labels: string[]): PickPart[] => {
      let list = q.parts;
      for (let d = 0; d < labels.length - 1; d++) list = list.find((p) => p.label === labels[d])?.subparts ?? [];
      return list;
    };

    for (let pi = 0; pi < flat.length; pi++) {
      const { labels, part, depth } = flat[pi];
      for (const u of part.imagesBefore) await figure(u);
      if (part.text || part.marks) {
        const label = `(${labels[labels.length - 1]})`;
        const siblings = siblingsOf(labels);
        const marked = part.marks ? { indent: { right: LAYOUT.marksRightIndent }, tabStops: [marksTab] } : {};
        if (stemless && pi === 0) {
          // "(a)" typed on the question's line at the parts' label column, its
          // text tabbed to the parts' text column; the list below starts at (b).
          groupFmt(siblings, 0, labels.slice(0, -1).join('.') || 'top', 2);
          items.push({
            ...freshPage,
            numbering: { reference: 'q', level: 0 },
            spacing: { line: LAYOUT.line },
            indent: { left: LAYOUT.partText, hanging: LAYOUT.partText, ...(part.marks ? { right: LAYOUT.marksRightIndent } : {}) },
            tabStops: [{ type: TabStopType.LEFT, position: LAYOUT.qText }, { type: TabStopType.LEFT, position: LAYOUT.partText }, ...(part.marks ? [marksTab] : [])],
            children: [new TextRun({ text: label }), new TextRun({ children: [new Tab()] }), ...runs(part.text, reg), ...marksRun(part.marks)],
          });
        } else {
          const ref = groupFmt(siblings, depth, labels.slice(0, -1).join('.') || 'top', 1);
          const left = depth === 0 ? LAYOUT.partText : LAYOUT.subText;
          items.push(ref
            ? { numbering: { reference: ref, level: 0 }, spacing: { line: LAYOUT.line }, ...marked, children: [...runs(part.text, reg), ...marksRun(part.marks)] }
            : {
              indent: { left, hanging: CM(1.0), ...(part.marks ? { right: LAYOUT.marksRightIndent } : {}) },
              spacing: { line: LAYOUT.line },
              tabStops: [{ type: TabStopType.LEFT, position: left }, ...(part.marks ? [marksTab] : [])],
              children: [new TextRun({ children: [label, new Tab()] }), ...runs(part.text, reg), ...marksRun(part.marks)],
            });
        }
        if (part.marks) workspace(part.marks);
      }
      for (const u of part.imagesAfter) await figure(u);
    }

    const ans = ansLine(q);
    if (ans) {
      glue();                                   // [Ans:] never strands at the top of a page
      items.push({
        alignment: AlignmentType.RIGHT,
        spacing: { line: LAYOUT.line },
        children: [
          new TextRun({ text: '[Ans: ', color: ANSWER_ORANGE }),
          ...runs(ans, reg, { color: ANSWER_ORANGE }),
          new TextRun({ text: ']', color: ANSWER_ORANGE }),
        ],
      });
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { size: LAYOUT.bodyHalfPt, font: 'Times New Roman' }, paragraph: { spacing: { line: LAYOUT.line, before: 0, after: 0 } } } } },
    numbering: { config: numbering },
    sections: [{
      properties: { page: {
        size: { width: 11906, height: 16838 },
        margin: { top: CM(2), bottom: CM(1), left: CM(2.5), right: CM(2.5) },
      } },
      children: items.map((o) => new Paragraph(o)),
    }],
  });
  const blob = await Packer.toBlob(doc);
  return injectOmmlIntoDocxBuffer(await blobToArrayBuffer(blob), reg.entries);
}
