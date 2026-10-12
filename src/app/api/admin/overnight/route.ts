// /api/admin/overnight — what /admin/overnight shows (12 Oct 2026, Adrian: "build the overnight page").
//
// GET  → open proposals (the bot's GET /api/internal/proposals; GitHub only as a fallback), the newest Ship/Change/Drop request per
//        proposal, last night's line per night job, seven days per job, and the jobs that
//        failed or went missing (lib/job-health). `?count=1` → just { waiting } for the
//        dashboard's link.
// POST { slug, action: 'ship'|'change'|'drop', note?, dryRun? } → one `proposal_requests`
//        row, the same row the Telegram button writes (lib/overnight proposalRequestRow), then
//        the Fly worker is woken the way the bot wakes it. A Ship press SHIPS — `dryRun: true`
//        checks everything and returns the row without writing it.
// Admin session or Bearer ADMIN_PASSWORD.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { latestJobRuns } from '@/lib/job-log';
import { staleJobs } from '@/lib/job-health';
import {
  NIGHT_JOBS, checkTap, jobName, lastNight, latestRequests, proposalRequestRow, staleWords, weekHistory,
  type RequestState, type RunRow,
} from '@/lib/overnight';
import { readOpenProposals, wakeWorker } from '@/lib/overnight-io';
import { ANON_IDENTITY, LOGIN_FAILED_KIND, failedLoginAccounts, type TroubleEvent } from '@/lib/login-trouble';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function weekRows(now: number): Promise<RunRow[]> {
  const since = new Date(now - 8 * 86_400_000).toISOString();
  const out: RunRow[] = [];
  const PAGE = 1000;   // PostgREST clips a page at 1000 rows
  for (let page = 0; page < 6; page++) {
    const { data, error } = await getSupabaseAdmin().from('job_runs')
      .select('job, ran_at, ok, summary, meta')
      .in('job', NIGHT_JOBS.map((j) => j.job))
      .gte('ran_at', since)
      .order('ran_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`job_runs read failed: ${error.message}`);
    out.push(...((data ?? []) as RunRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const now = Date.now();
  const ledger = await readOpenProposals();
  const open = ledger.ok ? ledger.open : [];
  if (req.nextUrl.searchParams.get('count') === '1') {
    return NextResponse.json({ waiting: ledger.ok ? open.length : null });
  }
  try {
    const [rows, latest, reqs, trouble] = await Promise.all([
      weekRows(now),
      latestJobRuns(),
      open.length
        ? getSupabaseAdmin().from('proposal_requests').select('slug, action, status, requested_at')
          .in('slug', open.map((p) => p.slug)).order('requested_at', { ascending: false }).limit(200)
        : Promise.resolve({ data: [] as RequestState[] }),
      // failed logins for a real account in the last day (lib/login-trouble.ts, 12 Oct 2026)
      getSupabaseAdmin().from('portal_event_log').select('identity, kind, created_at')
        .eq('kind', LOGIN_FAILED_KIND).neq('identity', ANON_IDENTITY)
        .gte('created_at', new Date(now - 86_400_000).toISOString()).limit(1000),
    ]);
    const night = lastNight(rows, now);
    // the reason is said in plain words: the stored one quotes the job's summary, which carries names
    const stale = staleJobs(latest, new Date(now)).map((s) => ({ job: s.job, name: jobName(s.job), reason: staleWords(s.job, s.reason) }));
    return NextResponse.json({
      ledger: ledger.ok ? { ok: true } : { ok: false, error: ledger.error },
      open,
      requests: latestRequests(((reqs as { data: RequestState[] | null }).data ?? []) as RequestState[]),
      night,
      history: weekHistory(rows, now),
      stale,
      failedLogins: failedLoginAccounts(((trouble as { data: TroubleEvent[] | null }).data ?? []), new Date(now)),
      generatedAt: new Date(now).toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ledger = await readOpenProposals({ fresh: true });
  if (!ledger.ok) return NextResponse.json({ error: 'Could not read the list of proposals, so nothing was sent.' }, { status: 503 });
  const open = ledger.open;
  const tap = checkTap(body, open.map((p) => p.slug));
  if (!tap.ok) return NextResponse.json({ error: tap.error }, { status: 400 });
  const row = proposalRequestRow(tap, process.env.TELEGRAM_CHAT_ID);
  if (!row.chat_id) return NextResponse.json({ error: 'The Telegram chat is not set on the website, so nothing was sent.' }, { status: 503 });

  const sb = getSupabaseAdmin();
  // the bot's recordRequest rule: one request at a time per proposal
  const { data: busy } = await sb.from('proposal_requests').select('id, action, status')
    .eq('slug', tap.slug).in('status', ['pending', 'running']).limit(1);
  if (busy && busy.length) return NextResponse.json({ ok: true, duplicate: true, message: 'Already being done. The answer comes in Telegram.' });

  if (body?.dryRun === true) return NextResponse.json({ ok: true, dryRun: true, row });

  const { data, error } = await sb.from('proposal_requests').insert(row).select('id').single();
  if (error) return NextResponse.json({ error: `Could not send it: ${error.message}` }, { status: 500 });
  const wake = await wakeWorker(`proposal ${tap.action} ${tap.slug} (website)`);
  return NextResponse.json({ ok: true, id: data.id, wake });
}
