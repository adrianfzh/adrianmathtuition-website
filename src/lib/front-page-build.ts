// The marked paper's cover page ("Where your marks went") — built from ONE run.
// Extracted from /api/admin/mark-paper-pdf on 7 Sep 2026 so the student app can
// render the same cover inside the paper view (/app/marking/[id]) without
// building a PDF. Returns null when there is nothing worth fronting.
import { getSupabaseAdmin } from '@/lib/supabase';
import { analyse, worstQuestions, type LostPart } from '@/lib/paper-analysis';
import { readDiagnosis, themesFromDiagnosis } from '@/lib/sheet-diagnosis';
import { errorKindTotals } from '@/lib/error-kinds';
import { renderFrontPagePng } from '@/lib/render-front-page';
import { isUngroundedTotal } from '@/lib/paper-total-text';
import { remarkedCoverInput } from '@/lib/remark-internal';

/**
 * The front page's data: the lost parts of THIS run and nothing else. The first
 * version read the student's last 12 papers so a weakness could be told from a
 * bad day; Adrian, 2 Sep 2026: "we should just analyze that particular exam
 * paper, not across 5 papers".
 *
 * THE SHEET'S DIAGNOSIS WINS (Adrian, 2 Sep 2026: "the sheet's diagnosis should
 * drive the cover, not the cover the sheet"). When the self-study worker has
 * written its diagnosis back onto the run (`result_json.diagnosis`, via the
 * sheet-jobs `done` action), the themes are built from it, in the sheet's own
 * section order — lib/sheet-diagnosis.ts. The keyword classifier over the
 * marker's notes is the fallback for a paper with no sheet yet. The "Where the
 * marks went" question bars come from the marker's parts either way.
 *
 * Returns null — not an error — whenever there is nothing worth fronting: a
 * paper with no losses, a database hiccup. The caller then assembles exactly
 * the PDF it always did. (buildPdf's link-recovery behaviour — docs/MARKING.md —
 * is untouched by anything here.)
 */
export async function buildFrontPage(
  runId: string,
  meta: { paperName: string | null; awarded: number; max: number; studentName: string | null },
): Promise<Buffer | null> {
  const sb = getSupabaseAdmin();
  const { data: run } = await sb.from('paper_marking_runs')
    .select('id, student_name, paper_name, created_at, result_json').eq('id', runId).maybeSingle();
  if (!run) return null;

  const rows = [run as { id: string; paper_name: string | null; created_at: string; result_json: unknown }];

  const parts: LostPart[] = [];
  for (const r of rows) {
    const res = (r.result_json as { results?: unknown[] } | null)?.results;
    if (!Array.isArray(res)) continue;
    for (const q of res as Record<string, never>[]) {
      const mo = (q as { marking_output?: { parts?: Record<string, unknown>[]; meta?: { topic_detected?: unknown } } }).marking_output;
      const topic = String(mo?.meta?.topic_detected ?? '');
      for (const p of (mo?.parts ?? [])) {
        const mx = Number(p.max), aw = Number(p.awarded);
        if (!Number.isFinite(mx) || !Number.isFinite(aw) || aw >= mx) continue;
        parts.push({
          paperId: r.id, paperName: r.paper_name || 'a paper', createdAt: r.created_at,
          question: String((q as { question_number?: unknown }).question_number ?? '?'),
          label: String(p.label ?? ''), lost: mx - aw, max: mx,
          blank: p.not_attempted === true, why: String(p.error_summary ?? ''), topic,
          gap: typeof p.gap === 'string' && p.gap.trim() ? p.gap.trim() : null,
        });
      }
    }
  }
  const diagnosis = readDiagnosis(run.result_json);
  // Nothing lost anywhere: a cover page saying so would be noise on a clean script.
  if (!parts.length && !diagnosis) return null;

  // Marks lost by KIND of error, from the marker's `parts[].error_kind` labels
  // (lib/error-kinds.ts — the contract with the bot). The page hides the row
  // when nothing is labelled, so a run from before the labels is unchanged;
  // and a bad results shape costs the row, never the cover.
  let errorKinds = null;
  try {
    errorKinds = errorKindTotals((run.result_json as { results?: unknown } | null)?.results);
  } catch (e) { console.warn('[front-page] error kinds skipped:', (e as Error).message); }

  // A re-marked paper (10 Sep 2026): the run keeps previous_results from the
  // enqueue, queue.remark_pages names the pages (0-based), previous_marked_at
  // the moment. The cover wears the badge and points at the purple ink.
  // …UNLESS the student never received the marking it replaces (11 Sep 2026,
  // Gavin Woon: "it will be the first time gavin sees this, remark is just
  // internal"). The bot stamps `remark_internal` on the run — lib/remark-internal.ts
  // — and this cover then reads as the paper's first: no badge, no purple line.
  const rjAny = (run.result_json && typeof run.result_json === 'object') ? run.result_json as { previous_results?: unknown; results?: unknown } : null;
  const remarked = remarkedCoverInput(rjAny, () => changedPartCount(rjAny?.previous_results, rjAny?.results));

  // 🕳 MARKED WITHOUT THE QUESTION PAPER (Adrian, 10 Sep 2026: "what does the
  // system do if there are no questions or mark scheme available?"). Isabelle's
  // AM TYS 2025 P2 had nothing to ground on, so the marker guessed every
  // allocation to 73 marks and this cover printed 68/90 — the registry's number,
  // not the paper's. `ungroundedFrontPage` reads the run's own record of that
  // (grounding.source + totals) and the page then shows what was actually seen.
  const ungrounded = ungroundedFrontPage(run.result_json);

  return renderFrontPagePng({
    remarked,
    ungrounded,
    errorKinds,
    studentName: meta.studentName || run.student_name,
    paperName: meta.paperName || run.paper_name,
    markedOn: null,
    awarded: meta.awarded, max: meta.max,
    papersRead: 1,
    themes: diagnosis ? themesFromDiagnosis(diagnosis, run.paper_name || 'this paper') : analyse(parts, runId),
    themesSource: diagnosis ? 'sheet' : 'marker',
    worstQuestions: worstQuestions(parts, runId),
  });
}

