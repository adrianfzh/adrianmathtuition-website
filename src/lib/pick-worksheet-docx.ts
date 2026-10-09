// The worksheet picker's DOCX — the create-worksheet skill's house file
// (worksheet_lib.py) built in the browser with native Word equations:
// Times New Roman 9.5 pt, A4 with 2 / 1 / 2.5 / 2.5 cm margins, 1.5 line
// spacing, a 12 pt navy centred title and a 10 pt italic subtitle, questions
// auto-numbered "1." with parts "(a)" that restart per question, marks on a
// right tab at 15.5 cm, blank working lines under each marked part (4 a mark,
// one more for a [1]), figures centred under the text they belong to, and ONE
// orange right-aligned [Ans: …] line at the end of each question.
//
// Browser-only: the OMML pipeline (lib/lesson-docx.ts) needs KaTeX's DOM output
// and JSZip. The PDF twin of this file is lib/render-bot-worksheet.ts in its
// `plain` style; both read the same lib/pick-worksheet model.
'use client';

import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, TabStopType,
  convertMillimetersToTwip, LevelFormat, LevelSuffix,
} from 'docx';
import { splitMathInline, latexToOMML, OmmlRegistry, injectOmmlIntoDocxBuffer } from './lesson-docx';
import { ansLine, flatParts, workingLines, joinMultilineMath, type PickQuestion } from './pick-worksheet';

const NAVY = '1F4E79';
const ANSWER_ORANGE = '843C0C';
const MARKS_TAB = convertMillimetersToTwip(155);
const BODY_HALF_PT = 19;              // 9.5 pt
const LINE_1_5 = 360;                 // 1.5 lines (240 = single)
const Q_TEXT_INDENT = convertMillimetersToTwip(10);   // "1." at the margin, text at 1.0 cm
const P_TEXT_INDENT = convertMillimetersToTwip(20);   // "(a)" at 1.0 cm, text at 2.0 cm
const RIGHT_INDENT = convertMillimetersToTwip(14);  // a full last line still leaves the marks their tab (worksheet_lib)
const FIG_MAX_PX = 302;               // 8 cm at 96 dpi (paper-layout rule: figures print small)
const FIG_WIDE_PX = 378;              // 10 cm for a wide figure (aspect ≥ 1.5)

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

function naturalSize(buf: ArrayBuffer, mime: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(new Blob([buf], { type: mime }));
      const img = new Image();
      img.onload = () => { const w = img.naturalWidth || 320; const h = img.naturalHeight || 220; URL.revokeObjectURL(url); resolve({ w, h }); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ w: 320, h: 220 }); };
      img.src = url;
    } catch { resolve({ w: 320, h: 220 }); }
  });
}

async function figurePara(url: string): Promise<Paragraph> {
  try {
    let res = await fetch(url);
    if (!res.ok || res.type === 'opaque') res = await fetch(url + (url.includes('?') ? '&' : '?') + 'docx=1', { mode: 'cors', cache: 'reload' });
    if (!res.ok) throw new Error(String(res.status));
    const mime = res.headers.get('content-type') || 'image/png';
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error('empty');
    const { w, h } = await naturalSize(buf, mime);
    const cap = w / h >= 1.5 ? FIG_WIDE_PX : FIG_MAX_PX;
    const scale = Math.min(1, cap / w, FIG_MAX_PX / h);
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80, line: 240 },
      keepNext: true,
      children: [new ImageRun({ data: buf, transformation: { width: Math.round(w * scale), height: Math.round(h * scale) } } as ConstructorParameters<typeof ImageRun>[0])],
    });
  } catch {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `[figure unavailable: ${url.split('/').pop() ?? url}]`, italics: true, color: '999999' })],
    });
  }
}

function blankLines(n: number): Paragraph[] {
  // The part is the unit (ADRIAN-STYLE.md §5): a part's text and ALL its working
  // lines travel together, so a page end never cuts the space in two — 9 Oct
  // 2026, Adrian's H2 vectors sheet: (iii) got 4 of its 12 lines at the foot of
  // one page and 8 at the top of the next, and (iv) sat mid-page under them.
  // Only the last blank line is free, or every part would chain into one block.
  // A part taller than a page still splits — Word ignores keepNext it cannot honour.
  return Array.from({ length: n }, (_, i) => new Paragraph({
    spacing: { line: LINE_1_5, before: 0, after: 0 },
    keepNext: i < n - 1,
    children: [new TextRun({ text: '' })],
  }));
}

