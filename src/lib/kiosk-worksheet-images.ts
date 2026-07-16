// Pure helpers for the kiosk worksheet route: resolving question figure
// paths to public bucket URLs and flattening `questions.parts` jsonb into
// printable markdown. Kept out of the route file so they're unit-testable.

/* Bucket-relative path or full URL → public question_images URL.
 * Mirrors lib/bank-question-markdown.ts toStorageUrl. */
const IMG_BASE = () =>
  `${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question_images/`;

export function imgSrc(path: string): string {
  return path.startsWith('http') ? path : IMG_BASE() + path.replace(/^question_images\//, '');
}

export function isPlausibleImagePath(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length >= 6;
}

/* questions.parts jsonb → flattened display text + combined answer
 * (same shape the worksheet-builder uses). Part-level figures
 * (image_url / image_url_after) are emitted inline as markdown images
 * at their position — dropping them served figure-dependent questions
 * without their figures (e.g. Mayflower 2024 AM Q10's graph). */
export type Part = {
  text?: string | null; label?: string | null; marks?: number | null;
  answer?: string | null; subparts?: Part[] | null;
  image_url?: string | null; image_url_after?: string | null;
};

/* Working space is APPORTIONED TO THE MARKS (STYLE.md: ≈1.8 blank lines per
 * mark — a 2-mark part gets a small gap, a 6-mark question a large one),
 * rendered as an empty spacer div. No ruled lines — this is math. */
export function spaceMm(marks: number): number {
  return Math.min(54, Math.max(9, marks * 9));
}

export function flattenParts(stem: string, parts: Part[] | null): { text: string; answer: string } {
  if (!parts?.length) return { text: stem, answer: '' };
  const textLines: string[] = stem ? [stem] : [];
  const answers: string[] = [];
  const walk = (list: Part[], prefix: string) => {
    for (const p of list) {
      const label = p.label ? `${prefix}(${p.label})` : prefix;
      if (isPlausibleImagePath(p.image_url)) textLines.push(`![diagram](${imgSrc(p.image_url)})`);
      if (p.text) {
        // Marks right-aligned like a real exam paper (span floats right in print CSS),
        // followed by marks-proportional working space.
        const mk = p.marks ? ` <span class="ws-mk">[${p.marks}]</span>` : '';
        textLines.push(`**${label}** ${p.text}${mk}`);
        if (p.marks) textLines.push(`<div class="ws-sp" style="height:${spaceMm(p.marks)}mm"></div>`);
      }
      if (isPlausibleImagePath(p.image_url_after)) textLines.push(`![diagram](${imgSrc(p.image_url_after)})`);
      if (p.answer) answers.push(`${label} ${p.answer}`);
      if (p.subparts?.length) walk(p.subparts, label);
    }
  };
  walk(parts, '');
  return { text: textLines.join('\n\n'), answer: answers.join(';  ') };
}

/* Stem-level crop diagrams: image_url is a JSON array whose entries are
 * either bare paths ('question_images/<file>' / '<file>') or {url, pos}
 * objects (the 2025 EM batch, ~270 rows) — String() on the object form
 * produced '[object Object]' URLs, breaking every figure in that batch. */
export function cropUrls(imageUrl: string | null): string[] {
  if (!imageUrl) return [];
  try {
    const arr = JSON.parse(imageUrl);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((entry: unknown) => {
        const p = entry && typeof entry === 'object' ? (entry as { url?: unknown }).url : entry;
        return isPlausibleImagePath(p) ? imgSrc(p) : null;
      })
      .filter((u): u is string => u !== null);
  } catch { return []; }
}
