// Build a lesson .docx that mirrors the Generate-PDF layout, with native Word (OMML) equations.
// Browser-only (uses the OMML pipeline in lesson-docx.ts which needs KaTeX DOM + JSZip).
//
// Layout: cover (name/level/topics) → sections in order (refresher / worked example / practice
// with writing space) → "Practice — Solutions" collected at the back. Card images embedded.
'use client';

import {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, BorderStyle,
  TabStopType, convertMillimetersToTwip, LevelFormat, LevelSuffix,
} from 'docx';
import { splitMathInline, latexToOMML, OmmlRegistry, injectOmmlIntoDocxBuffer } from './lesson-docx';

// Marks right-tab position (15.5 cm from left margin).
const MARKS_TAB = convertMillimetersToTwip(155);

// ── Auto-numbering indents (in TWIPS, 567 ≈ 1 cm — tweak here to taste) ──
// `textIndent` = where the body text starts (Word's "Indent at"); the number sits a `hang` to its
// left (Word's "Aligned at" = textIndent − hang). Values copied from Adrian's house worksheet:
// main "1." number at the margin, text at 0.63 cm; subparts "(i)/(a)" number at 0.63 cm, text 1.26 cm.
const NUM_INDENT = {
  main: { textIndent: 360, hang: 360 }, // "1."  → number @ 0 cm,   text @ 0.63 cm
  sub: { textIndent: 717, hang: 360 },  // "(i)" → number @ 0.63 cm, text @ 1.26 cm
};
// Normalise mark brackets: [2m] / [ 2 m ] → [2].
function normalizeMarks(s: string): string {
  return s.replace(/\[\s*(\d+)\s*m\s*\]/gi, '[$1]');
}

// ── Word auto-numbering config accumulator ──
// We build numbering definitions on the fly: one shared "questions" decimal list, plus a UNIQUE
// per-question subpart list (so subparts restart at (i)/(a) for each question). Word then maintains
// these numbers (renumber on insert/delete in Word).
type NumRun = { bold?: boolean; color?: string };
type NumLevel = { level: number; format: LevelFormat; text: string; alignment: typeof AlignmentType[keyof typeof AlignmentType]; run?: NumRun };
type NumConfig = { reference: string; levels: NumLevel[] };

function lvl(format: LevelFormat, text: string, run?: NumRun): NumLevel[] {
  return [{ level: 0, format, text, alignment: AlignmentType.LEFT, run }];
}

