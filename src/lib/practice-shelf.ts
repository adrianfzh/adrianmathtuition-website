// Practice photo — serve a twin from the shelf before writing one
// (cost lever 5, Adrian 1 Oct 2026; SPEC-COMPANY §8.1 + §14 "Make once, reuse":
// "serve an existing twin on the same sub-skill first; write a new one only
// when the shelf is empty"). Pure and I/O-free; the photo route does the reads.
import { tierOf, type Tier } from './practice-tiers';

/** A verified twin filed under the photographed question's sub-skill. */
export type ShelfTwin = {
  id: string;
  twin_of: string | null;
  total_marks: number | null;
  difficulty: string | null;
  verified: boolean | null;
  school?: string | null;
  exam_type?: string | null;
  reported_at?: string | null;
  deleted_at?: string | null;
};

export type ShelfPick = { id: string; twinOf: string | null; tier: Tier; marks: number | null };

/** Stable 32-bit FNV-1a, so the tie-break is deterministic but differs per student. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * Which shelf twin to serve, or null when the shelf is empty (→ write one).
 *   1. verified only, never reported or removed
 *   2. unseen: the student has not been assigned or attempted the twin, nor its
 *      source (`seenIds` holds every question id they have met, twin or school row)
 *   3. marks closest to the photographed question's (unknown marks = no preference)
 *   4. ties broken by a hash of (seedKey + id) — deterministic, not the same for everyone
 */
export function pickShelfTwin(
  twins: ShelfTwin[],
  opts: { marks: number | null; seenIds: Iterable<string>; seedKey?: string },
): ShelfPick | null {
  const seen = new Set(opts.seenIds);
  const live = twins.filter(t =>
    t.id && t.verified === true && !t.reported_at && !t.deleted_at &&
    !seen.has(t.id) && !(t.twin_of && seen.has(t.twin_of)));
  if (!live.length) return null;
  const dist = (t: ShelfTwin): number =>
    opts.marks != null && t.total_marks != null ? Math.abs(t.total_marks - opts.marks) : 0;
  const key = opts.seedKey ?? '';
  const best = [...live].sort((a, b) =>
    dist(a) - dist(b) || hash(key + a.id) - hash(key + b.id) || (a.id < b.id ? -1 : 1))[0];
  return { id: best.id, twinOf: best.twin_of ?? null, tier: tierOf(best.difficulty) ?? 'standard', marks: best.total_marks ?? null };
}

/** The ids a student has met: every assignment's question (revoked ones never reached them) and every attempt. */
export function seenQuestionIds(
  assignments: { question_id: string | null; status?: string | null }[],
  attempts: { question_id: string | null }[],
): Set<string> {
  const s = new Set<string>();
  for (const a of assignments) if (a.question_id && a.status !== 'revoked') s.add(a.question_id);
  for (const a of attempts) if (a.question_id) s.add(a.question_id);
  return s;
}

/** The ledger `candidates` note for a served twin — the find-review reads `candidates`, so the keys stay beside `subgroup`. */
export function shelfLedgerNote(pick: ShelfPick, shelfSize: number): { shelf: { twinId: string; twinOf: string | null; marks: number | null; shelfSize: number } } {
  return { shelf: { twinId: pick.id, twinOf: pick.twinOf, marks: pick.marks, shelfSize } };
}
