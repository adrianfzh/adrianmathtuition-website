import path from 'path';
import pLimit from 'p-limit';
import { put } from '@vercel/blob';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectedQuestion {
  questionLabel: string;
  questionRegionBox: [number, number, number, number]; // [yMin, xMin, yMax, xMax] 0-1000
  questionRegionPixels: { x1: number; y1: number; x2: number; y2: number };
  hasDiagram: boolean;
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

// ── Gemini detection prompt ───────────────────────────────────────────────────

const DETECTION_PROMPT = `This is a page of a Singapore secondary or JC math student's exam paper or worksheet. Each printed question is followed by space below where the student has handwritten their working and answer.

Detect the 2D bounding box around EACH distinct question's combined area (the printed question text PLUS the student's handwritten working below it). Treat sub-parts (e.g. Q12(a), Q12(b), Q12(c)) as ONE region grouped under the parent question — they share working space and should be marked together.

Return coordinates in normalized 0-1000 [y_min, x_min, y_max, x_max] format — Y FIRST.

Return JSON only:
{
  "questions": [
    {
      "label": "Q1",
      "box_2d": [y_min, x_min, y_max, x_max],
      "has_diagram": false
    },
    {
      "label": "Q12",
      "box_2d": [y_min, x_min, y_max, x_max],
      "has_diagram": true
    }
  ]
}

Rules:
- One entry per parent question. NEVER split sub-parts into multiple entries.
- The label is the question number/letter as printed (e.g. "Q1", "Q12", "Section A Q3"). If unclear, use "Q?".
- The box_2d should encompass BOTH the printed question text AND the student's handwritten working below it (so we can crop the whole region for marking).
- has_diagram=true if the question requires the student to draw/use a diagram (graph, construction, geometric figure). Not for printed diagrams in the question.
- If a question's working spans multiple regions on the page (rare but possible), pick the bounding box that encompasses the bulk of the visible working.
- If the page is blank or contains no questions, return { "questions": [] }.`;

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

// ── Gemini region detection ───────────────────────────────────────────────────

export async function detectQuestionsOnPage(
  imageBuffer: Buffer,
  width: number,
  height: number,
  pageIndex: number
): Promise<DetectedQuestion[]> {
  const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-pro',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } as any,
  });

  console.time(`gemini-detect-page-${pageIndex}`);
  let result;
  try {
    result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageBuffer.toString('base64'),
              },
            },
            { text: DETECTION_PROMPT },
          ],
        },
      ],
    });
  } finally {
    console.timeEnd(`gemini-detect-page-${pageIndex}`);
  }

  const text = result.response.text();
  let parsed: { questions: Array<{ label: string; box_2d: [number, number, number, number]; has_diagram: boolean }> };

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
    };
  });
}

// ── Vercel Blob upload ────────────────────────────────────────────────────────

export async function uploadPageImage(
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

// ── Parallel orchestration ────────────────────────────────────────────────────

export async function processPages(
  pageImages: PageImage[],
  batchId: string
): Promise<ProcessedPage[]> {
  const limit = pLimit(5);

  const results = await Promise.all(
    pageImages.map((page) =>
      limit(async () => {
        const { buffer, width, height, pageIndex } = page;
        const [url, questions] = await Promise.all([
          uploadPageImage(batchId, pageIndex, buffer),
          detectQuestionsOnPage(buffer, width, height, pageIndex),
        ]);
        return { pageIndex, buffer, width, height, url, questions };
      })
    )
  );

  return results.sort((a, b) => a.pageIndex - b.pageIndex);
}
