// A handwritten humanities answer, by photo (15 Oct 2026, Adrian: "build let students send photo of a
// handwritten answer"). The photo is only TYPED OUT here: the words come back to the answer box, the
// student checks them against the page, and the ordinary hand-in (lib/humanities-submit) marks the text.
// So the marking, its levels and its bench are unchanged, and no photo is kept (the same rule as the
// practice photo: "no student photos at rest"). Pure helpers; the call itself is in the route.
import { SONNET_55 } from './claude-models';

/** Pages one answer may span. */
export const MAX_PHOTO_PAGES = 4;
/** Photos a student may have typed out per Singapore day (a retake counts). */
export const DAILY_PHOTO_CAP = 30;
/** The reader for handwriting. A plain read of a page, so the mid-size model. */
export const PHOTO_READ_MODEL = process.env.HUMANITIES_PHOTO_MODEL || SONNET_55;

export const UNREADABLE = 'UNREADABLE';

export function transcribePrompt(pages: number, question: string): string {
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
export function parseTranscript(reply: string): TranscriptOutcome {
  const text = String(reply ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^```[a-z]*\n?|\n?```$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text || text.replace(/[^A-Za-z]/g, '').toUpperCase() === UNREADABLE) {
    return { ok: false, error: 'We could not find a handwritten answer in that photo. Take it again, close up, in good light.' };
  }
  const words = text.split(/\s+/).filter(Boolean);
  const unsure = words.filter(w => w.includes('[?]')).length;
  if (words.length >= 6 && unsure / words.length > 0.3) {
    return { ok: false, error: 'Too much of the writing could not be read. Take the photo again, close up, in good light.' };
  }
  return { ok: true, text, unsure };
}
