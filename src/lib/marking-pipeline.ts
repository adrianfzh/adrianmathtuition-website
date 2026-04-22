import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnnotationResult {
  annotations: Array<{
    step: number;
    type: 'tick' | 'cross' | 'incomplete' | 'comment';
    text: string;
    bbox: { x1: number; y1: number; x2: number; y2: number };
  }>;
  overall: 'correct' | 'partial' | 'incorrect';
  score_text: string;
}

export interface MarkingOutput {
  question: { number: string; prompt: string; max_marks: number | null; has_diagram: boolean };
  correct: { final_answer: string; method_summary: string };
  lines: Array<{
    line_index: number;
    transcription_latex: string;
    transcription_plain: string;
    is_crossed_out: boolean;
    verdict: 'correct' | 'wrong' | 'neutral';
    error_type: string | null;
    correction: { arrow: string | null; text_latex: string; text_plain: string } | null;
  }>;
  student_final_answer: { value_raw: string; value_latex: string; matches_correct: boolean; had_self_correction: boolean };
  marks: { awarded: number; max: number; margin_note: string };
  summary: { title: string; body_markdown: string };
  uncertainty: { raised: boolean; notes: string[] };
  meta: { level_detected: string; topic_detected: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Marking prompt (verbatim port from bot ai/annotate.js) ───────────────────

export function buildMarkingPrompt(
  questionContext: string | null,
  studentLevel: string | null,
  questionLevel: 'JC' | 'SECONDARY' | 'unknown'
): string {
  const levelNote = studentLevel ? ` (${studentLevel} student)` : '';
  const contextSection = questionContext
    ? `\nQUESTION BEING ATTEMPTED:\n${questionContext}\n`
    : '';

  const syllabusLevel = questionLevel === 'JC' ? 'JC (A-Level H2 Math)'
    : questionLevel === 'SECONDARY' ? 'Secondary (O-Level A-Math/E-Math)'
    : 'Unknown';

  const syllabusRules = `
QUESTION LEVEL: ${syllabusLevel}

CRITICAL LEVEL RULES:
- ONLY explain using methods appropriate for the student's level.
- If this is a SECONDARY question:
  - Do NOT mention implicit differentiation, integration by parts, or any JC-only methods.
  - If the question requires differentiating an implicit equation, tell the student to rearrange and make y the subject first, then differentiate — do NOT suggest implicit differentiation.
  - Explain everything using chain rule, quotient rule, product rule (which ARE in A-Math syllabus).
  - Never say "you should use implicit differentiation" to a Secondary student.
- If this is a JC question:
  - JC methods (implicit differentiation, integration by parts, Maclaurin series, etc.) are expected and correct.
- If the level is unknown, default to explaining with simpler methods first.`;

  return `You are a Singapore math tutor marking a student's handwritten working${levelNote}.
${contextSection}${syllabusRules}

You will output ONLY a JSON object matching the schema described below. No prose, no markdown fences, no preamble. Just the raw JSON.

HOW TO MARK (follow these stages internally; they produce the JSON fields):

STAGE 1 — SOLVE INDEPENDENTLY (internal; fills the "correct" field)
- Read the question. Derive YOUR OWN correct final answer from scratch, before looking at student's work.
- If the question specifies rounding, apply it to your answer.
- Write a 1-sentence method summary describing the correct approach.

STAGE 2 — READ THE PAGE (fills "question" and "lines" fields)
- Identify the question number and max marks (from the [N] marks indicator if visible).
- Flag has_diagram=true if the question requires a diagram/graph/construction as part of the student's answer (not just has a printed diagram in the question).
- For each visible line of the student's handwritten working, create one entry in lines[]:
  - Transcribe the handwriting into LaTeX (use $ for inline math, $$ for display math). Keep math as math, not plain text.
  - Also provide a plain-text transcription (what the line says if read aloud).
  - Mark is_crossed_out=true if the line is visibly struck through.
  - Set verdict based on whether THAT step is correct (independent of student's final answer).
- Ignore any red-pen marks or teacher annotations on the page — those are background, not ground truth.

STAGE 3 — DIAGNOSE ERRORS (fills error_type and correction fields)
- For each line with verdict="wrong": identify the specific error type from the enumeration.
- Where a correction would help the student, add a correction object with BOTH text_latex AND text_plain:
  - text_latex: LaTeX version for the HTML renderer (e.g. "'49% taller' means larger $= 100 + 49 = 149$, so ratio should be $100 : 149$")
  - text_plain: Telegram-safe version using Unicode only, no backslashes, no dollar signs (e.g. "'49% taller' means larger = 149, so ratio should be 100 : 149")
- Arrow direction: "up" points to the line above (common for corrections below a wrong line), "down" points to the line below, "right" for inline, null if correction stands alone.

STAGE 4 — JUDGE THE FINAL ANSWER (fills "student_final_answer" and "marks" fields)
- The student's final committed answer is on the "Answer" line or in the most recent non-crossed-out working.
- had_self_correction = true if the student visibly crossed out an earlier attempt before the final.
- matches_correct = true iff student_final_answer.value_latex is mathematically equivalent to correct.final_answer.
- Mark awards:
  - Final answer matches AND no self-correction: full marks.
  - Final answer matches BUT student had a crossed-out wrong attempt: partial credit, typically half the marks (round up for odd totals; e.g. 2/3 for 3-mark Q, 1/2 for 2-mark Q).
  - Final answer differs from correct: partial credit only if SOME lines have verdict="correct" AND the method on those lines is sound. Otherwise 0.
- margin_note: e.g. "-1" if 1 mark lost, "-2" if 2 marks lost, empty string if full marks.

STAGE 5 — WRITE THE SUMMARY ("summary" field)
- title: "Well done!" if awarded==max, otherwise "Where you went wrong".
- body_markdown: 2-4 sentences explaining the key error in plain English, naming the concept, ending with a rule of thumb the student can remember. Use **bold** for the key concept name. Speak TO the student (use "you" and "your").
- For fully correct answers: congratulate specifically on what was well done, no rule-of-thumb needed.

STAGE 6 — UNCERTAINTY (optional)
- raised = true if you have a SPECIFIC concern: unclear handwriting, ambiguous interpretation, non-standard method that might be valid, close-call partial credit.
- notes: 1-3 short bullet points each describing one specific concern. Empty array if raised=false.

PLAIN-TEXT vs LATEX — STRICT RULES:

There are TWO types of transcription in this JSON:

A) LaTeX fields (transcription_latex, correction.text_latex):
   - For rendering to image later. Use standard LaTeX.
   - Inline math in single dollars: $7x$, $(x-5)^2$
   - Display math in double dollars: $$\\frac{7x}{(x-5)^2} - \\frac{1}{x-5}$$
   - Use \\frac, \\sqrt, \\times, \\approx, etc.

B) Plain-text fields (transcription_plain, correction.text_plain):
   - For Telegram message (no math rendering available).
   - NO backslashes. NO dollar signs. NO LaTeX commands.
   - Use Unicode math symbols directly: √ ² ³ ⁴ ⁵ ¹ ⁰ ½ ⅓ ⅔ ¼ ¾ ° ± × ÷ ≠ ≈ ≤ ≥ ≡ ∞ π θ
   - Fractions: write as "7x/(x-5)²" not "\\frac{7x}{(x-5)^2}".
   - Square roots: write as "√0.81" not "\\sqrt{0.81}" or "sqrt(0.81)".
   - Powers: use Unicode superscripts for integer exponents (² ³ ⁴); use ^ for non-integer/algebraic: "0.86^(2/3)", "x^(n+1)".
   - Parentheses only where mathematically needed — not for LaTeX grouping.

VOICE — SECOND PERSON:

ALL student-facing text MUST address the student directly using "you" and "your":
- transcription_plain: describe what the student wrote in second person.
  ✓ "You wrote the order as √0.81, 0.902, 399/441, 0.86^(2/3)"
  ✓ "You computed √0.81 = 0.9"
  ✗ "Student computed √0.81 = 0.9"  ✗ "The student's working shows..."
- correction.text_plain: tell the student what it should be, directly.
  ✓ "Should be 100 : 149, since the larger is 49% taller"
  ✗ "The correct ratio is 100 : 149"
- summary.body_markdown: use "you" and "your" (already required, continue as-is).
- Never refer to the student in third person anywhere in the JSON.

EXAMPLES:

  Q1 ordering error:
    transcription_latex: "$$\\\\sqrt{0.81},\\ 0.902,\\ \\\\frac{399}{441},\\ 0.86^{\\\\tfrac{2}{3}}$$"
    transcription_plain: "You wrote the order as √0.81, 0.902, 399/441, 0.86^(2/3)"
    correction.text_latex: "Should be $\\\\sqrt{0.81} < 0.86^{2/3} < \\\\frac{399}{441} < 0.902$"
    correction.text_plain: "Should be √0.81 < 0.86^(2/3) < 399/441 < 0.902"

  Q2 algebra:
    transcription_latex: "$$\\\\frac{7x}{(x-5)^2} - \\\\frac{1}{x-5}$$"
    transcription_plain: "You rewrote it as 7x/(x-5)² − 1/(x-5)"

  Q13a bottle ratio:
    transcription_latex: "$\\\\text{small} : \\\\text{larger} = 49 : 100$"
    transcription_plain: "You set up the ratio as small : larger = 49 : 100"
    correction.text_latex: "'49% taller' means larger $= 100 + 49 = 149$, ratio should be $100 : 149$"
    correction.text_plain: "'49% taller' means larger = 149, so ratio should be 100 : 149"

OUTPUT FORMAT (raw JSON, no fences):

{
  "question": { "number": "...", "prompt": "...", "max_marks": null, "has_diagram": false },
  "correct": { "final_answer": "...", "method_summary": "..." },
  "lines": [
    {
      "line_index": 1,
      "transcription_latex": "...",
      "transcription_plain": "...",
      "is_crossed_out": false,
      "verdict": "correct",
      "error_type": null,
      "correction": null
    },
    {
      "line_index": 2,
      "transcription_latex": "...",
      "transcription_plain": "...",
      "is_crossed_out": false,
      "verdict": "wrong",
      "error_type": "ratio_inversion",
      "correction": {
        "arrow": "up",
        "text_latex": "...",
        "text_plain": "..."
      }
    }
  ],
  "student_final_answer": { "value_raw": "...", "value_latex": "...", "matches_correct": false, "had_self_correction": false },
  "marks": { "awarded": 0, "max": 0, "margin_note": "" },
  "summary": { "title": "...", "body_markdown": "..." },
  "uncertainty": { "raised": false, "notes": [] },
  "meta": { "level_detected": "...", "topic_detected": "..." }
}

RULES:
- Output valid JSON only. No text before or after. No markdown fences.
- All strings must be valid JSON strings with escaped quotes and backslashes.
- For LaTeX inside JSON strings, double-escape backslashes: \\\\frac, \\\\times, etc.
- If a field doesn't apply, use null (for objects) or empty string/array (for strings/arrays) — don't omit fields.
- Keep lines[] concise: one entry per distinct handwritten line. Don't pad.
- If the page contains multiple sub-questions, mark only the ONE indicated by the caption/context. If ambiguous, mark the first one and note in uncertainty.
- verdict enum values: "correct" | "wrong" | "neutral"
- error_type enum values: null | "ratio_inversion" | "wrong_setup" | "sign_error" | "arithmetic_slip" | "wrong_formula" | "unit_error" | "incomplete" | "conceptual" | "other"
- correction.arrow enum values: "up" | "down" | "right" | null`;
}

// ── Structured JSON → human-readable text (port from bot ai/annotate.js) ─────

export function structuredMarkingToText(json: MarkingOutput): string {
  const out: string[] = [];

  const sanitize = (s: string | null | undefined): string => {
    if (!s) return '';
    return s
      .replace(/\$\$/g, '')
      .replace(/\$/g, '')
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/($2)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\approx/g, '≈')
      .replace(/\\neq/g, '≠')
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥')
      .replace(/\\pm/g, '±')
      .replace(/\\pi/g, 'π')
      .replace(/\\theta/g, 'θ')
      .replace(/\\left|\\right/g, '')
      .replace(/\\\\/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const correctLines = (json.lines || []).filter(l => l.verdict === 'correct' && !l.is_crossed_out);
  if (correctLines.length > 0) {
    out.push('✅ Correct steps:');
    correctLines.forEach((l, i) => { out.push(`${i + 1}. ${sanitize(l.transcription_plain)}`); });
    out.push('');
  }

  const firstWrong = (json.lines || []).find(l => l.verdict === 'wrong' && !l.is_crossed_out);
  if (firstWrong) {
    out.push(`❌ Error at step ${firstWrong.line_index}:`);
    out.push(`What you wrote: ${sanitize(firstWrong.transcription_plain)}`);
    const correctionStr = firstWrong.correction?.text_plain
      ? sanitize(firstWrong.correction.text_plain)
      : firstWrong.correction?.text_latex
        ? sanitize(firstWrong.correction.text_latex)
        : null;
    if (correctionStr) out.push(`What it should be: ${correctionStr}`);
    if (firstWrong.error_type) out.push(`Error type: ${firstWrong.error_type.replace(/_/g, ' ')}`);
    out.push('');
  }

  const awarded = json.marks?.awarded ?? 0;
  const max = json.marks?.max ?? 0;
  const marginNote = json.marks?.margin_note ? ` (${json.marks.margin_note})` : '';
  let marksLine = `📊 Method marks: ${awarded}/${max}${marginNote}`;
  if (json.student_final_answer?.had_self_correction && json.student_final_answer?.matches_correct && awarded < max) {
    marksLine += ' — partial credit for self-correction';
  } else if (max > 0 && awarded === max) {
    marksLine += ' — Full marks!';
  }
  out.push(marksLine);
  out.push('');

  if (json.summary?.body_markdown) {
    out.push(`💡 ${sanitize(json.summary.body_markdown)}`);
    out.push('');
  }

  if (json.uncertainty?.raised && json.uncertainty.notes?.length > 0) {
    out.push('🤔 Uncertainty:');
    json.uncertainty.notes.forEach(note => out.push(`• ${sanitize(note)}`));
  }

  return out.join('\n').trim();
}

// ── Claude Sonnet marking call ────────────────────────────────────────────────

export async function callSonnetMarking(
  imageBase64: string,
  mediaType: string,
  systemPrompt: string
): Promise<MarkingOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/webp', data: imageBase64 },
          },
          { type: 'text', text: "Mark this student's handwritten working." },
        ],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    try {
      return JSON.parse(jsonMatch ? jsonMatch[0] : text) as MarkingOutput;
    } catch {
      if (attempt >= 2) throw new Error('Failed to parse marking JSON after 2 attempts');
      console.warn('[callSonnetMarking] attempt 1: JSON parse failed, retrying');
    }
  }
  throw new Error('callSonnetMarking: exhausted retries');
}