/**
 * The cover's `ungrounded` input, read off a run's `result_json`, or null.
 *
 * Two facts decide it and both live on the run: `grounding.source` (null when no
 * rung of the ladder answered — no attached paper, no stored scheme, no bank
 * rows) and `totals` (`max_source` says where the denominator came from,
 * `counted_max` how many marks the marker could actually locate). The rule
 * itself is `isUngroundedTotal` in lib/paper-total-text.ts, shared with the
 * PAPER TOTAL strip so the cover and page 1 can never say different things.
 *
 * Pure; a run whose shape it cannot read answers null, which is the old cover.
 */
export function ungroundedFrontPage(resultJson: unknown): { countedMax: number } | null {
  const rj = (resultJson && typeof resultJson === 'object' ? resultJson : {}) as {
    grounding?: { source?: unknown } | null;
    totals?: { max?: unknown; counted_max?: unknown; max_source?: unknown } | null;
  };
  const t = rj.totals || {};
  const countedMax = Number(t.counted_max);
  const ok = isUngroundedTotal({
    groundingSource: typeof rj.grounding?.source === 'string' ? rj.grounding.source : null,
    maxSource: typeof t.max_source === 'string' ? t.max_source : null,
    countedMax,
    max: Number(t.max),
  });
  return ok ? { countedMax } : null;
}

/**
 * How many parts changed their awarded mark between the marking that stood
 * before a re-mark and the one that stands now — the count behind the cover's
 * "in purple" line. The bot inks a part purple only when its AWARDED mark moved
 * (lib/page-remark partDiff), so a redraw that changed no mark must not promise
 * purple ink. Keyed by question number + part label; a part missing on either
 * side counts as changed. Pure; null when either side is unreadable.
 */
export function changedPartCount(previous: unknown, current: unknown): number | null {
  const collect = (rows: unknown): Map<string, number> | null => {
    if (!Array.isArray(rows)) return null;
    const m = new Map<string, number>();
    for (const r of rows as Array<Record<string, unknown>>) {
      if (!r || typeof r !== 'object' || (r as { added_by_audit?: unknown }).added_by_audit) continue;
      const q = String(r.question_number ?? '');
      const parts = (r.marking as { parts?: unknown } | undefined)?.parts;
      if (!Array.isArray(parts)) continue;
      for (const p of parts as Array<Record<string, unknown>>) {
        const key = `${q}|${String(p?.label ?? '')}`;
        const aw = Number(p?.awarded);
        if (!Number.isFinite(aw)) continue;
        m.set(key, Math.max(m.get(key) ?? -1, aw));
      }
    }
    return m;
  };
  const a = collect(previous), b = collect(current);
  if (!a || !b) return null;
  let n = 0;
  for (const [k, v] of a) if (!b.has(k) || b.get(k) !== v) n++;
  for (const k of b.keys()) if (!a.has(k)) n++;
  return n;
}
