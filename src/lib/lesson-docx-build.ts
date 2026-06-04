// Build a lesson .docx that mirrors the Generate-PDF layout, with native Word (OMML) equations.
// Browser-only (uses the OMML pipeline in lesson-docx.ts which needs KaTeX DOM + JSZip).
//
// Layout: cover (name/level/topics) → sections in order (refresher / worked example / practice
// with writing space) → "Practice — Solutions" collected at the back. Card images embedded.
'use client';

import {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, BorderStyle,
} from 'docx';
import { splitMathInline, latexToOMML, OmmlRegistry, injectOmmlIntoDocxBuffer } from './lesson-docx';

export type DocxLesson = { name: string; level: string; description?: string | null; topics?: string[]; section_order?: string[] };
export type DocxCard = {
  id: string; content_kind: 'refresher' | 'worked_example' | 'practice';
  section_name: string; card_title: string | null; content: string | null; marks: number | null; is_advanced?: boolean; order_index: number;
};

const ANSWER_BROWN = '843C0C';

// Pull <img src="…"> URLs out of a content block and return [textWithoutImgTags, urls].
function extractImages(md: string): { text: string; urls: string[] } {
  const urls: string[] = [];
  const text = md.replace(/<img\b[^>]*?src="([^"]+)"[^>]*>/gi, (_m, u: string) => { urls.push(u); return ''; });
  return { text, urls };
}

// Inline markdown (bold **…**) + math ($…$) → docx TextRuns. Math becomes a placeholder TextRun
// whose text is later swapped for OMML by injectOmmlIntoDocxBuffer.
function inlineRuns(text: string, reg: OmmlRegistry, opts: { color?: string; bold?: boolean } = {}): TextRun[] {
  const runs: TextRun[] = [];
  for (const part of splitMathInline(text)) {
    if (part.type === 'math') {
      const omml = latexToOMML(part.value, { displayMode: part.displayMode, color: opts.color ?? null });
      runs.push(new TextRun({ text: reg.token(omml), color: opts.color }));
    } else {
      // Split on **bold** spans.
      const segs = part.value.split(/(\*\*[^*]+\*\*)/g);
      for (const seg of segs) {
        if (!seg) continue;
        const b = /^\*\*([^*]+)\*\*$/.exec(seg);
        runs.push(new TextRun({ text: b ? b[1] : seg, bold: opts.bold || !!b, color: opts.color }));
      }
    }
  }
  return runs;
}

async function fetchImagePara(url: string): Promise<Paragraph | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') || 'image/png';
    const buf = await res.arrayBuffer();
    // Read the image's natural dimensions so we keep its aspect ratio (docx needs explicit px).
    const { w, h } = await naturalSize(buf, mime);
    const MAX_W = 360;
    const scale = w > MAX_W ? MAX_W / w : 1;
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    return new Paragraph({
      children: [new ImageRun({ data: buf, transformation: { width, height } } as ConstructorParameters<typeof ImageRun>[0])],
    });
  } catch { return null; }
}

// Decode an image blob just enough to read its intrinsic width/height (browser-only).
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

// Render one content block (markdown paragraphs) into docx Paragraphs, fetching any images.
async function contentParagraphs(content: string | null, reg: OmmlRegistry, opts: { color?: string } = {}): Promise<Paragraph[]> {
  const out: Paragraph[] = [];
  const { text, urls } = extractImages(content ?? '');
  const blocks = text.split(/\n\n+/).map(b => b.trim()).filter(Boolean);
  for (const b of blocks) {
    if (b === '---') continue;
    out.push(new Paragraph({ children: inlineRuns(b.replace(/\n/g, ' '), reg, opts), spacing: { after: 120 } }));
  }
  for (const u of urls) {
    const p = await fetchImagePara(u);
    if (p) out.push(p);
  }
  return out;
}