// ── Gemini annotation bbox call (port from bot handlers/messages.js) ──────────

export async function callGeminiBboxAnnotations(
  base64Image: string,
  mediaType: string,
  markingJson: MarkingOutput,
  imageWidth: number,
  imageHeight: number
): Promise<AnnotationResult> {
  const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genai.getGenerativeModel({
    model: 'gemini-2.5-pro',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } as any,
  });

  const markingFeedback = structuredMarkingToText(markingJson);

  const prompt = `Here is the marking feedback for a student's handwritten math working:

${markingFeedback.substring(0, 1500)}

Task: Detect the 2D bounding boxes of each distinct line of the student's handwritten working that the feedback refers to.

Return a JSON object with this exact structure:
{
  "annotations": [
    {"step": 1, "type": "tick", "box_2d": [y_min, x_min, y_max, x_max], "text": ""},
    {"step": 2, "type": "cross", "box_2d": [y_min, x_min, y_max, x_max], "text": "short error label"}
  ],
  "overall": "correct",
  "score_text": "4/5"
}

Rules:
- Coordinates must be in normalized 0-1000 space, in the order [y_min, x_min, y_max, x_max].
- Count correct steps in the feedback → exactly that many "tick" annotations.
- Count errors in the feedback → exactly that many "cross" annotations, each with a short error label (max 25 chars).
- Bounding boxes must tightly enclose ONLY the student's handwritten working for that specific step — not printed question text, not blank space.
- One bbox per distinct line of handwriting.
- If the page has multiple sub-questions (e.g. Q1, Q2, Q3 stacked), ensure each annotation is around the correct sub-question's handwriting.
- If a step in the feedback can't be located on the image, omit it rather than guessing.
- overall: "correct" if all steps right, "partial" if some right some wrong, "incorrect" if none right.
- score_text: brief score summary from the feedback (e.g. "4/5"), empty string if no clear score.

Output only the JSON object. No markdown, no preamble.`;

  const result = await model.generateContent([
    { inlineData: { mimeType: mediaType, data: base64Image } },
    prompt,
  ]);

  const responseText = result.response.text().trim();
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

  const converted: AnnotationResult = {
    annotations: [],
    overall: parsed.overall || 'partial',
    score_text: parsed.score_text || '',
  };

  for (const ann of parsed.annotations || []) {
    const box = ann.box_2d;
    if (!Array.isArray(box) || box.length !== 4) continue;
    const [yMinNorm, xMinNorm, yMaxNorm, xMaxNorm] = box;
    converted.annotations.push({
      step: ann.step,
      type: ann.type,
      text: ann.text || '',
      bbox: {
        x1: Math.round((xMinNorm / 1000) * imageWidth),
        y1: Math.round((yMinNorm / 1000) * imageHeight),
        x2: Math.round((xMaxNorm / 1000) * imageWidth),
        y2: Math.round((yMaxNorm / 1000) * imageHeight),
      },
    });
  }

  if (!converted.annotations.length) throw new Error('Gemini returned zero valid annotations');
  return converted;
}