export async function buildPickWorksheetDocx(input: { title: string; subtitle: string; questions: PickQuestion[]; workingSpace?: boolean }): Promise<Blob> {
  const { title, subtitle, questions, workingSpace = true } = input;
  const reg = new OmmlRegistry();
  const body: Paragraph[] = [];

  body.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: LINE_1_5 },
    children: [new TextRun({ text: title, bold: true, size: 24, color: NAVY })],
  }));
  if (subtitle.trim()) {
    body.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: LINE_1_5, after: 120 },
      children: [new TextRun({ text: subtitle.trim(), italics: true, size: 20 })],
    }));
  }

  // One Word auto-list for the question numbers "1." "2." … (renumbers when a
  // question is cut in Word); parts print their bank labels as text.
  const numbering: { reference: string; levels: { level: number; format: typeof LevelFormat[keyof typeof LevelFormat]; text: string; alignment: typeof AlignmentType[keyof typeof AlignmentType]; suffix: typeof LevelSuffix[keyof typeof LevelSuffix]; style: { paragraph: { indent: { left: number; hanging: number } } } }[] }[] = [
    { reference: 'q', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, suffix: LevelSuffix.TAB, style: { paragraph: { indent: { left: Q_TEXT_INDENT, hanging: Q_TEXT_INDENT } } } }] },
  ];

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];

    const stemLines = q.stem ? q.stem.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean) : [];
    const hasParts = q.parts.length > 0;
    const stemMarks = !hasParts && q.marks ? q.marks : null;
    // "1." carries the first stem paragraph (or the first part when the stem is empty).
    // With working space, every question after the first starts on a fresh page,
    // the way the GCE papers are set (Adrian, 9 Oct 2026: "do it like how gce
    // papers give working spaces — the working spaces and questions don't
    // straddle across pages"): the slack lands at the foot of the page before,
    // never inside a part. A compact sheet (no space) flows on.
    body.push(new Paragraph({
      numbering: { reference: 'q', level: 0 },
      indent: { right: RIGHT_INDENT },
      spacing: { line: LINE_1_5, before: qi && !workingSpace ? 120 : 0 },
      pageBreakBefore: workingSpace && qi > 0,
      keepNext: true,
      tabStops: [{ type: TabStopType.RIGHT, position: MARKS_TAB }],
      children: [
        ...runs(stemLines[0] ?? '', reg),
        ...(stemMarks && stemLines.length <= 1 ? [new TextRun({ text: `\t[${stemMarks}]` })] : []),
      ],
    }));
    for (let i = 1; i < stemLines.length; i++) {
      body.push(new Paragraph({
        indent: { left: Q_TEXT_INDENT, right: RIGHT_INDENT },
        spacing: { line: LINE_1_5 },
        keepNext: true,
        tabStops: [{ type: TabStopType.RIGHT, position: MARKS_TAB }],
        children: [...runs(stemLines[i], reg), ...(stemMarks && i === stemLines.length - 1 ? [new TextRun({ text: `\t[${stemMarks}]` })] : [])],
      }));
    }
    for (const u of q.images) body.push(await figurePara(u));
    if (!hasParts && workingSpace) body.push(...blankLines(workingLines(q.marks)));

    // Parts. Sub-parts print as "(b)(i)" text labels under the same list
    // indent — a nested Word list per question is more than the sheet needs.
    const flat = flatParts(q.parts);
    for (const { labels, part, depth } of flat) {
      for (const u of part.imagesBefore) body.push(await figurePara(u));
      if (part.text || part.marks) {
        const marksRun = part.marks ? [new TextRun({ text: `\t[${part.marks}]` })] : [];
        // The bank's own label — (i), (a), (b)(ii) — printed as text so it can
        // never disagree with the [Ans:] line (a Word auto-list would say (a)
        // under a question whose parts are (i), (ii)). Hanging indent: the
        // label sits at 1.0 cm, the text at 2.0 cm (+0.8 cm per sub-level).
        const left = P_TEXT_INDENT + depth * convertMillimetersToTwip(8);
        body.push(new Paragraph({
          indent: { left, hanging: left - Q_TEXT_INDENT - depth * convertMillimetersToTwip(8), right: RIGHT_INDENT },
          spacing: { line: LINE_1_5 },
          keepNext: true,
          tabStops: [{ type: TabStopType.LEFT, position: left }, { type: TabStopType.RIGHT, position: MARKS_TAB }],
          children: [new TextRun({ text: `(${labels[labels.length - 1]})\t` }), ...runs(part.text, reg), ...marksRun],
        }));
      }
      for (const u of part.imagesAfter) body.push(await figurePara(u));
      if (workingSpace) body.push(...blankLines(workingLines(part.marks)));
    }

    const ans = ansLine(q);
    if (ans) {
      body.push(new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { line: LINE_1_5, after: 60 },
        children: [
          new TextRun({ text: '[Ans: ', color: ANSWER_ORANGE }),
          ...runs(ans, reg, { color: ANSWER_ORANGE }),
          new TextRun({ text: ']', color: ANSWER_ORANGE }),
        ],
      }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { size: BODY_HALF_PT, font: 'Times New Roman' } } } },
    numbering: { config: numbering },
    sections: [{
      properties: { page: {
        size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
        margin: { top: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(10), left: convertMillimetersToTwip(25), right: convertMillimetersToTwip(25) },
      } },
      children: body,
    }],
  });
  const blob = await Packer.toBlob(doc);
  return injectOmmlIntoDocxBuffer(await blob.arrayBuffer(), reg.entries);
}
