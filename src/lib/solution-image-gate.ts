// Solution-image serving gate (Adrian, 3 Sep 2026: "never ship another
// company's watermark").
//
// Question figures already fail CLOSED — kiosk-pool.figureServable() serves a
// scanned figure only when image_watermark_status='clean', and the serving
// RPCs skip any question with an open figure_flags row. Solution images
// (questions.solution_images[], parts[].solution_image and sub-part
// solution_image, plus {{IMG:…}} inside solution text) had NO gate:
// bank-question-markdown rendered them unconditionally, so a solution scan
// carrying another school's or tuition centre's branding showed the moment a
// student revealed the solution. This module is the containment that makes
// the watermark classification pass's verdicts bite.
//
// Ledger: figure_flags rows with kind='solution' (migration figure_flags_kind,
// 2026-09-03). The row's `path` is the bucket path of the offending image,
// `question_id` the question it hangs off. Such rows are NOT a redraw queue —
// /admin/figures-bank, the 🚩 highlights and the claim protocol all filter
// kind='question' (docs/FIGURES.md §3). The serving RPCs' open-flag exclusion
// is kind-agnostic on purpose: an open flag of EITHER kind keeps the whole
// question out of the selection pools (the intended stopgap).
//
// Two modes, one switch (a flag in the lib/portal-beta.ts style — flip in one
// place, no env var):
//   SOLUTION_IMAGES_REQUIRE_CLEAN = false (today — deny-list): every solution
//     image renders EXCEPT the paths on an open kind='solution' flag.
//   SOLUTION_IMAGES_REQUIRE_CLEAN = true (allow-list, dormant): a solution
//     image renders ONLY when its path sits on a kind='solution' flag whose
//     status is 'fixed' — i.e. the classification pass (or Adrian) has looked
//     at it and passed it. Everything unclassified disappears. Flip once the
//     pass has covered the bank; before that the allow-list would blank every
//     honest diagram too. (Science-bank ids have no rows in this ledger, so
//     their solution images would ALL be withheld under the allow-list.)
//
// Outage posture — fail CLOSED in the sense that matters for each mode. With
// the allow-list on, a failed read returns a gate with an EMPTY clean set:
// nothing renders, because "we could not check" must never become "show it".
// With the deny-list on (today), a failed read returns an OPEN gate and logs:
// the deny-list's job is containment of KNOWN bad images, and blanking every
// solution diagram in the bank on a transient Supabase hiccup would punish
// students for an outage. Revisit if the deny-list ever grows past a handful
// of rows — at that point a failed read should probably block too.
//
// DB access lives HERE and only here; bank-question-markdown stays pure and
// merely consumes the gate. The builders below are pure and unit-tested.
import { getSupabaseAdmin } from './supabase';
import { normaliseImagePath, type SolutionImageGate } from './bank-question-markdown';

export type { SolutionImageGate };

export const SOLUTION_IMAGES_REQUIRE_CLEAN = false;

/**
 * Levels whose solution images the classification pass has covered (3 Sep 2026:
 * every Sec solution image was judged — 520 clean, 155 flagged). A question at
 * any OTHER level is served on the allow-list until its level is judged, whatever
 * the global switch says: "There must be no watermark images — important"
 * (Adrian, 3 Sep 2026), and /app/practice IS open to students during the
 * marking-only beta. Add a level here only when its judge pass has landed.
 */
// Exactly the levels in the Sec pass's build sets (build/set.json + build2/set.json,
// 3 Sep 2026): AM 268 · EM 194 · EM_NA 75 · S3_EM 94 · S1 79 · S2 26 · S3_AM 19 ·
// S3_EM_NT 3 · AM_NA 3 images. Not a guess at "Sec" — the set the judge saw.
// JC judge pass, 3 Sep 2026 (jc/DONE-jc.md): 2,555 images judged by eye on the
// 244–255 stretch — 2,355 clean, 187 stamped + 13 unsure → 200 held. JC1 · JC2 ·
// JC2_H1 are therefore judged; S3_EM_NA has 1,491 live questions and zero
// solution images (vacuously judged).
export const JUDGED_SOLUTION_LEVELS: ReadonlySet<string> = new Set([
  'AM', 'EM', 'EM_NA', 'AM_NA', 'S1', 'S2', 'S3_EM', 'S3_AM', 'S3_EM_NT', 'S3_EM_NA',
  'JC1', 'JC2', 'JC2_H1',
]);
export function solutionImagesJudgedFor(level: string | null | undefined): boolean {
  return !!level && JUDGED_SOLUTION_LEVELS.has(String(level).trim().toUpperCase());
}

