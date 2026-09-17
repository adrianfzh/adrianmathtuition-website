// GET /api/cron/auto-release-report — the number Adrian watches (8 Sep 2026).
//
// Every Monday 8am SGT: how many hand-ins went to students on their own in the
// last 7 days, how many he changed afterwards (an override on a released run),
// and by how much. If five or more went out and more than one in ten needed a
// change, auto-release is switched OFF (lib/auto-release-setting) and he is
// told why — the switch is his to turn back on. Stamps job_runs.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { closureSummary } from '@/lib/sheet-closure-store';
import { kindTrend, trendLine, type PaperScore } from '@/lib/kind-trend';
import { errorKindTotals } from '@/lib/error-kinds';
import { levelFromPaperName } from '@/lib/sheet-sections';
import { unheldPapers, unheldLine, type RunForHeld } from '@/lib/unheld-papers';
import { setAutoReleasePaused, getAutoReleaseSetting } from '@/lib/auto-release-setting';
import { summariseAutoReleases } from '@/lib/auto-release-report';
import { consistencyReport, weeklyRollups } from '@/lib/consistency-set';
import { consistencyLine } from '@/lib/shadow-diff';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  if (req.headers.get('x-vercel-cron')) return true;
  if (cron && safeEqual(auth, `Bearer ${cron}`)) return true;
  if (admin && safeEqual(auth, `Bearer ${admin}`)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data, error } = await sb.from('paper_marking_runs')
    .select('id, student_name, paper_name, released_at, released_via, checked_at, result_json')
    .gte('released_at', since).like('released_via', 'auto:%').is('archived_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const report = summariseAutoReleases(data ?? []);
  const setting = await getAutoReleaseSetting(true);
  let paused = false;
  if (!setting.paused && report.shouldPause) {
    await setAutoReleasePaused(true, 'auto-release-report', report.pauseReason ?? 'override rate').catch(() => {});
    paused = true;
  }
  // The two effectiveness lines (17 Sep 2026): closure of Practice Again sections
  // and the next-paper trend per kind. Both fail-soft — a missing line never
  // stops the report.
  let measure = '';
  try {
    const c = await closureSummary(sb, 30);
    measure += `\n📘 Practice Again closure (30 days): ${c.attempts} section${c.attempts === 1 ? '' : 's'} returned — ${c.closed} closed, ${c.slip} slips, ${c.stillFailing} still failing`
      + (c.worst.length ? `; still failing most: ${c.worst.map(w => `${w.title} (${w.stillFailing}/${w.attempts})`).join('; ')}` : '') + '.';
  } catch (e) { console.warn('[auto-release-report] closure line skipped:', (e as Error).message); }
  try {
    const since60 = new Date(Date.now() - 60 * 86400_000).toISOString();
    const { data: runs } = await sb.from('paper_marking_runs')
      .select('student_id, paper_name, created_at, total_awarded, total_max, result_json')
      .not('released_at', 'is', null).is('superseded_by', null).gte('created_at', since60).not('student_id', 'is', null).limit(600);
    const rows: PaperScore[] = [];
    for (const r of runs ?? []) {
      const level = levelFromPaperName(r.paper_name);
      const max = Number(r.total_max) || 0;
      if (!level || max <= 0 || /practice again/i.test(String(r.paper_name || ''))) continue;
      let k = null;
      try { k = errorKindTotals((r.result_json as { results?: unknown } | null)?.results); } catch { k = null; }
      rows.push({ student_id: r.student_id as string, level, created_at: r.created_at as string, lost: k?.lostTotal ?? max - (Number(r.total_awarded) || 0), careless: k?.careless ?? 0, concept: k?.concept ?? 0, pct: Math.round(((Number(r.total_awarded) || 0) / max) * 100) });
    }
    measure += '\n' + trendLine(kindTrend(rows));
  } catch (e) { console.warn('[auto-release-report] trend line skipped:', (e as Error).message); }
  // 📏 The THIRD effectiveness line (17 Sep 2026): how far the marking itself
  // moved. A fixed set of papers is re-read in SHADOW every Sunday night
  // (/api/cron/consistency-remark) and this compares the latest reading with the
  // one before it, part by part. Fail-soft like the two above — and silent in
  // the first week, when there is nothing to compare a reading against yet.
  try {
    const line = consistencyLine(weeklyRollups(await consistencyReport(true)));
    if (line) measure += `\n${line}`;
  } catch (e) { console.warn('[auto-release-report] consistency line skipped:', (e as Error).message); }
  // Papers marked this week without a scheme we hold (18 Sep 2026) — for Adrian
  // only: drop the scheme in the inbox and the next marking is grounded.
  try {
    const { data: wk } = await sb.from('paper_marking_runs')
      .select('paper_name, student_name, created_at, paper_subject, result_json')
      .gte('created_at', since).not('student_id', 'is', null).limit(400);
    const line = unheldLine(unheldPapers((wk ?? []) as RunForHeld[]));
    if (line) measure += '\n' + line;
  } catch (e) { console.warn('[auto-release-report] unheld line skipped:', (e as Error).message); }
  await sendTelegram(report.telegram + measure + (paused ? '\n⏸ Auto-release has been switched OFF — turn it back on from the desk when you are happy.' : ''), 'marking').catch(() => {});
  await logJobRun('auto-release-report', true, `${report.released} auto-released, ${report.changed} changed after${paused ? ' — PAUSED' : ''}`).catch(() => {});
  return NextResponse.json({ ok: true, ...report, paused });
}
