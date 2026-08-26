// "Print a paper" — pure helpers for the student self-serve printable papers
// (SPEC-PRINT-PAPER.md). Week math, QB→renderer markdown flattening, pool
// scoping and weak-topic ranking live here so they stay unit-testable; all I/O
// stays in the /api/portal/print-paper routes.
//
// questionMarkdown / answerMarkdown / storageUrl started life inside
// /api/admin/prelim-builder/export and moved here 2026-08-26 so the student
// print routes and the admin export render papers identically (the admin route
// now imports them from here).

import type { TopicMastery } from './mastery';

/** Papers a student may generate per SGT week (Monday-anchored). Cost brake —
 * Puppeteer renders + figure bandwidth — and it keeps each paper meaningful. */
export const WEEKLY_PRINT_CAP = 2;

/** Questions on a topics/weak-spots sheet. */
export const DEFAULT_QUESTION_COUNT = 8;
export const MAX_QUESTION_COUNT = 15;
export const MAX_TOPICS_PER_PAPER = 4;

/** UTC ISO timestamp of the most recent Monday 00:00 in Singapore (UTC+8, no
 * DST — same shifted-clock trick as portal-submit-limit's sgtStartOfDayIso). */
export function sgtStartOfWeekIso(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  shifted.setUTCHours(0, 0, 0, 0);
  // getUTCDay: Sunday=0 … Monday=1. Roll back to the week's Monday.
  const back = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - back);
  return new Date(shifted.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

/** One pre-registered question on a generated paper (ordered). */
export interface PrintQuestionRef {
  id: string;
  pos: number;
  marks: number;
}

/** Portal QB level key → kiosk_pool RPC scope. Mirrors lib/kiosk-session's
 * KIOSK_LEVELS groupings (O-Level tokens include the Sec-3 bank) and
 * lib/qb-levels' bankScope sub-group keys, so the topics a student saw in the
 * picker and the pool the draw runs over stay the same universe. */
export const PRINT_POOL_SCOPE: Record<string, { tagLevels: string[]; topicsKey: string }> = {
  EM: { tagLevels: ['EM', 'S3_EM'], topicsKey: 'EM' },
  AM: { tagLevels: ['AM', 'S3_AM'], topicsKey: 'AM' },
  S3_EM: { tagLevels: ['S3_EM'], topicsKey: 'EM' },
  S3_AM: { tagLevels: ['S3_AM'], topicsKey: 'AM' },
  JC1: { tagLevels: ['JC', 'JC1', 'JC2'], topicsKey: 'JC' },
  JC2: { tagLevels: ['JC', 'JC1', 'JC2'], topicsKey: 'JC' },
  S1: { tagLevels: ['S1'], topicsKey: 'S1' },
  S2: { tagLevels: ['S2'], topicsKey: 'S2' },
};

/** Mock papers exist only where data/paper-blueprints.json has a blueprint. */
export const MOCK_LEVELS = ['EM', 'AM'] as const;

/** Weakest first: weak < shaky < solid, then ascending score. Topics outside
 * `available` (nothing servable in the pool) are dropped. */
export function rankWeakTopics(
  mastery: TopicMastery[],
  available: Set<string>,
  max: number = MAX_TOPICS_PER_PAPER,
): string[] {
  const stateRank = { weak: 0, shaky: 1, solid: 2 } as const;
  return mastery
    .filter(m => available.has(m.topic))
    .sort((a, b) => (stateRank[a.state] - stateRank[b.state]) || (a.score - b.score))
    .slice(0, max)
    .map(m => m.topic);
}

// ---- QB row → renderer markdown (shared with /api/admin/prelim-builder/export) ----

export interface QbPartRow {
  label?: string;
  text?: string;
  marks?: number;
  answer?: string;
  subparts?: QbPartRow[];
}

export interface QbPrintRow {
  id: string;
  question_text: string | null;
  total_marks: number;
  parts: QbPartRow[] | null;
  answer: string | null;
  has_image: boolean | null;
  image_url: string | null;
}

/** First image path out of a bare path or JSON-encoded array, as a public
 * question_images storage URL. */
export function storageUrl(raw: string | null): string | null {
  if (!raw) return null;
  let path = raw;
  if (path.startsWith('[')) {
    try {
      const arr = JSON.parse(path);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      path = String(arr[0]);
    } catch {
      return null;
    }
  }
  path = path.replace(/^question_images\//, '');
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/question_images/${path}`;
}

/** Flatten stem + parts (+subparts) into the markdown the renderer expects. */
export function questionMarkdown(q: QbPrintRow): string {
  const chunks: string[] = [];
  if (q.question_text?.trim()) chunks.push(q.question_text.trim());
  for (const p of q.parts ?? []) {
    const label = p.label ? `(${p.label}) ` : '';
    if (p.subparts?.length) {
      if (p.text?.trim() || label) chunks.push(`${label}${(p.text ?? '').trim()}`.trim());
      for (const s of p.subparts) {
        const sm = s.marks ? `  [${s.marks}]` : '';
        chunks.push(`(${p.label ?? ''})(${s.label ?? ''}) ${(s.text ?? '').trim()}${sm}`);
      }
    } else {
      const marks = p.marks ? `  [${p.marks}]` : '';
      chunks.push(`${label}${(p.text ?? '').trim()}${marks}`.trim());
    }
  }
  return chunks.filter(Boolean).join('\n\n');
}

/** Final answers only — top-level `answer`, else rolled up from parts. */
export function answerMarkdown(q: QbPrintRow): string {
  if (q.answer?.trim()) return q.answer.trim();
  const bits: string[] = [];
  for (const p of q.parts ?? []) {
    if (p.answer?.trim()) bits.push(`(${p.label ?? '?'}) ${p.answer.trim()}`);
    for (const s of p.subparts ?? []) {
      if (s.answer?.trim()) bits.push(`(${p.label ?? '?'})(${s.label ?? '?'}) ${s.answer.trim()}`);
    }
  }
  return bits.join('  ');
}