// ── Sharp SVG composite annotated image (port from bot ai/annotate.js) ────────

export async function createAnnotatedImage(
  base64Image: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _mediaType: string,
  annotations: AnnotationResult
): Promise<Buffer | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sharpLib: any;
  try {
    sharpLib = (await import('sharp')).default ?? (await import('sharp'));
  } catch {
    console.warn('[createAnnotatedImage] sharp not available');
    return null;
  }

  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const metadata = await sharpLib(imageBuffer).metadata();
    const { width = 800, height = 1000 } = metadata;

    const fontSize = Math.max(13, Math.min(17, height / 35));
    const pillHeight = Math.round(fontSize * 2.0);
    const pillRadius = pillHeight / 2;
    const font = 'DejaVu Sans,sans-serif';

    const svgParts: string[] = [];

    for (const ann of annotations.annotations) {
      const label = String(ann.step || '');
      const bbox = ann.bbox;
      let lineCenterY: number, annotationX: number;

      if (bbox && typeof bbox.x2 === 'number' && typeof bbox.y1 === 'number' && typeof bbox.y2 === 'number') {
        const x2 = Math.max(0, Math.min(bbox.x2, width));
        const y1 = Math.max(0, Math.min(bbox.y1, height));
        const y2 = Math.max(0, Math.min(bbox.y2, height));
        lineCenterY = Math.round((y1 + y2) / 2);
        annotationX = x2 + Math.round(width * 0.02);
      } else {
        continue;
      }

      if (ann.type === 'tick') {
        const pillWidth = Math.round(label.length * fontSize * 0.6 + fontSize * 1.2 + 14);
        const px = Math.min(annotationX, width - pillWidth - 10);
        const cx = px + pillWidth - fontSize * 0.7;
        const cy = lineCenterY;
        const s = fontSize * 0.35;
        svgParts.push(
          `<rect x="${px + 1}" y="${lineCenterY - pillHeight / 2 + 1}" width="${pillWidth}" height="${pillHeight}" rx="${pillRadius}" fill="rgba(0,0,0,0.15)"/>` +
          `<rect x="${px}" y="${lineCenterY - pillHeight / 2}" width="${pillWidth}" height="${pillHeight}" rx="${pillRadius}" fill="#00c853" stroke="white" stroke-width="1.5"/>` +
          (label ? `<text x="${px + 8}" y="${lineCenterY + fontSize * 0.35}" font-size="${fontSize}" fill="white" font-family="${font}" font-weight="bold">${label}</text>` : '') +
          `<path d="M${cx - s * 1.2},${cy - s * 0.1} L${cx - s * 0.2},${cy + s * 0.9} L${cx + s * 1.2},${cy - s * 0.7}" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
        );
      } else if (ann.type === 'cross') {
        const errorText = ann.text || '';
        const mainPillWidth = Math.round(label.length * fontSize * 0.6 + fontSize * 1.2 + 14);
        const px = Math.min(annotationX, width - mainPillWidth - 10);
        const cx = px + mainPillWidth - fontSize * 0.7;
        const cy = lineCenterY;
        const s = fontSize * 0.3;
        svgParts.push(
          `<rect x="${px + 1}" y="${lineCenterY - pillHeight / 2 + 1}" width="${mainPillWidth}" height="${pillHeight}" rx="${pillRadius}" fill="rgba(0,0,0,0.15)"/>` +
          `<rect x="${px}" y="${lineCenterY - pillHeight / 2}" width="${mainPillWidth}" height="${pillHeight}" rx="${pillRadius}" fill="#ff1744" stroke="white" stroke-width="1.5"/>` +
          (label ? `<text x="${px + 8}" y="${lineCenterY + fontSize * 0.35}" font-size="${fontSize}" fill="white" font-family="${font}" font-weight="bold">${label}</text>` : '') +
          `<line x1="${cx - s}" y1="${cy - s}" x2="${cx + s}" y2="${cy + s}" stroke="white" stroke-width="2.5" stroke-linecap="round"/>` +
          `<line x1="${cx + s}" y1="${cy - s}" x2="${cx - s}" y2="${cy + s}" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`
        );
        if (errorText) {
          const errorPillX = px + mainPillWidth + 4;
          const errorPillW = Math.min(Math.round(errorText.length * fontSize * 0.45 + 12), Math.round(width * 0.3));
          if (errorPillX + errorPillW < width - 4) {
            svgParts.push(
              `<rect x="${errorPillX}" y="${lineCenterY - pillHeight / 2}" width="${errorPillW}" height="${pillHeight}" rx="${pillRadius}" fill="#ff1744" opacity="0.9"/>` +
              `<text x="${errorPillX + errorPillW / 2}" y="${lineCenterY + fontSize * 0.3}" font-size="${fontSize * 0.75}" fill="white" font-family="${font}" font-weight="bold" text-anchor="middle">${escapeXml(errorText.substring(0, 25))}</text>`
            );
          }
        }
      } else if (ann.type === 'incomplete') {
        const incompleteY = (bbox && typeof bbox.y2 === 'number') ? Math.round(Math.max(0, Math.min(bbox.y2, height))) : lineCenterY;
        const labelText = escapeXml(ann.text || 'Incomplete');
        const triW = fontSize;
        const pillW = Math.min(Math.round(labelText.length * fontSize * 0.55 + triW + 20), Math.round(width * 0.5));
        const ipx = Math.round(width / 2 - pillW / 2);
        const triCx = ipx + 8 + triW / 2;
        svgParts.push(
          `<line x1="0" y1="${incompleteY}" x2="${width}" y2="${incompleteY}" stroke="#ff6d00" stroke-width="2.5" stroke-dasharray="10,6" opacity="0.8"/>` +
          `<rect x="${ipx + 1}" y="${incompleteY - pillHeight / 2 + 1}" width="${pillW}" height="${pillHeight}" rx="${pillRadius}" fill="rgba(0,0,0,0.2)"/>` +
          `<rect x="${ipx}" y="${incompleteY - pillHeight / 2}" width="${pillW}" height="${pillHeight}" rx="${pillRadius}" fill="#ff6d00" stroke="white" stroke-width="1.5"/>` +
          `<polygon points="${triCx},${incompleteY - triW * 0.45} ${triCx - triW * 0.5},${incompleteY + triW * 0.35} ${triCx + triW * 0.5},${incompleteY + triW * 0.35}" fill="white" opacity="0.9"/>` +
          `<text x="${ipx + triW + 14}" y="${incompleteY + fontSize * 0.35}" font-size="${fontSize * 0.85}" fill="white" font-family="${font}" font-weight="bold">${labelText}</text>`
        );
      } else if (ann.type === 'comment') {
        const commentText = escapeXml((ann.text || '').substring(0, 25));
        const textContent = [label, commentText].filter(Boolean).join(' ');
        const pillW = Math.min(Math.round(textContent.length * fontSize * 0.55 + 20), Math.round(width * 0.38));
        const px = Math.min(annotationX, width - pillW - 10);
        svgParts.push(
          `<rect x="${px + 1}" y="${lineCenterY - pillHeight / 2 + 1}" width="${pillW}" height="${pillHeight}" rx="${pillRadius}" fill="rgba(0,0,0,0.2)"/>` +
          `<rect x="${px}" y="${lineCenterY - pillHeight / 2}" width="${pillW}" height="${pillHeight}" rx="${pillRadius}" fill="#2979ff" stroke="white" stroke-width="1.5"/>` +
          `<text x="${px + 8}" y="${lineCenterY + fontSize * 0.35}" font-size="${fontSize * 0.85}" fill="white" font-family="${font}" font-weight="bold">${textContent}</text>`
        );
      }
    }

    const bannerH = Math.max(40, height * 0.055);
    const bannerColor = annotations.overall === 'correct' ? '#00c853' : annotations.overall === 'partial' ? '#ff6d00' : '#ff1744';
    const bannerLabel = annotations.overall === 'correct' ? 'All Correct!' : annotations.overall === 'partial' ? 'Partially Correct' : 'Needs Correction';
    const scoreSuffix = annotations.score_text ? ` (${annotations.score_text})` : '';
    svgParts.push(
      `<rect x="0" y="${height - bannerH}" width="${width}" height="${bannerH}" fill="${bannerColor}" opacity="0.92"/>` +
      `<text x="${width / 2}" y="${height - bannerH / 2 + fontSize * 0.38}" font-size="${fontSize * 1.15}" fill="white" font-family="${font}" font-weight="bold" text-anchor="middle">${escapeXml(bannerLabel + scoreSuffix)}</text>`
    );

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svgParts.join('')}</svg>`;

    return await sharpLib(imageBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (err: unknown) {
    console.error('[createAnnotatedImage] error:', err instanceof Error ? err.message : err);
    return null;
  }
}
