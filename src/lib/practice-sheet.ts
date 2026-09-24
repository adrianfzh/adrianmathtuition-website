// 📷 Practice sheets from photos — the pure pieces (SPEC-PRACTICE-PHOTO.md §14,
// 24 Sep 2026). A student sends up to MAX_SHEET_PHOTOS photos and gets ONE
// sheet a day: for every photo a short taught part, a question like it and a
// turned-around variation (QUESTIONS_PER_PHOTO). A single photo may ask for a
// worked example. The sheet is written by the sheet worker (a sheet_jobs row of
// kind 'photo-sheet', no run) and handed back as a worksheet on the Practice
// list, which the student hands in for marking like a Practice Again sheet.
//
// Adrian, 24 Sep 2026: "allow students to upload multiple photos then provide
// them with a worksheet pdf instead? … 2 practice questions will be provided
// for each photo they sent - one similar question and another one with slight
// variation … limit to 10 questions per day".
export const MAX_SHEET_PHOTOS = 5;
export const QUESTIONS_PER_PHOTO = 2;
/** Sheets a student may have per Singapore day (the waiting list's allowance). */
export const PHOTO_SHEET_ALLOWANCE = 1;
/** Photos over this many bytes (as a data URL) are refused — the request body must stay under Vercel's 4.5 MB. */
export const MAX_PHOTO_DATA_URL_CHARS = 1_200_000;

export type SheetRequest = { photos: string[]; level: string | null; workedExample: boolean };
export type ParsedSheetBody = { ok: true; value: SheetRequest } | { ok: false; status: number; error: string };

const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+=*)$/;

export function parseSheetBody(raw: unknown): ParsedSheetBody {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(b.photos) ? b.photos : [];
  const photos: string[] = [];
  for (const p of list) {
    const s = typeof p === 'string' ? p
      : p && typeof p === 'object' && typeof (p as { imageBase64?: unknown }).imageBase64 === 'string' ? (p as { imageBase64: string }).imageBase64
      : '';
    if (s) photos.push(s);
  }
  if (!photos.length) return { ok: false, status: 400, error: 'Add at least one photo.' };
  if (photos.length > MAX_SHEET_PHOTOS) return { ok: false, status: 400, error: `Up to ${MAX_SHEET_PHOTOS} photos a sheet.` };
  for (let i = 0; i < photos.length; i++) {
    if (photos[i].length > MAX_PHOTO_DATA_URL_CHARS) return { ok: false, status: 413, error: `Photo ${i + 1} is too large — retake it a little further away.` };
    if (!DATA_URL_RE.test(photos[i])) return { ok: false, status: 400, error: `Photo ${i + 1} could not be read — try again.` };
  }
  const level = typeof b.level === 'string' && b.level.trim() ? b.level.trim().slice(0, 20) : null;
  const workedExample = photos.length === 1 && b.workedExample === true;
  return { ok: true, value: { photos, level, workedExample } };
}

/** The bytes and extension behind a data URL. */
export function dataUrlBytes(s: string): { ext: string; contentType: string; bytes: Buffer } | null {
  const m = DATA_URL_RE.exec(s);
  if (!m) return null;
  const kind = m[1] === 'jpg' ? 'jpeg' : m[1];
  return { ext: kind === 'jpeg' ? 'jpg' : kind, contentType: `image/${kind}`, bytes: Buffer.from(m[2], 'base64') };
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Practice sheet · 24 Sep' — the assignment title and the job's paper_name. */
export function sheetTitle(dayISO: string): string {
  const [, m, d] = dayISO.split('-').map(Number);
  return `Practice sheet · ${d} ${MONTH[(m || 1) - 1]}`;
}

/** The topics the photos were filed under, deduped, for the assignment's topic line. */
export function photoTopics(photos: { subgroup: { topic: string | null; name: string } | null }[]): string | null {
  const seen = new Set<string>();
  for (const p of photos) {
    const t = p.subgroup?.topic?.trim();
    if (t) seen.add(t);
  }
  const s = Array.from(seen).join(' · ');
  return s ? s.slice(0, 80) : null;
}

/** What the app says once the request is in. `dayWord` is 'today' | 'tomorrow' | 'Thursday' | '3 Oct'. */
export function sheetSentMessage(input: { waits: boolean; dayWord: string; photos: number; workedExample: boolean }): string {
  const n = input.photos * QUESTIONS_PER_PHOTO;
  const what = `${n} question${n === 1 ? '' : 's'}${input.workedExample ? ' and a worked example' : ''}`;
  return input.waits
    ? `Queued for ${input.dayWord} — your sheet (${what}) is written overnight and ready by morning.`
    : `Writing your sheet now — ${what}. It usually takes about an hour; you will get a notification.`;
}
