// Pure request-shaping logic for POST /api/bot/worksheet — the bot's
// worksheet-on-demand endpoint. Kept out of the route so every decision that
// can silently serve the WRONG sheet (level aliasing, topic matching, the count
// cap, the per-day blob path) is unit-testable.
//
// The bot speaks in `questions.level` values ('S3_AM', 'JC2', …) while the
// worksheet machinery is keyed on the kiosk level tokens ('AM', 'JC2', …), so
// the alias map below is the seam between the two vocabularies. It is the exact
// inverse of SEED_LEVELS in lib/kiosk-pool — keep them in lock-step.
//
// Deliberately dependency-free (no next/server, no Supabase) so the whole file
// is trivially unit-testable; the route supplies the level LABEL it reads from
// KIOSK_LEVELS rather than this module importing the kiosk session helpers.

import { hashSeed } from './kiosk-draw';

export const DEFAULT_WORKSHEET_COUNT = 8;
export const MAX_WORKSHEET_COUNT = 12;

/**
 * `questions.level` value (or a kiosk level token) → kiosk level token.
 * Live level values in the bank (2026-08-22): EM, S3_EM, AM, S3_AM, JC1, JC2,
 * S1, S2. The extra keys (S4_*, JC, H1, H2) are accepted so a caller using the
 * obvious spelling gets a sheet instead of a 400.
 */
export const LEVEL_ALIASES: Record<string, string> = {
  EM: 'EM', S3_EM: 'EM', S4_EM: 'EM', E_MATH: 'EM',
  AM: 'AM', S3_AM: 'AM', S4_AM: 'AM', A_MATH: 'AM',
  JC: 'JC2', JC1: 'JC2', JC2: 'JC2', H1: 'JC2', H2: 'JC2',
  S1: 'S1', S2: 'S2',
};

/** Kiosk level token for a requested level, or null when it maps to nothing. */
export function resolveLevelKey(input: string | null | undefined): string | null {
  const k = String(input ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return LEVEL_ALIASES[k] ?? null;
}

/** Every level string the endpoint accepts — the 400 body lists these. */
export function validLevels(): string[] {
  return Object.keys(LEVEL_ALIASES);
}

/** Clamp a requested question count to 1…MAX_WORKSHEET_COUNT (default 8). */
export function clampCount(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return DEFAULT_WORKSHEET_COUNT;
  return Math.min(MAX_WORKSHEET_COUNT, Math.max(1, Math.trunc(n)));
}

/**
 * Resolve a requested topic against the level's real topic list. Exact match
 * first, then a forgiving compare (case + punctuation + spacing) so
 * "differentiation techniques" finds "Differentiation (Techniques)".
 * Returns the CANONICAL topic string — the pool query must never be run on the
 * caller's spelling.
 */
export function matchTopic(requested: string | null | undefined, available: string[]): string | null {
  const raw = String(requested ?? '').trim();
  if (!raw) return null;
  const exact = available.find((t) => t === raw);
  if (exact) return exact;
  const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const key = loose(raw);
  if (!key) return null;
  return available.find((t) => loose(t) === key) ?? null;
}

/**
 * Sheet title: 'AdrianMath Practice — A Math · Binomial Theorem'.
 * `levelLabel` is the human label (KIOSK_LEVELS[key].label), not the token —
 * a parent opening this in WhatsApp should never read "S3_AM".
 */
export function worksheetTitle(levelLabel: string, topic: string): string {
  return `AdrianMath Practice — ${levelLabel} · ${topic}`;
}

/** URL-safe slug for the blob path. */
export function slugify(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sheet';
}

/**
 * Short fingerprint of the drawn question ids. The blob path carries it so the
 * URL changes whenever the SHEET changes.
 *
 * Why it must: Vercel Blob serves an overwritten path from CDN cache for up to
 * a month. The draw is deterministic per SGT day, so a same-day repeat is
 * normally byte-identical and the cache is free correctness — but if the pool
 * gains or loses a question mid-day, the fresh response's `questionIds` would
 * describe a sheet the cached PDF no longer is. Fingerprinting the ids makes
 * that impossible: a changed draw lands on a new path.
 */
export function drawFingerprint(ids: string[]): string {
  return hashSeed(ids.join('|')).toString(36);
}

/**
 * Blob path for one sheet. Deterministic: identical inputs → identical path →
 * one overwrite (allowOverwrite, no random suffix) instead of a littered store.
 */
export function worksheetBlobPath(o: {
  date: string; levelKey: string; topic: string; tier: string | null;
  count: number; answers: boolean; questionIds: string[];
}): string {
  const parts = [
    o.levelKey.toLowerCase(),
    slugify(o.topic),
    o.tier ?? 'mixed',
    `q${o.count}`,
    o.answers ? 'ans' : 'noans',
    drawFingerprint(o.questionIds),
  ];
  return `bot-worksheets/${o.date}/${parts.join('-')}.pdf`;
}

/** Filename a bot/WhatsApp client should show for the download. */
export function worksheetFilename(levelKey: string, topic: string, date: string): string {
  return `${levelKey}-${slugify(topic)}-${date}.pdf`;
}

// ── Markdown protection ──────────────────────────────────────────────────────
// flattenParts (lib/kiosk-worksheet-images) emits three things the generic
// markdown→HTML pass would destroy: the right-aligned marks span, the
// marks-proportional working-space div, and inline figure images. Stash them
// behind alphanumeric tokens (which survive HTML-escaping and every markdown
// transform), render, then put them back.

const WS_MK = /<span class="ws-mk">[\s\S]*?<\/span>/g;
const WS_SP = /<div class="ws-sp"[^>]*><\/div>/g;
const MD_IMG = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Replace protected fragments with tokens; returns the stashed HTML. */
export function protectWorksheetHtml(md: string): { src: string; stash: string[] } {
  const stash: string[] = [];
  const keep = (html: string) => {
    stash.push(html);
    return `@@WSH${stash.length - 1}@@`;
  };
  let src = String(md ?? '');
  src = src.replace(WS_MK, (m) => keep(m));
  src = src.replace(WS_SP, (m) => keep(m));
  src = src.replace(MD_IMG, (_m, alt: string, url: string) =>
    keep(`<img class="ws-figure" src="${escAttr(url)}" alt="${escAttr(alt) || 'question diagram'}">`));
  return { src, stash };
}

/** Put the stashed fragments back after the markdown pass. */
export function restoreWorksheetHtml(html: string, stash: string[]): string {
  return String(html ?? '').replace(/@@WSH(\d+)@@/g, (m, i: string) => stash[Number(i)] ?? m);
}
