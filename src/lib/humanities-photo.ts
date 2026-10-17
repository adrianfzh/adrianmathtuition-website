// A handwritten humanities answer, by photo (15 Oct 2026, Adrian: "build let students send photo of a
// handwritten answer"). The photo is only TYPED OUT here: the words come back to the answer box, the
// student checks them against the page, and the ordinary hand-in (lib/humanities-submit) marks the text.
// So the marking, its levels and its bench are unchanged, and no photo is kept (the same rule as the
// practice photo: "no student photos at rest"). Pure helpers; the call itself is in the route.
import { SONNET_55 } from './claude-models';

/** Photos one box may take: a question with its sources often runs to several pages (15 Oct 2026). */
export const MAX_PHOTO_PAGES = 6;
/** Photos a student may have typed out per Singapore day (a retake counts). */
export const DAILY_PHOTO_CAP = 30;
/** The reader for handwriting. A plain read of a page, so the mid-size model. */
export const PHOTO_READ_MODEL = process.env.HUMANITIES_PHOTO_MODEL || SONNET_55;
/** Printed questions and their figures — reading a graph's exact numbers is the hard part, so the large model (17 Oct 2026). */
export const PHOTO_FIGURE_MODEL = process.env.HUMANITIES_FIGURE_MODEL || 'claude-opus-5-5';
/** A figure's numbers read off a photo ("[Data read from …]"): the marker allows a small reading margin. */
export const READ_OFF_PHOTO_RULE = "The figure's numbers were read off a photo of a graph or chart, so they may be a little off. Accept a student's figure that is within about one small grid square of the value given (a value marked ~ is an estimate); never take a mark away for that difference alone.";
export const hasReadOffData = (material: string): boolean => /\[Data read from/i.test(material);

export const UNREADABLE = 'UNREADABLE';

export type PhotoMode = 'answer' | 'question' | 'sources' | 'paper';
export const isPhotoMode = (m: unknown): m is PhotoMode => m === 'answer' || m === 'question' || m === 'sources' || m === 'paper';

/** A printed question or its sources (a question brought from school, lib/humanities-own). */
function printedPrompt(pages: number, mode: 'question' | 'sources'): string {
  const what = mode === 'question' ? 'an exam question' : 'the sources or extracts that go with an exam question';
  return [
    `The ${pages === 1 ? 'photo shows' : `${pages} photos show`} ${what}, from a secondary-school Humanities paper.`,
    '',
    mode === 'question'
      ? 'Type out the question exactly as printed: its words, its number and its marks (such as [6]). If the photo shows several questions, type them all, each on its own line.'
      : 'Type out every source or extract exactly as printed, in order, each starting with its label (Source A, Extract 1 …) and the line that says where it comes from.',
    '- Keep the printed words. Do not shorten, explain or add anything.',
    '- For a picture (a cartoon, poster, photograph, chart or map), write [Picture: …] and describe everything shown in it, including every word written in it.',
    '- A graph or chart (bar, line, pie, climate graph, scatter) is ALSO given as its numbers, right after its description: [Data read from Fig. N: label value; label value; …] — every plotted value and every axis label, read as exactly as the scale allows (to half the smallest grid division); a value between grid lines is written with ~ (e.g. ~4.3). Keep the units.',
    '- Leave out handwriting, page numbers and the instructions on the cover.',
    `- If there is nothing printed to read, reply with the single word ${UNREADABLE}.`,
    '',
    'Reply with the typed-out text only, no heading and no comment.',
  ].join('\n');
}

/**
 * The whole question from photos — the question AND the sources, extracts, figures or tables that come with it
 * (15 Oct 2026, Adrian: "student will just take photo of the question and send? … just question and your answer
 * will do?"). One read splits them: the question for the box, the material for the marker.
 */
function wholeQuestionPrompt(pages: number): string {
  return [
    `The ${pages === 1 ? 'photo shows' : `${pages} photos show`} one question from a secondary-school Humanities paper (Social Studies, History or Geography), possibly with the sources, extracts, figures, maps, photographs or tables it uses, over one or more pages.`,
    '',
    'Type it out and split it in two:',
    '- "question": the question itself exactly as printed — its number, its words and its marks such as [6]. If it has parts or the photos show several questions, give each on its own line.',
    '- "material": everything the question uses, exactly as printed, in order — each source or extract starting with its label (Source A, Extract 1, Fig. 1 …) and the line saying where it comes from. A picture (cartoon, poster, photograph, chart, map) is written as [Picture: …] describing everything shown, every word in it and every number. A graph or chart (bar, line, pie, climate graph, scatter) is ALSO given as its numbers, right after its description: [Data read from Fig. N: label value; label value; …] — every plotted value and every axis label, read as exactly as the scale allows (to half the smallest grid division); a value between grid lines is written with ~ (e.g. ~4.3). Keep the units. "" when there is none.',
    '- Keep the printed words. Leave out handwriting, page numbers and cover instructions.',
    `- If there is no printed question to read, reply with the single word ${UNREADABLE}.`,
    '',
    'Reply with one JSON object only: {"question": "…", "material": "…"}',
  ].join('\n');
}

/** The whole-question reply → the question and its material, or null. */
export function parseWholeQuestion(reply: string): { question: string; material: string } | null {
  const m = String(reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { question?: unknown; material?: unknown };
    const question = String(j.question ?? '').trim();
    return question ? { question, material: String(j.material ?? '').trim() } : null;
  } catch { return null; }
}

/**
 * Pages of a whole paper (17 Oct 2026, Adrian: "do the next two" — a whole paper at once): the printed questions,
 * what they use, and the student's handwritten answers, question by question. A batch of pages may start or end
 * part-way through a question; the page sends batches and merges them by question number (lib/humanities-paper).
 */
function paperPrompt(pages: number, after: string): string {
  return [
    `The ${pages === 1 ? 'photo is a page' : `${pages} photos are pages`}, in order, of a student's secondary-school Humanities exam paper: the printed questions and the student's handwritten answers (on the paper or on separate writing paper).`,
    ...(after ? [`The pages before these ended with question ${after}. Writing at the top of these pages that shows no new question number goes on with the answer to question ${after}: give it as an item with number "${after}" and question "".`] : []),
    '',
    'For every question on these pages, give one item:',
    '- "number": the question number as printed ("1", "2", "3" …) — the main number only; parts (a), (b) stay inside the question and the answer.',
    '- "question": the question exactly as printed — every part with its label and marks, e.g. "(a) Describe … [3]". "" if the question itself is not on these pages (only the answer is).',
    '- "material": everything the question uses, exactly as printed — background information, sources, extracts, figures, tables, each with its label and the line saying where it comes from. When one set of sources serves several questions (a source-based case study), give the whole set with EACH of those questions. A picture is [Picture: …] with everything shown and every word in it. ' + "A graph or chart is ALSO given as its numbers: [Data read from Fig. N: label value; …], every plotted value read as exactly as the scale allows, ~ for an estimate.",
    '- "answer": the student\'s handwritten answer to that question, copied EXACTLY, word for word, with their own part labels. A word you cannot read is [?]. Crossed-out words are left out. "" if no answer is on these pages.',
    '- Leave out covers, instructions, page numbers and anything a teacher wrote.',
    '',
    'Reply with one JSON object only: {"items": [{"number": "1", "question": "…", "material": "…", "answer": "…"}]}',
  ].join('\n');
}

export interface PaperItem { number: string; question: string; material: string; answer: string }

/** The reply → the items on these pages (possibly none), or null when it is not readable. */
export function parsePaperItems(reply: string): PaperItem[] | null {
  const m = String(reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { items?: unknown };
    if (!Array.isArray(j.items)) return null;
    return (j.items as Record<string, unknown>[])
      .map(i => ({ number: String(i.number ?? '').replace(/^\s*(q(uestion)?\.?\s*)/i, '').trim(), question: String(i.question ?? '').trim(), material: String(i.material ?? '').trim(), answer: String(i.answer ?? '').trim() }))
      .filter(i => i.number && (i.question || i.answer));
  } catch { return null; }
}

export function transcribePrompt(pages: number, question: string, mode: PhotoMode = 'answer', after = ''): string {
  if (mode === 'paper') return paperPrompt(pages, after);
  if (mode === 'question') return wholeQuestionPrompt(pages);
  if (mode !== 'answer') return printedPrompt(pages, mode);
  return [
    `The ${pages === 1 ? 'photo is' : `${pages} photos are`} a secondary-school student's handwritten answer to this question:`,
    '',
    question,
    '',
    'Type out exactly what the student wrote, in order' + (pages > 1 ? ', page after page' : '') + '.',
    '- Copy their words, spelling and grammar as written. Do not correct, improve, shorten or add anything.',
    '- Keep their paragraph breaks. Leave out words they crossed out.',
    '- A word you cannot read: write [?] in its place.',
    '- Leave out the printed question, page numbers, margins and anything a teacher wrote.',
    `- If there is no handwritten answer to read (a blank page, a printed page, not an answer), reply with the single word ${UNREADABLE}.`,
    '',
    'Reply with the typed-out answer only, no heading and no comment.',
  ].join('\n');
}

export type TranscriptOutcome = { ok: true; text: string; unsure: number } | { ok: false; error: string };

/** The reply → the text for the answer box, or the reason there is none. */
export function parseTranscript(reply: string, mode: PhotoMode = 'answer'): TranscriptOutcome {
  const text = String(reply ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^```[a-z]*\n?|\n?```$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text || text.replace(/[^A-Za-z]/g, '').toUpperCase() === UNREADABLE) {
    const what = mode === 'answer' ? 'a handwritten answer' : mode === 'question' ? 'a printed question' : 'printed sources';
    return { ok: false, error: `We could not find ${what} in that photo. Take it again, close up, in good light.` };
  }
  const words = text.split(/\s+/).filter(Boolean);
  const unsure = words.filter(w => w.includes('[?]')).length;
  if (words.length >= 6 && unsure / words.length > 0.3) {
    return { ok: false, error: 'Too much of the writing could not be read. Take the photo again, close up, in good light.' };
  }
  return { ok: true, text, unsure };
}
