import path from 'path';
import { put } from '@vercel/blob';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withGeminiRetry } from './marking-pipeline';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectedQuestion {
  questionLabel: string;
  questionRegionBox: [number, number, number, number]; // [yMin, xMin, yMax, xMax] 0-1000
  questionRegionPixels: { x1: number; y1: number; x2: number; y2: number };
  hasDiagram: boolean;
  isContinuation: boolean;       // true = continuation of a question from the previous page
  lastPartVisible: string;       // e.g. "(ii)" — used to build context for the next page
}

export interface PageImage {
  buffer: Buffer;
  width: number;
  height: number;
  pageIndex: number;
}

export interface ProcessedPage {
  pageIndex: number;
  buffer: Buffer;
  width: number;
  height: number;
  url: string;
  questions: DetectedQuestion[];
}

export interface QuestionGroup {
  questionLabel: string;
  pages: number[];               // page indices where this logical question appears
}

export interface ProcessResult {
  pages: ProcessedPage[];
  questionGroups: QuestionGroup[];
}

// ── Cross-page context ────────────────────────────────────────────────────────

interface PageContext {
  lastQuestionLabel: string;     // e.g. "Q1"
  lastPartLabel: string | null;  // e.g. "(ii)", or null if no sub-parts visible
}

function buildPageContext(questions: DetectedQuestion[]): PageContext | null {
  if (questions.length === 0) return null;
  const last = questions[questions.length - 1];
  return {
    lastQuestionLabel: last.questionLabel,
    lastPartLabel: last.lastPartVisible || null,
  };
}

// ── Gemini detection prompt ───────────────────────────────────────────────────

function buildDetectionPrompt(pageIndex: number, prevContext: PageContext | null): string {
  const contextSection = prevContext
    ? `\nContext from the previous page: it ended with question "${prevContext.lastQuestionLabel}"${
        prevContext.lastPartLabel ? ` (last visible sub-part: ${prevContext.lastPartLabel})` : ''
      }. Consider whether this page continues that question or starts a new one.\n`
    : '';

  return `This is page ${pageIndex + 1} of a Singapore secondary or JC math student's exam paper or worksheet.${contextSection}
Detect the 2D bounding box around EACH distinct question's combined area on THIS page (the printed question text PLUS the student's handwritten working below it). Treat sub-parts like (a)(b)(c) or (i)(ii)(iii) as ONE region grouped under the parent question.

IMPORTANT RULES FOR CONTINUATIONS:
- If this page starts with a sub-part like "(iii)" or "(b)" WITHOUT a new question number before it, and the previous page ended with that parent question, label this region with the PARENT question number from the previous page. For example, if the previous page ended with "Q1" parts (i)(ii), and this page begins with "(iii)", label this region as "Q1" (NOT "Q(iii)").
- If this page starts with a clear new question number like "Q2" or "Question 3", that is a new question — label it as such.
- If uncertain, use the parent question label from the previous page if context suggests continuation, otherwise use "Q?".

Return coordinates in normalized 0-1000 [y_min, x_min, y_max, x_max] format — Y FIRST.

IMPORTANT — SPARSE PAGES:
This page may have VERY LITTLE content: one or two short handwritten answers separated by lots of whitespace. This is still detectable content. Do NOT return { "questions": [] } just because the page looks mostly blank.

Signs of a sparse-but-valid page:
- A printed sub-part header like "(ii)" or "(iii)" or "(b)" followed by a short handwritten answer
- A single short line like "x < -8/3 or 1 < x < 2"
- A few lines of algebra in isolation
On such pages, your bounding box should enclose the printed sub-part text plus any handwriting near it.

Return { "questions": [] } ONLY if the page is TRULY blank — no printed sub-part text and no handwriting whatsoever.

Return JSON only:
{
  "questions": [
    {
      "label": "Q1",
      "box_2d": [y_min, x_min, y_max, x_max],
      "has_diagram": false,
      "is_continuation": false,
      "last_part_visible": "(ii)"
    }
  ]
}

Field rules:
- "label": parent question number as printed (e.g. "Q1", "Q12", "Section A Q3"). Use "Q?" if unclear.
- "has_diagram": true if the question requires the student to draw/use a diagram (graph, construction, geometric figure). Not for printed diagrams.
- "is_continuation": true if this region is a continuation of a question from the previous page.
- "last_part_visible": the last visible sub-part label in this region (e.g. "(ii)", "(c)"). Empty string if no sub-parts or label not visible.
- One entry per logical question. NEVER split sub-parts into multiple entries.
- box_2d encompasses BOTH printed question text AND student's handwritten working.`;
}