// Detect a leading subpart label like "(i)", "(a)", "(1)" — tolerating bold wrappers (**(i)**) that
// appear in worked-solution working steps. Returns {token, rest} or null.
function parseSubpartLabel(line: string): { token: string; rest: string } | null {
  const m = line.match(/^\*{0,2}\(([a-z]{1,3}|\d{1,2})\)\*{0,2}\s*(.*)$/i);
  if (!m) return null;
  return { token: m[1], rest: m[2] };
}
// Choose a Word numbering format from a sample subpart token.
function subpartFormat(token: string): LevelFormat {
  if (/^\d+$/.test(token)) return LevelFormat.DECIMAL;
  if (/^[ivxl]+$/i.test(token) && /[ivxl]/i.test(token)) return LevelFormat.LOWER_ROMAN;
  return LevelFormat.LOWER_LETTER;
}
function romanToInt(s: string): number {
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const t = s.toLowerCase(); let total = 0;
  for (let i = 0; i < t.length; i++) {
    const cur = map[t[i]] || 0, next = map[t[i + 1]] || 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}
// Ordinal value of a subpart token, used to detect a sequence reset (question parts → working parts).
function tokenRank(token: string): number {
  const t = token.toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (/^[ivxl]+$/.test(t)) return romanToInt(t);
  let n = 0; for (const ch of t) { if (ch < 'a' || ch > 'z') return 0; n = n * 26 + (ch.charCodeAt(0) - 96); }
  return n;
}

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
function inlineRuns(text: string, reg: OmmlRegistry, opts: { color?: string; bold?: boolean; marksTab?: boolean } = {}): TextRun[] {
  let src = normalizeMarks(text);
  let trailingMarks: string | null = null;
  // If the line ends with a [N] marks bracket, peel it off to push to a right tab stop.
  if (opts.marksTab) {
    const m = src.match(/\s*(\[\d+\])\s*$/);
    if (m) { trailingMarks = m[1]; src = src.slice(0, m.index).trimEnd(); }
  }
  const runs: TextRun[] = [];
  for (const part of splitMathInline(src)) {
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
  if (trailingMarks) runs.push(new TextRun({ text: `\t${trailingMarks}`, color: opts.color }));
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
async function contentParagraphs(
  content: string | null,
  reg: OmmlRegistry,
  opts: { color?: string; subpartRef?: string; onSubpartFormat?: (f: LevelFormat) => void; dropLeadingTitle?: string } = {},
): Promise<Paragraph[]> {
  const out: Paragraph[] = [];
  const { text, urls } = extractImages(content ?? '');
  // Each non-empty LINE becomes its own paragraph so labelled parts ((i), (ii)…) stay separated and
  // each can right-tab its trailing marks to 15.5 cm.
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l && l !== '---');
  // Drop a leading line that just repeats the card title (the bank template emits "**School Year PxQy**"
  // as the first content line, which the heading already shows).
  if (opts.dropLeadingTitle && lines.length) {
    const norm = (s: string) => s.replace(/^\*+|\*+$/g, '').trim();
    if (norm(lines[0]) === opts.dropLeadingTitle.trim()) lines.shift();
  }
  let reportedFmt = false;
  // Auto-numbered subpart lists restart per sequence: when a label's ordinal is <= the previous one
  // (e.g. question parts (i)-(iv) end, then the working steps start again at (i)), bump the Word
  // numbering INSTANCE so the count restarts at (i)/(a)/1.
  let instance = 0, prevRank = 0; let seenSub = false;
  for (const line of lines) {
    const sub = opts.subpartRef ? parseSubpartLabel(line) : null;
    if (sub) {
      if (!reportedFmt) { opts.onSubpartFormat?.(subpartFormat(sub.token)); reportedFmt = true; }
      const rank = tokenRank(sub.token);
      if (!seenSub || rank <= prevRank) instance++;
      seenSub = true; prevRank = rank;
      out.push(new Paragraph({
        numbering: { reference: opts.subpartRef!, level: 0, instance },
        children: inlineRuns(sub.rest, reg, { ...opts, marksTab: true }),
        tabStops: [{ type: TabStopType.RIGHT, position: MARKS_TAB }],
        spacing: { after: 80 },
      }));
    } else {
      out.push(new Paragraph({
        children: inlineRuns(line, reg, { ...opts, marksTab: true }),
        tabStops: [{ type: TabStopType.RIGHT, position: MARKS_TAB }],
        spacing: { after: 80 },
      }));
    }
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

  // Every non-empty card (refresher / worked example / practice) is a "main question" and gets a
  // single running number 1, 2, 3 … across the whole lesson; subparts (i)(ii) nest under each.
  const isEmptyCard = (c: DocxCard) => !(c.card_title || '').trim() && !(c.content || '').trim();
  const orderedCards = sections.flatMap(sec => cardsOf(sec)).filter(c => !isEmptyCard(c));
  const mainNum = new Map<string, number>();
  orderedCards.forEach((c, i) => mainNum.set(c.id, i + 1));
  const practiceOrdered = orderedCards.filter(c => c.content_kind === 'practice');

  // Word numbering definitions accumulated during the build.
  const numConfigs: NumConfig[] = [
    // Single running question list (1. 2. 3. …) shared by every card's main heading.
    { reference: 'questions', levels: lvl(LevelFormat.DECIMAL, '%1.', { bold: true }) },
  ];
  // Subpart format chosen per-card once we see its first label; default lower-roman.
  const subpartFmt = new Map<string, LevelFormat>();
  const subpartRefFor = (cardId: string) => `sub-${cardId}`;
  for (const c of orderedCards) numConfigs.push({ reference: subpartRefFor(c.id), levels: lvl(LevelFormat.LOWER_ROMAN, '(%1)') });

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
      // Skip placeholder cards with neither a title nor content (e.g. a blank "Untitled" card).
      if (isEmptyCard(c)) continue;
      if (ci === firstAdvIdx) {
        body.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: 'Advanced practice', bold: true, color: 'B45309' })] }));
      }
      // Every card is a numbered main question (running 1, 2, 3 … via a Word auto-list, continuous
      // across sections). Practice cards add right-tabbed marks + writing space below.
      const isPractice = c.content_kind === 'practice';
      body.push(new Paragraph({
        numbering: { reference: 'questions', level: 0 },
        spacing: { before: 160 },
        tabStops: (isPractice && c.marks) ? [{ type: TabStopType.RIGHT, position: MARKS_TAB }] : undefined,
        children: [
          ...inlineRuns(c.card_title ?? '', reg, { bold: true }),
          ...((isPractice && c.marks) ? [new TextRun({ text: `\t[${c.marks}]`, bold: true, color: '6B7280' })] : []),
        ],
      }));
      for (const p of await contentParagraphs(c.content, reg, {
        subpartRef: subpartRefFor(c.id),
        onSubpartFormat: (f) => subpartFmt.set(c.id, f),
        dropLeadingTitle: c.card_title ?? '',
      })) body.push(p);
      if (isPractice) {
        // Writing space ~ marks lines (min 3, cap 12).
        const lines = Math.min(12, Math.max(3, c.marks ?? 3));
        for (let i = 0; i < lines; i++) {
          body.push(new Paragraph({ spacing: { after: 60 }, border: { bottom: { color: '9CA3AF', size: 4, style: BorderStyle.DASHED, space: 1 } }, children: [new TextRun({ text: '' })] }));
        }
      }
    }
  }

  // Practice solutions at the back — keep the SAME displayed numbers as the questions (typed, not a
  // list, so they match even though questions use an auto-list).
  if (practiceOrdered.length > 0) {
    body.push(new Paragraph({ text: 'Practice — Solutions', heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { after: 120 } }));
    for (const c of practiceOrdered) {
      body.push(new Paragraph({ spacing: { before: 120 }, children: [
        new TextRun({ text: `${mainNum.get(c.id)}. `, bold: true }),
        ...inlineRuns(c.card_title ?? '', reg, { bold: true }),
        ...(c.is_advanced ? [new TextRun({ text: '  [Advanced]', bold: true, color: 'B45309' })] : []),
      ] }));
      for (const p of await contentParagraphs(c.content, reg, { color: ANSWER_BROWN, dropLeadingTitle: c.card_title ?? '' })) body.push(p);
    }
  }

  // Apply the chosen per-question subpart format (detected from the typed labels).
  for (const cfg of numConfigs) {
    if (cfg.reference.startsWith('sub-')) {
      const cardId = cfg.reference.slice(4);
      const f = subpartFmt.get(cardId);
      if (f) cfg.levels = lvl(f, f === LevelFormat.DECIMAL ? '%1.' : '(%1)');
    }
  }

  const doc = new Document({
    numbering: {
      config: numConfigs.map(cfg => {
        const ind = cfg.reference.startsWith('sub-') ? NUM_INDENT.sub : NUM_INDENT.main;
        return {
          reference: cfg.reference,
          levels: cfg.levels.map(l => ({
            level: l.level, format: l.format, text: l.text, alignment: l.alignment, suffix: LevelSuffix.TAB,
            style: { ...(l.run ? { run: l.run } : {}), paragraph: { indent: { left: ind.textIndent, hanging: ind.hang } } },
          })),
        };
      }),
    },
    sections: [{ properties: {}, children: body }],
  });
  const blob = await Packer.toBlob(doc);
  const arrayBuffer = await blob.arrayBuffer();
  return injectOmmlIntoDocxBuffer(arrayBuffer, reg.entries);
}
