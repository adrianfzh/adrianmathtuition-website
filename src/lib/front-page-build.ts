// The marked paper's cover page ("Where your marks went") — built from ONE run.
// Extracted from /api/admin/mark-paper-pdf on 7 Sep 2026 so the student app can
// render the same cover inside the paper view (/app/marking/[id]) without
// building a PDF. Returns null when there is nothing worth fronting.
import { getSupabaseAdmin } from '@/lib/supabase';
import { analyse, worstQuestions, type LostPart } from '@/lib/paper-analysis';
import { readDiagnosis, themesFromDiagnosis } from '@/lib/sheet-diagnosis';
import { errorKindTotals } from '@/lib/error-kinds';
import { renderFrontPagePng } from '@/lib/render-front-page';

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

  return renderFrontPagePng({
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
