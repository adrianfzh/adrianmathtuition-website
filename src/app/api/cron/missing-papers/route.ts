// GET /api/cron/missing-papers — the weekly "papers we don't hold" line
// (Vercel cron, Monday 08:00 SGT).
//
// Adrian, 11 Sep 2026: "Papers in on day one … A weekly line listing papers
// students named that we do not hold would close the loop." Every marking is
// grounded on the real paper when the bot holds it (docs/MARKING.md § When
// the paper is missing, SPEC-PAPER-MATCH.md); when it doesn't, the run carries
// either the bot's own `paper_match.ungrounded` stamp or — an older run — a
// null `grounding.source` with reads that came back `question_found:false`.
// Since 10 Sep a paper dropped into Dropbox › Extraction Inbox files itself
// for the marker and re-marks those runs on its own
// (docs/EXTRACTION-QUEUE.md §1b–1c); this cron is the closing-the-loop nudge
// for the papers nobody has dropped in yet.
//
// The heavy lifting (grouping, wording, the `held` key) is the pure
// `src/lib/missing-papers.ts`, unit-tested. This route only: reads the last
// 7 days of runs, checks each candidate paper against `paper_library`
// (kind questions/solutions/combined) and the bank `questions` table, sends
// one Telegram line when there's anything to report, and stamps `job_runs`
// every run (empty or not) so a dead cron alarms by absence.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { runPaperFields } from '@/lib/extraction-inbox';
import { groupMissingPapers, missingPapersLine, missingPaperKey, type MissingPaperRun, type MissingPaperGroup } from '@/lib/missing-papers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WINDOW_DAYS = 7;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (req.headers.get('x-vercel-cron')) return true;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return !!((cron && safeEqual(auth, `Bearer ${cron}`)) || (admin && safeEqual(auth, `Bearer ${admin}`)));
}

/**
 * Whether a candidate paper is already held, checked the same way for both
 * sources: fetch rows narrowed to (school, year, paper) — cheap, a handful of
 * rows — and let `missingPaperKey` do the level-family folding per row rather
 * than trying to pre-guess which literal level values belong to the family.
 */
async function isHeld(sb: ReturnType<typeof getSupabaseAdmin>, group: MissingPaperGroup, fields: { school: string; year: number; paper: string }): Promise<boolean> {
  const paperDigits = fields.paper.replace(/[^0-9]/g, '');
  const [lib, bank] = await Promise.all([
    sb.from('paper_library')
      .select('level')
      .in('kind', ['questions', 'solutions', 'combined'])
      .ilike('school', fields.school)
      .eq('year', fields.year)
      .eq('paper', `p${paperDigits}`)
      .limit(50),
    sb.from('questions')
      .select('level')
      .ilike('school', fields.school)
      .eq('year', fields.year)
      .eq('paper', paperDigits)
      .is('deleted_at', null)
      .limit(50),
  ]);
  const rows = [...(lib.data ?? []), ...(bank.data ?? [])] as Array<{ level: string | null }>;
  return rows.some((r) => r.level && missingPaperKey({ ...fields, level: r.level }) === group.key);
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  const now = new Date();
  const since = new Date(now.getTime() - (WINDOW_DAYS + 1) * 86_400_000).toISOString(); // a day of slack; groupMissingPapers applies the real cut

  try {
    const { data, error } = await sb
      .from('paper_marking_runs')
      .select('id, paper_name, student_name, created_at, result_json')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw new Error(`runs: ${error.message}`);

    // Pass 1: group with nothing held, so every candidate paper surfaces —
    // `held` is checked per-candidate below (a handful of DB round-trips, not
    // a full-table scan of paper_library/questions).
    const candidates = groupMissingPapers((data ?? []) as MissingPaperRun[], new Set(), { now, windowDays: WINDOW_DAYS });

    const held = new Set<string>();
    for (const g of candidates) {
      // Any run in the group is a valid representative for the query — every
      // run in it shares the same `missingPaperKey`, by construction.
      const sample = (data ?? []).find((r) => g.runIds.includes(r.id));
      const rj = (sample && sample.result_json && typeof sample.result_json === 'object' ? sample.result_json : {}) as Record<string, unknown>;
      const pm = (rj.paper_match && typeof rj.paper_match === 'object' ? rj.paper_match : {}) as Record<string, unknown>;
      const fields = runPaperFields(pm as Parameters<typeof runPaperFields>[0]);
      if (!fields) continue;
      if (await isHeld(sb, g, fields).catch(() => false)) held.add(g.key);
    }

    const groups = candidates.filter((g) => !held.has(g.key));
    const line = missingPapersLine(groups);
    if (line) await sendTelegram(line, 'marking').catch(() => {});

    const summary = groups.length
      ? `${groups.length} paper${groups.length === 1 ? '' : 's'} missing, ${groups.reduce((n, g) => n + g.count, 0)} hand-in${groups.reduce((n, g) => n + g.count, 0) === 1 ? '' : 's'}`
      : 'none missing this week';
    await logJobRun('missing-papers', true, summary).catch(() => {});
    return NextResponse.json({ ok: true, sent: !!line, summary, groups });
  } catch (e) {
    await logJobRun('missing-papers', false, (e as Error).message.slice(0, 200)).catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