/** A figure_flags row of kind='solution', as the gate needs it. */
// STATUS VALUES FOR SOLUTION ROWS (3 Sep 2026, agreed with the figure-repair
// session): use `held`, not `open`, when flagging a stamped solution image. The
// three serving RPCs exclude a question on ANY figure_flags row with
// status='open' (no kind filter), so an `open` solution row would pull the whole
// question out of practice/kiosk pools — far blunter than hiding one image, and
// it silently shrinks the pool. `held` is invisible to the pools and blocks
// only here, in the render gate. `open` is still honoured (blocked) for safety;
// `fixed` = cleaned, which the allow-list treats as clean.
export type SolutionFlagRow = { path: string; status: string };

/** Everything renders — "nothing is flagged", and the deny-list's outage posture. */
export function openGate(): SolutionImageGate {
  return { blocked: new Set() };
}

/** Nothing renders — the allow-list's outage posture (an empty clean set). */
export function closedGate(): SolutionImageGate {
  return { blocked: new Set(), requireClean: true, clean: new Set() };
}

/**
 * Pure: flag rows → gate. Open rows block; in allow-list mode 'fixed' rows
 * are the clean set. Paths are normalised so a row spelt
 * `question_images/x.png` still matches a part spelt `x.png` (or the full
 * public URL). `path` is the table's primary key, so no path is ever both.
 */
export function gateFromFlagRows(
  rows: readonly SolutionFlagRow[],
  requireClean: boolean = SOLUTION_IMAGES_REQUIRE_CLEAN,
  unjudgedIds: readonly string[] = [],
): SolutionImageGate {
  const blocked = new Set<string>();
  const clean = new Set<string>();
  for (const r of rows) {
    if (!r || typeof r.path !== 'string') continue;
    const p = normaliseImagePath(r.path);
    if (!p) continue;
    if (r.status === 'open' || r.status === 'held') blocked.add(p);
    else if (r.status === 'fixed') clean.add(p);
  }
  const unjudged = new Set(unjudgedIds.filter(Boolean));
  const base: SolutionImageGate = requireClean ? { blocked, requireClean: true, clean } : { blocked };
  // The clean set rides along whenever some question is unjudged: it is what
  // solutionMarkdown lets through for those questions.
  return unjudged.size ? { ...base, clean, unjudged } : base;
}

/**
 * The gate for one solution reveal (or one admin preview): the kind='solution'
 * flags on these questions, one query per 200 ids. Never throws — see the
 * header for what a failed read returns in each mode.
 */
export async function solutionImageGateFor(
  questionIds: readonly string[],
  requireClean: boolean = SOLUTION_IMAGES_REQUIRE_CLEAN,
): Promise<SolutionImageGate> {
  const ids = [...new Set(questionIds.filter((id) => typeof id === 'string' && id))];
  if (!ids.length) return requireClean ? closedGate() : openGate();
  const rows: SolutionFlagRow[] = [];
  // Which of these questions sit at an unjudged level. Fail CLOSED here even in
  // deny-list mode: if the levels cannot be read, every id is treated as unjudged
  // — "we could not check" must never become "show it" for images nobody has
  // looked at. (Known-bad containment below keeps its own outage posture.)
  let unjudged: string[] = ids;
  try {
    const supa = getSupabaseAdmin();
    const judged = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supa.from('questions').select('id, level').in('id', ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as { id: string; level: string | null }[]) if (solutionImagesJudgedFor(r.level)) judged.add(r.id);
    }
    unjudged = ids.filter((id) => !judged.has(id));
  } catch (e) {
    console.warn('[solution-image-gate] level read failed — treating every question as unjudged:', (e as Error).message);
  }
  try {
    const supa = getSupabaseAdmin();
    for (let i = 0; i < ids.length; i += 200) {
      let q = supa.from('figure_flags').select('path, status')
        .eq('kind', 'solution').in('question_id', ids.slice(i, i + 200));
      // Deny-list mode needs only the blocking rows — unless some question here
      // is unjudged, whose `fixed` rows are the only thing it may render.
      if (!requireClean && !unjudged.length) q = q.in('status', ['open', 'held']);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as SolutionFlagRow[]));
    }
  } catch (e) {
    console.warn(
      `[solution-image-gate] figure_flags read failed — ${requireClean ? 'withholding every solution image' : 'serving unfiltered'}:`,
      (e as Error).message,
    );
    if (requireClean) return closedGate();
    // Deny-list outage: known-bad rows unavailable, but unjudged questions still
    // render nothing (empty clean set), which is the safe half.
    return gateFromFlagRows([], false, unjudged);
  }
  return gateFromFlagRows(rows, requireClean, unjudged);
}
