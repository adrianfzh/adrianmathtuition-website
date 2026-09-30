// /api/admin/calibration — the numbers behind /admin/calibration.
//
// GET [?subject=] [?truth=seeded|human] → { rows, stats, limit, generatedAt }
//   truth=seeded = only the science bench's seeded scripts (truth by construction,
//   SPEC-SCIENCE-BENCH §1); truth=human = everything else; absent = all rows
//   rows  = the latest 200 calibration_results, newest first (per_question included)
//   stats = lib/calibration-stats.ts over THOSE rows — per subject: papers, share
//           within the ±2 gate, mean |Δ|, question agreement, over/under shares,
//           8-week trend, latest prompt version, and the gate verdict
//           (≥10 papers AND ≥90% within ±2 — the spec's 10–15 script protocol).
//
// READ-ONLY. Rows are written by the bot repo's scripts/eval-mark-model.js
// (--truth … --save); nothing on the website inserts or edits them. The table
// has RLS on with no policies, so this goes through the service-role client —
// the anon client would see an empty table and the page would read as "no
// runs yet" forever. Stats are computed over the same window the table shows
// so the two can never disagree.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { calibrationStats, type CalibrationRow } from '@/lib/calibration-stats';
import { isMarkSubject } from '@/lib/mark-subjects';

export const runtime = 'nodejs';

const LIMIT = 200;
const COLUMNS =
  'id, created_at, run_id, subject, paper_name, truth_source, truth_label, model, prompt_version, ' +
  'truth_awarded, truth_max, ai_awarded, ai_max, abs_delta, within_gate, questions_total, questions_agree, per_question, notes';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const subject = req.nextUrl.searchParams.get('subject') || '';
  if (subject && !isMarkSubject(subject)) {
    return NextResponse.json({ error: `unknown subject "${subject}"` }, { status: 400 });
  }

  const truth = req.nextUrl.searchParams.get('truth') || '';
  if (truth && truth !== 'seeded' && truth !== 'human') {
    return NextResponse.json({ error: `unknown truth "${truth}"` }, { status: 400 });
  }

  let query = getSupabaseAdmin()
    .from('calibration_results')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (subject) query = query.eq('subject', subject);
  if (truth === 'seeded') query = query.eq('truth_source', 'seeded');
  if (truth === 'human') query = query.neq('truth_source', 'seeded');

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as CalibrationRow[];
  const now = new Date();
  return NextResponse.json({
    rows,
    stats: calibrationStats(rows, now),
    limit: LIMIT,
    generatedAt: now.toISOString(),
  });
}
