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
  return requireClean ? { blocked, requireClean: true, clean } : { blocked };
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
  try {
    const supa = getSupabaseAdmin();
    for (let i = 0; i < ids.length; i += 200) {
      let q = supa.from('figure_flags').select('path, status')
        .eq('kind', 'solution').in('question_id', ids.slice(i, i + 200));
      if (!requireClean) q = q.in('status', ['open', 'held']); // deny-list needs the blocking rows only
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as SolutionFlagRow[]));
    }
  } catch (e) {
    console.warn(
      `[solution-image-gate] figure_flags read failed — ${requireClean ? 'withholding every solution image' : 'serving unfiltered'}:`,
      (e as Error).message,
    );
    return requireClean ? closedGate() : openGate();
  }
  return gateFromFlagRows(rows, requireClean);
}
