// Build a lesson .docx that mirrors the Generate-PDF layout, with native Word (OMML) equations.
// Browser-only (uses the OMML pipeline in lesson-docx.ts which needs KaTeX DOM + JSZip).
//
// Layout: cover (name/level/topics) → sections in order (refresher / worked example / practice
// with writing space) → "Practice — Solutions" collected at the back. Card images embedded.
'use client';

import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, BorderStyle,
  TabStopType, convertMillimetersToTwip, LevelFormat, LevelSuffix, ShadingType,
} from 'docx';
import { splitMathInline, latexToOMML, OmmlRegistry, injectOmmlIntoDocxBuffer } from './lesson-docx';

// Marks right-tab position (15.5 cm from left margin).
const MARKS_TAB = convertMillimetersToTwip(155);

// Master switch for the worked-example box. OFF = no frame around examples (set true to bring the
// "house notes" thin box back).
const BOX_WORKED_EXAMPLES = false;

// Box border for worked examples (house notes style: examples sit in a thin box). Word merges
// CONSECUTIVE paragraphs with identical pBdr settings into ONE continuous box, so applying this
// to every paragraph of an example (heading + content + images) renders a single frame.
const EXAMPLE_BORDER = {
  top: { color: '64748B', size: 6, style: BorderStyle.SINGLE, space: 4 },
  bottom: { color: '64748B', size: 6, style: BorderStyle.SINGLE, space: 4 },
  left: { color: '64748B', size: 6, style: BorderStyle.SINGLE, space: 8 },
  right: { color: '64748B', size: 6, style: BorderStyle.SINGLE, space: 8 },
} as const;

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
// Inline math spanning multiple lines (`$\begin{pmatrix}` / rows / `\end{pmatrix}…$`, an import
// artifact in some 2025 JC papers) — the per-line math splitter would miss the span and emit raw
// LaTeX text. Join the span onto one line first; OMML conversion handles single-line pmatrix fine.
function joinMultilineMath(text: string): string {
  const singles = (s: string) => (s.match(/(?<!\\)\$/g) || []).length;
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('$$') || singles(line) % 2 === 0) { out.push(line); continue; }
    let j = i + 1, parity = 1, closed = false;
    for (; j < lines.length && j <= i + 12; j++) {
      if (lines[j].includes('$$')) break;
      parity = (parity + singles(lines[j])) % 2;
      if (parity === 0) { closed = true; break; }
    }
    if (closed) { out.push(lines.slice(i, j + 1).join(' ')); i = j; }
    else out.push(line);
  }
  return out.join('\n');
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
  section_name: string; card_title: string | null; content: string | null; marks: number | null; is_advanced?: boolean; concept?: string | null; order_index: number;
  /** Bank source tag, e.g. "2023/JC2/Prelim/ACJC/P1/Q8" — printed bold in brackets after the question number. */
  source_tag?: string | null;
  /** Compiled answer from the bank — used when the card content itself has no "**Answer:**" line. */
  source_answer?: string | null;
};

const ANSWER_BROWN = '843C0C';
// House answer colours: JC practice answers are red; Sec practice answers are the orange-brown
// used in Adrian's Sec worksheets (right-aligned "[Ans: …]").
const JC_ANSWER_RED = 'FF0000';
const SEC_ANSWER_ORANGE = '833C0B';

// Split content into question vs working at the bank template's "**Working:**" divider.
function splitWorking(content: string): { question: string; working: string | null } {
  const lines = content.split('\n');
  const idx = lines.findIndex(l => /^\*{0,2}\s*Working\s*:?\s*\*{0,2}$/i.test(l.trim()));
  if (idx === -1) return { question: content, working: null };
  return { question: lines.slice(0, idx).join('\n'), working: lines.slice(idx + 1).join('\n') };
}