// ── PDF → page images ─────────────────────────────────────────────────────────

async function getPdfjs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = (await import('pdfjs-dist/legacy/build/pdf.mjs' as string)) as any;
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const workerPath = path.join(
      process.cwd(),
      'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
  }
  return pdfjsLib;
}

async function pdfPageToImage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale = 2.0
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const pdfjsLib = await getPdfjs();
  const { createCanvas } = await import('@napi-rs/canvas');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const width = Math.round(viewport.width);
  const height = Math.round(viewport.height);

  const canvas = createCanvas(width, height);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = canvas.getContext('2d') as any;

  await page.render({ canvasContext: ctx, viewport }).promise;
  await pdfDoc.destroy();

  return { buffer: canvas.toBuffer('image/png'), width, height };
}

export async function pdfToPageImages(pdfBuffer: Buffer): Promise<PageImage[]> {
  const pdfjsLib = await getPdfjs();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdfDoc = await loadingTask.promise;
  const numPages: number = pdfDoc.numPages;
  await pdfDoc.destroy();

  // Rendering is page-independent — parallelise with a concurrency cap
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(5);
  const results = await Promise.all(
    Array.from({ length: numPages }, (_, i) =>
      limit(async () => {
        const img = await pdfPageToImage(pdfBuffer, i + 1);
        return { ...img, pageIndex: i };
      })
    )
  );
  return results;
}

// ── Image loading (for uploaded image files) ──────────────────────────────────

export async function imageFileToPageImage(
  imageBuffer: Buffer,
  pageIndex: number
): Promise<PageImage> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const img = await loadImage(imageBuffer);
  const canvas = createCanvas(img.width, img.height);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = canvas.getContext('2d') as any;
  ctx.drawImage(img, 0, 0);
  const pngBuffer = canvas.toBuffer('image/png');
  return { buffer: pngBuffer, width: img.width, height: img.height, pageIndex };
}

// ── Gemini region detection (sequential for cross-page context) ───────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runGeminiDetect(
  model: any,
  imageBuffer: Buffer,
  prompt: string,
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const result = await withGeminiRetry(
    () => model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: imageBuffer.toString('base64') } },
          { text: prompt },
        ],
      }],
    }),
    label
  );
  return result;
}

function parseDetectionResult(
  text: string,
  width: number,
  height: number,
  pageIndex: number
): DetectedQuestion[] {
  let parsed: {
    questions: Array<{
      label: string;
      box_2d: [number, number, number, number];
      has_diagram: boolean;
      is_continuation: boolean;
      last_part_visible: string;
    }>;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(`[detectQuestionsOnPage] page ${pageIndex}: failed to parse JSON:`, text.slice(0, 300));
    return [];
  }
  return (parsed.questions || []).map((q) => {
    const [yMin, xMin, yMax, xMax] = q.box_2d;
    return {
      questionLabel: q.label || 'Q?',
      questionRegionBox: [yMin, xMin, yMax, xMax] as [number, number, number, number],
      questionRegionPixels: {
        x1: Math.round((xMin / 1000) * width),
        y1: Math.round((yMin / 1000) * height),
        x2: Math.round((xMax / 1000) * width),
        y2: Math.round((yMax / 1000) * height),
      },
      hasDiagram: q.has_diagram ?? false,
      isContinuation: q.is_continuation ?? false,
      lastPartVisible: q.last_part_visible ?? '',
    };
  });
}

