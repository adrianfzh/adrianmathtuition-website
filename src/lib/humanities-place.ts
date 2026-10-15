// The exact mark inside a level (15 Oct 2026, Adrian: "3 to 5 out of 6 marks seems like a big range … able to give a
// tighter range? will be more helpful"). The reader settles the LEVEL (its prompt is benched; it is not touched).
// A school then picks a mark inside that level's range — so does this: once an answer is marked, ONE more short
// read (on plan) is told the settled level, that level's descriptor and its mark range (lib/humanities-marks), and
// picks where in the range the answer sits. The page shows the level's range until it is back (about a minute),
// then the one mark. Only where the range is wider than one mark. Pure.
import { markBands } from './humanities-marks';
import type { HumanitiesPayload } from './humanities-prompt';

export const PLACE_KIND = 'humanities-place';

/** The mark range of the settled level, when it is wider than one mark; else null (nothing to place). */
export function placeBand(skill: string, marks: number | null | undefined, level: number | null): { lo: number; hi: number; total: number } | null {
  if (level == null) return null;
  const bands = markBands(skill, marks);
  if (!bands || level < 1 || level > bands.length) return null;
  const [lo, hi] = bands[level - 1];
  return hi > lo ? { lo, hi, total: bands[bands.length - 1][1] } : null;
}

export function placePrompt(p: HumanitiesPayload, level: number, band: { lo: number; hi: number; total: number }): string {
  const levels = p.scheme?.levels ?? [];
  const here = levels.find(l => l.level === level)?.does ?? '';
  const next = levels.find(l => l.level === level + 1)?.does ?? null;
  const sources = (p.sources ?? []).map(s => `${s.id}${s.provenance ? ` (${s.provenance})` : ''}\n${s.text}`).join('\n\n');
  return [
    `You are an experienced Singapore secondary ${p.subject ?? 'Humanities'} examiner. This answer has already been placed at Level ${level}. Your only job: pick the exact mark inside that level, as an examiner would.`,
    '',
    `LEVEL ${level}: ${here}`,
    ...(next ? [`(The next level up, Level ${level + 1}: ${next})`] : []),
    `Level ${level} earns ${band.lo} to ${band.hi} marks, out of ${band.total}.`,
    '- The bottom of the range: the answer only just does what the level asks — thin, one point, little support.',
    '- The top of the range: it does it fully — well supported, clearly explained, close to the next level.',
    '- In between: in between.',
    '',
    'QUESTION', p.question,
    ...(sources ? ['', 'WHAT CAME WITH IT', sources] : []),
    '', "THE STUDENT'S ANSWER", p.answer,
    '',
    `Reply with one JSON object only: {"mark": <a whole number from ${band.lo} to ${band.hi}>, "why": "<under 20 words>"}`,
  ].join('\n');
}

/** The reply → a mark inside the band, or null. */
export function parsePlace(reply: string | null | undefined, band: { lo: number; hi: number }): number | null {
  const m = String(reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const n = Number((JSON.parse(m[0]) as { mark?: unknown }).mark);
    return Number.isInteger(n) && n >= band.lo && n <= band.hi ? n : null;
  } catch { return null; }
}