// Split a card's content into body + the trailing "**Answer:** …" line(s) (the bank template puts
// the answer last, after a `---`). Returns the answer text without the marker.
function extractAnswer(content: string | null): { body: string; answer: string | null } {
  if (!content) return { body: '', answer: null };
  const lines = content.split('\n');
  const idx = lines.findIndex(l => /^\s*\*\*Answer:?\*\*/i.test(l.trim()));
  if (idx === -1) return { body: content, answer: null };
  // Preserve line breaks — multi-part answers list one part per line.
  const ansLines = lines.slice(idx);
  ansLines[0] = ansLines[0].replace(/^\s*\*\*Answer:?\*\*\s*/i, '');
  const answer = ansLines.map(l => l.trim()).filter(Boolean).join('\n');
  const body = lines.slice(0, idx).join('\n');
  return { body, answer: answer || null };
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

async function fetchImagePara(url: string, border?: typeof EXAMPLE_BORDER): Promise<Paragraph | null> {
  try {
    let res = await fetch(url);
    // The lessons service worker used to serve question images as OPAQUE (no-cors)
    // responses — status 0, empty body — which read as failures here even though the
    // file exists. Retry with a cache-busting query so the request misses the SW's
    // image cache and hits the network with proper CORS.
    if (!res.ok || res.type === 'opaque') {
      res = await fetch(url + (url.includes('?') ? '&' : '?') + 'docx=1', { mode: 'cors', cache: 'reload' });
    }
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') || 'image/png';
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    // Read the image's natural dimensions so we keep its aspect ratio (docx needs explicit px).
    const { w, h } = await naturalSize(buf, mime);
    const MAX_W = 360;
    const scale = w > MAX_W ? MAX_W / w : 1;
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    return new Paragraph({
      border,
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
// Images render AT THEIR POSITION in the content (not collected at the end), and a failed download
// leaves a visible grey "[image unavailable: …]" placeholder instead of silently disappearing.
async function contentParagraphs(
  content: string | null,
  reg: OmmlRegistry,
  opts: { color?: string; subpartRef?: string; onSubpartFormat?: (f: LevelFormat) => void; dropLeadingTitle?: string; shadeFill?: string; box?: boolean } = {},
): Promise<Paragraph[]> {
  const border = (opts.box && BOX_WORKED_EXAMPLES) ? EXAMPLE_BORDER : undefined;
  const out: Paragraph[] = [];
  const src = joinMultilineMath(content ?? '');

  // Ordered tokens: text chunks, <img> URLs, and $$…$$ DISPLAY-math blocks (which may span lines,
  // e.g. `$$\begin{aligned}…\\…\end{aligned}$$`). Display blocks must be pulled out BEFORE the
  // per-line split below, or the `$$` never pairs and the LaTeX prints raw. Each becomes a centred
  // OMML equation. Inline `$…$` stays inside the text tokens (handled by inlineRuns).
  const tokens: Array<{ kind: 'text'; value: string } | { kind: 'img'; url: string } | { kind: 'dmath'; latex: string }> = [];
  const blockRe = /<img\b[^>]*?src="([^"]+)"[^>]*>|\$\$([\s\S]+?)\$\$/gi;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src))) {
    if (m.index > last) tokens.push({ kind: 'text', value: src.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ kind: 'img', url: m[1] });
    else tokens.push({ kind: 'dmath', latex: m[2] });
    last = m.index + m[0].length;
  }
  if (last < src.length) tokens.push({ kind: 'text', value: src.slice(last) });

  let reportedFmt = false;
  // Auto-numbered subpart lists restart per sequence: when a label's ordinal is <= the previous one
  // (e.g. question parts (i)-(iv) end, then the working steps start again at (i)), bump the Word
  // numbering INSTANCE so the count restarts at (i)/(a)/1. State persists across image tokens.
  let instance = 0, prevRank = 0; let seenSub = false;
  // Drop a leading line that just repeats the card title (the bank template emits "**School Year
  // PxQy**" as the first content line, which the heading already shows).
  let titleChecked = !opts.dropLeadingTitle;

  for (const tok of tokens) {
    if (tok.kind === 'img') {
      const p = await fetchImagePara(tok.url, border);
      out.push(p ?? new Paragraph({
        spacing: { after: 80 },
        border,
        children: [new TextRun({ text: `[image unavailable: ${tok.url.split('/').pop() ?? tok.url}]`, italics: true, color: '999999' })],
      }));
      continue;
    }
    if (tok.kind === 'dmath') {
      // Left-aligned, indented display equation (OMML). Handles \begin{aligned}, \tfrac, etc.
      // via KaTeX→MathML→OMML. Left+indent reads as a clean column in worked solutions.
      const omml = latexToOMML(tok.latex.trim(), { displayMode: true, color: opts.color ?? null });
      out.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        indent: { left: 482 },
        spacing: { before: 40, after: 80 },
        border,
        children: [new TextRun({ text: reg.token(omml), color: opts.color })],
      }));
      continue;
    }
    const lines = tok.value.split(/\n/).map(l => l.trim()).filter(l => l && l !== '---');
    for (const line of lines) {
      if (!titleChecked) {
        titleChecked = true;
        const norm = (s: string) => s.replace(/^\*+|\*+$/g, '').trim();
        if (norm(line) === opts.dropLeadingTitle!.trim()) continue;
      }
      const shading = opts.shadeFill ? { type: ShadingType.CLEAR, fill: opts.shadeFill } : undefined;
      // Markdown bullet lines ("- x" / "* x") → bulleted paragraph with a hanging indent.
      const bullet = /^[-*]\s+(.*)$/.exec(line);
      if (bullet) {
        out.push(new Paragraph({
          indent: { left: NUM_INDENT.main.textIndent, hanging: 180 },
          children: [new TextRun({ text: '•  ', color: opts.color }), ...inlineRuns(bullet[1], reg, opts)],
          spacing: { after: 40 },
          shading,
          border,
        }));
        continue;
      }
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
          shading,
          border,
        }));
      } else {
        out.push(new Paragraph({
          children: inlineRuns(line, reg, { ...opts, marksTab: true }),
          tabStops: [{ type: TabStopType.RIGHT, position: MARKS_TAB }],
          spacing: { after: 80 },
          shading,
          border,
        }));
      }
    }
  }
  return out;
}