export async function buildLessonDocx(lesson: DocxLesson, cards: DocxCard[]): Promise<Blob> {
  const reg = new OmmlRegistry();

  // Section order (saved order first, then any new sections alphabetical).
  const order = Array.isArray(lesson.section_order) ? lesson.section_order : [];
  const all = [...new Set(cards.map(c => c.section_name || 'Default'))];
  const known = order.filter(s => all.includes(s));
  const sections = [...known, ...all.filter(s => !known.includes(s)).sort()];
  // Advanced practice sinks below regular cards within its section.
  const advRank = (c: DocxCard) => (c.content_kind === 'practice' && c.is_advanced ? 1 : 0);
  const cardsOf = (sec: string) => cards
    .filter(c => (c.section_name || 'Default') === sec)
    .sort((a, b) => (advRank(a) - advRank(b)) || (a.order_index - b.order_index));

  const practiceOrdered = sections.flatMap(sec => cardsOf(sec).filter(c => c.content_kind === 'practice'));
  const practiceNum = new Map<string, number>();
  practiceOrdered.forEach((c, i) => practiceNum.set(c.id, i + 1));

  const body: Paragraph[] = [];

  // Cover
  body.push(new Paragraph({ text: lesson.name, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 120 } }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: lesson.level, bold: true })] }));
  if (lesson.description) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: lesson.description, italics: true })] }));
  if (lesson.topics?.length) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'Topics: ' + lesson.topics.join(' · '), size: 20, color: '666666' })] }));

  // Sections
  for (const sec of sections) {
    body.push(new Paragraph({ text: sec, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, border: { bottom: { color: '1F2937', size: 8, style: BorderStyle.SINGLE, space: 2 } } }));
    const secCards = cardsOf(sec);
    const firstAdvIdx = secCards.findIndex(c => c.content_kind === 'practice' && c.is_advanced);
    for (let ci = 0; ci < secCards.length; ci++) {
      const c = secCards[ci];
      if (ci === firstAdvIdx) {
        body.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: 'Advanced practice', bold: true, color: 'B45309' })] }));
      }
      if (c.content_kind === 'refresher') {
        if (c.card_title) body.push(new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: c.card_title, bold: true })] }));
        for (const p of await contentParagraphs(c.content, reg)) body.push(p);
      } else if (c.content_kind === 'practice') {
        const n = practiceNum.get(c.id) ?? 0;
        body.push(new Paragraph({
          spacing: { before: 160 },
          children: [new TextRun({ text: `${n}. `, bold: true }), ...inlineRuns(c.card_title ?? '', reg, { bold: true }), ...(c.marks ? [new TextRun({ text: `   [${c.marks}]`, bold: true, color: '6B7280' })] : [])],
        }));
        for (const p of await contentParagraphs(c.content, reg)) body.push(p);
        // Writing space ~ marks lines (min 3, cap 12).
        const lines = Math.min(12, Math.max(3, c.marks ?? 3));
        for (let i = 0; i < lines; i++) {
          body.push(new Paragraph({ spacing: { after: 60 }, border: { bottom: { color: '9CA3AF', size: 4, style: BorderStyle.DASHED, space: 1 } }, children: [new TextRun({ text: '' })] }));
        }
      } else {
        // worked example
        body.push(new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: c.card_title ?? 'Worked example', bold: true, color: '1D4ED8' })] }));
        for (const p of await contentParagraphs(c.content, reg)) body.push(p);
      }
    }
  }

  // Practice solutions at the back
  if (practiceOrdered.length > 0) {
    body.push(new Paragraph({ text: 'Practice — Solutions', heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { after: 120 } }));
    for (const c of practiceOrdered) {
      body.push(new Paragraph({ spacing: { before: 120 }, children: [
        new TextRun({ text: `${practiceNum.get(c.id)}. `, bold: true }),
        ...inlineRuns(c.card_title ?? '', reg, { bold: true }),
        ...(c.is_advanced ? [new TextRun({ text: '  [Advanced]', bold: true, color: 'B45309' })] : []),
      ] }));
      for (const p of await contentParagraphs(c.content, reg, { color: ANSWER_BROWN })) body.push(p);
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children: body }],
  });
  const blob = await Packer.toBlob(doc);
  const arrayBuffer = await blob.arrayBuffer();
  return injectOmmlIntoDocxBuffer(arrayBuffer, reg.entries);
}