async function detectQuestionsOnPage(
  imageBuffer: Buffer,
  width: number,
  height: number,
  pageIndex: number,
  prevContext: PageContext | null
): Promise<DetectedQuestion[]> {
  const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-pro',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } as any,
  });

  const prompt = buildDetectionPrompt(pageIndex, prevContext);

  console.time(`gemini-detect-page-${pageIndex}`);
  let result;
  try {
    result = await runGeminiDetect(model, imageBuffer, prompt, `gemini-detect-page-${pageIndex}`);
  } finally {
    console.timeEnd(`gemini-detect-page-${pageIndex}`);
  }

  const questions = parseDetectionResult(result.response.text(), width, height, pageIndex);

  // Retry empty-detection pages when there's previous-page context (likely continuation)
  if (questions.length === 0 && prevContext?.lastQuestionLabel) {
    console.log(`[detect-page-${pageIndex}] empty with context — retrying with broader bbox hint`);
    const retryPrompt = buildDetectionPrompt(pageIndex, prevContext) +
      `\n\nADDITIONAL HINT: The previous page ended with ${prevContext.lastQuestionLabel}${prevContext.lastPartLabel ? ` (last sub-part: ${prevContext.lastPartLabel})` : ''}. Look very carefully on this page for ANY continuation content — even a single short handwritten answer or sub-part label. Return a bounding box covering any visible content rather than returning an empty list.`;
    console.time(`gemini-detect-page-${pageIndex}-retry`);
    let retryResult;
    try {
      retryResult = await runGeminiDetect(model, imageBuffer, retryPrompt, `gemini-detect-page-${pageIndex}-retry`);
    } finally {
      console.timeEnd(`gemini-detect-page-${pageIndex}-retry`);
    }
    const retryQuestions = parseDetectionResult(retryResult.response.text(), width, height, pageIndex);
    if (retryQuestions.length > 0) {
      console.log(`[detect-page-${pageIndex}] retry found ${retryQuestions.length} question(s)`);
      return retryQuestions;
    }
  }

  return questions;
}

// ── Vercel Blob upload ────────────────────────────────────────────────────────

async function uploadPageImage(
  batchId: string,
  pageIndex: number,
  imageBuffer: Buffer
): Promise<string> {
  const blob = await put(`batches/${batchId}/page-${pageIndex}.png`, imageBuffer, {
    access: 'public',
    contentType: 'image/png',
  });
  return blob.url;
}

// ── Orchestration: parallel uploads, sequential detection ─────────────────────

export async function processPages(
  pageImages: PageImage[],
  batchId: string
): Promise<ProcessResult> {
  // Sort by page order (should already be sorted, but be safe)
  const sorted = [...pageImages].sort((a, b) => a.pageIndex - b.pageIndex);

  // Upload all page images to Blob in parallel — page-independent
  const urlPromises = sorted.map((p) => uploadPageImage(batchId, p.pageIndex, p.buffer));
  const urls = await Promise.all(urlPromises);

  // Detect questions sequentially to preserve cross-page context chain
  const allQuestions: DetectedQuestion[][] = [];
  let prevContext: PageContext | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const { buffer, width, height, pageIndex } = sorted[i];
    const questions = await detectQuestionsOnPage(buffer, width, height, pageIndex, prevContext);
    allQuestions.push(questions);
    // Preserve prevContext across empty pages so subsequent pages still have continuation context
    prevContext = buildPageContext(questions) ?? prevContext;
  }

  const pages: ProcessedPage[] = sorted.map((p, i) => ({
    pageIndex: p.pageIndex,
    buffer: p.buffer,
    width: p.width,
    height: p.height,
    url: urls[i],
    questions: allQuestions[i],
  }));

  // Group logical questions across pages by label
  const groupMap = new Map<string, number[]>();
  for (const page of pages) {
    for (const q of page.questions) {
      if (!groupMap.has(q.questionLabel)) groupMap.set(q.questionLabel, []);
      groupMap.get(q.questionLabel)!.push(page.pageIndex);
    }
  }
  const questionGroups: QuestionGroup[] = Array.from(groupMap.entries()).map(
    ([questionLabel, pageList]) => ({ questionLabel, pages: pageList })
  );

  return { pages, questionGroups };
}