export async function buildLessonDocx(
  lesson: DocxLesson,
  cards: DocxCard[],
  options: { practiceSolutions?: boolean } = {},
): Promise<Blob> {
  const { practiceSolutions = true } = options;
  const reg = new OmmlRegistry();
  // JC lessons style answers differently from Sec/AM/EM lessons (house convention).
  const isJCDoc = ['JC', 'JC1', 'JC2'].includes(lesson.level);

  // Section order (saved order first, then any new sections alphabetical).
  const order = Array.isArray(lesson.section_order) ? lesson.section_order : [];
  const all = [...new Set(cards.map(c => c.section_name || 'Default'))];
  const known = order.filter(s => all.includes(s));
  const sections = [...known, ...all.filter(s => !known.includes(s)).sort()];
  // Within a section: refreshers/examples first, practice below them, advanced practice last.
  const advRank = (c: DocxCard) => (c.content_kind === 'practice' ? (c.is_advanced ? 2 : 1) : 0);
  const cardsOf = (sec: string) => cards
    .filter(c => (c.section_name || 'Default') === sec)
    .sort((a, b) => (advRank(a) - advRank(b)) || (a.order_index - b.order_index));

  // Every non-empty example/practice card is a "main question" and gets a single running number
  // 1, 2, 3 … across the whole lesson; subparts (i)(ii) nest under each. REFRESHER cards (technique
  // recaps) are reference boxes, NOT questions — they render unnumbered so the question count
  // matches what the student actually attempts.
  const isEmptyCard = (c: DocxCard) => !(c.card_title || '').trim() && !(c.content || '').trim();
  const orderedCards = sections.flatMap(sec => cardsOf(sec)).filter(c => !isEmptyCard(c));
  const mainNum = new Map<string, number>();
  orderedCards.filter(c => c.content_kind !== 'refresher').forEach((c, i) => mainNum.set(c.id, i + 1));
  const practiceOrdered = orderedCards.filter(c => c.content_kind === 'practice');

  // Word numbering definitions accumulated during the build.
  const numConfigs: NumConfig[] = [
    // Single running question list (1. 2. 3. …) shared by every card's main heading (not bold).
    { reference: 'questions', levels: lvl(LevelFormat.DECIMAL, '%1.') },
  ];
  // Subpart format chosen per-card once we see its first label; default lower-roman.
  const subpartFmt = new Map<string, LevelFormat>();
  const subpartRefFor = (cardId: string) => `sub-${cardId}`;
  for (const c of orderedCards) numConfigs.push({ reference: subpartRefFor(c.id), levels: lvl(LevelFormat.LOWER_ROMAN, '(%1)') });

  const body: Paragraph[] = [];

  // Cover — house style: bold, centred, 12 pt title.
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: lesson.name, bold: true, size: 24 })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: lesson.level, bold: true })] }));
  if (lesson.description) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: lesson.description, italics: true })] }));
  if (lesson.topics?.length) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'Topics: ' + lesson.topics.join(' · '), size: 20, color: '666666' })] }));

  // Sections
  for (const sec of sections) {
    // Section title — house style: 20 pt bold, centred (docx sizes are half-points).
    body.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: sec, bold: true, size: 40 })],
    }));
    const secCards = cardsOf(sec);
    const firstAdvIdx = secCards.findIndex(c => c.content_kind === 'practice' && c.is_advanced);
    for (let ci = 0; ci < secCards.length; ci++) {
      const c = secCards[ci];
      // Skip placeholder cards with neither a title nor content (e.g. a blank "Untitled" card).
      if (isEmptyCard(c)) continue;
      if (ci === firstAdvIdx) {
        body.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: 'Advanced practice', bold: true, color: 'B45309' })] }));
      }
      const isPractice = c.content_kind === 'practice';
      const isRefresher = c.content_kind === 'refresher';
      if (isRefresher) {
        // Technique-recap box: unnumbered bold title + shaded content block — visually a
        // reference box, not a question.
        body.push(new Paragraph({
          spacing: { before: 160, after: 40 },
          shading: { type: ShadingType.CLEAR, fill: 'EEF2FF' },
          border: { top: { color: 'C7D2FE', size: 6, style: BorderStyle.SINGLE, space: 2 } },
          children: inlineRuns(c.card_title || 'Technique recap', reg, { bold: true }),
        }));
        for (const p of await contentParagraphs(c.content, reg, {
          dropLeadingTitle: c.card_title ?? '',
          shadeFill: 'EEF2FF',
        })) body.push(p);
        continue;
      }
      // Every example/practice card is a numbered main question (running 1, 2, 3 … via a Word
      // auto-list, continuous across sections). Practice cards add right-tabbed marks + writing
      // space below. Heading: plain auto-number + BOLD bracketed source tag; manual cards without
      // a bank source fall back to their card title.
      // House notes style: worked examples sit inside a continuous thin box (identical pBdr on
      // every paragraph of the card → Word draws one frame around the lot).
      const isExample = c.content_kind === 'worked_example';
      body.push(new Paragraph({
        numbering: { reference: 'questions', level: 0 },
        spacing: { before: 160 },
        border: (isExample && BOX_WORKED_EXAMPLES) ? EXAMPLE_BORDER : undefined,
        tabStops: (isPractice && c.marks) ? [{ type: TabStopType.RIGHT, position: MARKS_TAB }] : undefined,
        children: [
          ...(c.source_tag
            ? [new TextRun({ text: `[${c.source_tag}]`, bold: true })]
            : inlineRuns(c.card_title ?? '', reg, { bold: true })),
          ...((isPractice && c.marks) ? [new TextRun({ text: `\t[${c.marks}]`, bold: true, color: '6B7280' })] : []),
        ],
      }));
      // Concept tag — only from the card's own concept field, and only the parts that ADD
      // information beyond the section title (a card in its own concept's section needs no tag;
      // a multi-concept practice question shows just its OTHER concepts).
      const secName = (c.section_name || '').trim();
      const conceptBits = (c.concept || '').split('·').map(s => s.trim()).filter(s => s && s !== secName);
      if (conceptBits.length > 0) {
        body.push(new Paragraph({
          indent: { left: NUM_INDENT.main.textIndent },
          spacing: { after: 40 },
          border: (isExample && BOX_WORKED_EXAMPLES) ? EXAMPLE_BORDER : undefined, // keep the example box continuous
          children: [new TextRun({
            text: `${(c.concept || '').includes(secName) && secName ? 'Also covers' : 'Concept'}: ${conceptBits.join(' · ')}`,
            italics: true, size: 18, color: '6B7280',
          })],
        }));
      }
      // Practice questions show ONLY the question + final ANSWER per house style (JC: red
      // "Answer: …"; Sec: right-aligned orange "[Ans: …]"). The working is stripped here and
      // appears in the "Practice — Solutions" section at the back instead.
      const { body: rawBody, answer: contentAnswer } = isPractice ? extractAnswer(c.content) : { body: c.content ?? '', answer: null };
      // Cards created before the answer-line fix have no "**Answer:**" in their content — fall back
      // to the answer compiled fresh from the bank at export time.
      const answer = contentAnswer ?? (isPractice ? c.source_answer ?? null : null);
      const cBody = isPractice ? splitWorking(rawBody).question : rawBody;
      for (const p of await contentParagraphs(cBody, reg, {
        subpartRef: subpartRefFor(c.id),
        onSubpartFormat: (f) => subpartFmt.set(c.id, f),
        dropLeadingTitle: c.card_title ?? '',
        box: isExample,
      })) body.push(p);
      if (isPractice && answer) {
        const ansParts = answer.split('\n').map(s => s.trim()).filter(Boolean);
        if (isJCDoc) {
          if (ansParts.length > 1) {
            // Multi-part: "Answer:" heading, then one labelled part per line (indented like subparts).
            body.push(new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: 'Answer:', bold: true, color: JC_ANSWER_RED })] }));
            for (let ai = 0; ai < ansParts.length; ai++) {
              body.push(new Paragraph({
                indent: { left: NUM_INDENT.sub.textIndent },
                spacing: { after: ai === ansParts.length - 1 ? 80 : 20 },
                children: inlineRuns(ansParts[ai], reg, { color: JC_ANSWER_RED }),
              }));
            }
          } else {
            body.push(new Paragraph({
              spacing: { before: 40, after: 80 },
              children: [new TextRun({ text: 'Answer: ', bold: true, color: JC_ANSWER_RED }), ...inlineRuns(ansParts[0] ?? '', reg, { color: JC_ANSWER_RED })],
            }));
          }
        } else {
          // Sec house style stays a single right-aligned bracket line.
          body.push(new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 40, after: 80 },
            children: [new TextRun({ text: '[Ans: ', color: SEC_ANSWER_ORANGE }), ...inlineRuns(ansParts.join('  '), reg, { color: SEC_ANSWER_ORANGE }), new TextRun({ text: ']', color: SEC_ANSWER_ORANGE })],
          }));
        }
      }
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
  // list, so they match even though questions use an auto-list). Notes-style exports omit this
  // section entirely (practice shows answers only; workings generated on demand).
  if (practiceSolutions && practiceOrdered.length > 0) {
    body.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      pageBreakBefore: true,
      spacing: { after: 120 },
      children: [new TextRun({ text: 'Practice — Solutions', bold: true, size: 40 })],
    }));
    for (const c of practiceOrdered) {
      body.push(new Paragraph({ spacing: { before: 120 }, children: [
        new TextRun({ text: `${mainNum.get(c.id)}. ` }),
        ...(c.source_tag
          ? [new TextRun({ text: `[${c.source_tag}]`, bold: true })]
          : inlineRuns(c.card_title ?? '', reg, { bold: true })),
        ...(c.is_advanced ? [new TextRun({ text: '  [Advanced]', bold: true, color: 'B45309' })] : []),
      ] }));
      // Show the WORKING here (the question itself already appeared in the body of the doc).
      const { body: solBody, answer: extractedAns } = extractAnswer(c.content);
      const solAnswer = extractedAns ?? c.source_answer ?? null;
      const { question: solQuestion, working } = splitWorking(solBody);
      const solContent = working ?? solQuestion;
      for (const p of await contentParagraphs(solContent, reg, { color: ANSWER_BROWN, dropLeadingTitle: c.card_title ?? '' })) body.push(p);
      if (solAnswer) {
        const ansParts = solAnswer.split('\n').map(s => s.trim()).filter(Boolean);
        if (ansParts.length > 1) {
          body.push(new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: 'Answer:', bold: true, color: ANSWER_BROWN })] }));
          for (const ap of ansParts) {
            body.push(new Paragraph({ indent: { left: NUM_INDENT.sub.textIndent }, spacing: { after: 20 }, children: inlineRuns(ap, reg, { color: ANSWER_BROWN }) }));
          }
        } else {
          body.push(new Paragraph({ spacing: { before: 40, after: 80 }, children: [
            new TextRun({ text: 'Answer: ', bold: true, color: ANSWER_BROWN }),
            ...inlineRuns(ansParts[0] ?? '', reg, { color: ANSWER_BROWN }),
          ] }));
        }
      }
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
    // House style: Times New Roman, 9.5 pt body text (docx sizes are half-points).
    styles: {
      default: {
        document: { run: { size: 19, font: 'Times New Roman' } },
        heading1: { run: { font: 'Times New Roman' } },
      },
    },
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
    sections: [{
      // House page layout: top 2 cm, bottom 0.8 cm, left/right 2.5 cm.
      properties: { page: { margin: {
        top: convertMillimetersToTwip(20),
        bottom: convertMillimetersToTwip(8),
        left: convertMillimetersToTwip(25),
        right: convertMillimetersToTwip(25),
      } } },
      children: body,
    }],
  });
  const blob = await Packer.toBlob(doc);
  const arrayBuffer = await blob.arrayBuffer();
  return injectOmmlIntoDocxBuffer(arrayBuffer, reg.entries);
}
