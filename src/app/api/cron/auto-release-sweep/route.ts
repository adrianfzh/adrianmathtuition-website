// GET /api/cron/auto-release-sweep — release what the automatic path missed
// (every 10 min, 9 Sep 2026). A marked student hand-in whose auto-release
// FAILED for an operational reason (or was never attempted) is released through
// the same door the bot uses — mark-triage {release, auto:true} — until it
// succeeds. `sweep:true` tells the route to deliver the marked copy itself for
// a Telegram hand-in (the bot only sends it in the tick it marks the paper).
// Rule refusals and holds are the desk's and are left alone. Stamps job_runs.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { sweepCandidates, sweepVerdict, SWEEP_WINDOW_DAYS, type SweepRow } from '@/lib/auto-release-sweep';

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
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const sb = getSupabaseAdmin();
  const now = new Date();
  const since = new Date(now.getTime() - SWEEP_WINDOW_DAYS * 24 * 3600_000).toISOString();
  const { data, error } = await sb.from('paper_marking_runs')
    .select('id, created_at, released_at, annotated_pdf_url, queue_status, student_id, student_name, paper_name, result_json')
    .is('released_at', null).is('archived_at', null).gte('created_at', since)
    .not('student_id', 'is', null)
    .order('created_at', { ascending: true }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as (SweepRow & { student_name: string | null; paper_name: string | null })[];
  const due = sweepCandidates(rows, now) as typeof rows;
  const skipped = rows.filter(r => !due.includes(r)).map(r => ({ id: r.id, why: sweepVerdict(r, now).why }));
  if (dry) return NextResponse.json({ ok: true, dry: true, due: due.map(r => ({ id: r.id, why: sweepVerdict(r, now).why })), skipped });

  const base = process.env.WEBSITE_URL || 'https://www.adrianmathtuition.com';
  const pw = process.env.ADMIN_PASSWORD || '';
  const out: Array<{ id: string; ok: boolean; note: string }> = [];
  for (const r of due) {
    const who = r.student_name || 'A student';
    const desk = `${base}/admin/desk?run=${r.id}`;
    let record: Record<string, unknown>;
    try {
      const res = await fetch(`${base}/api/admin/mark-triage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pw}` },
        body: JSON.stringify({ action: 'release', runId: r.id, auto: true, sweep: true }), signal: AbortSignal.timeout(50_000),
      });
      const d = await res.json().catch(() => ({}));
      const one = Array.isArray(d.results) ? d.results[0] : null;
      if (res.ok && one?.released) {
        record = { at: now.toISOString(), outcome: 'released', via: one.via, sweep: true, attempts: 1, ...(Array.isArray(one.watch) && one.watch.length ? { watch: one.watch } : {}) };
        const watch = Array.isArray(one.watch) && one.watch.length ? `\n⚠️ Watch out for: ${one.watch.join(' · ')} — ${desk}` : '';
        await sendTelegram(`✅ Released to ${who} on a retry — ${r.paper_name || 'their paper'} (the automatic release had failed earlier).${watch}`, 'marking').catch(() => {});
        out.push({ id: r.id, ok: true, note: 'released' });
      } else if (res.ok && one && one.released === false) {
        record = { at: now.toISOString(), outcome: 'refused', note: String(one.note || 'refused').slice(0, 160), sweep: true, attempts: 1 };
        out.push({ id: r.id, ok: false, note: `refused: ${one.note}` });
      } else {
        record = { at: now.toISOString(), outcome: 'failed', note: `HTTP ${res.status}${d.error ? `: ${String(d.error).slice(0, 120)}` : ''}`, sweep: true, attempts: 1 };
        out.push({ id: r.id, ok: false, note: String(record.note) });
      }
    } catch (e) {
      record = { at: now.toISOString(), outcome: 'failed', note: String((e as Error).message).slice(0, 160), sweep: true, attempts: 1 };
      out.push({ id: r.id, ok: false, note: String(record.note) });
    }
    // Stamp the outcome so the desk shows it and the next sweep knows.
    try {
      const { data: fresh } = await sb.from('paper_marking_runs').select('result_json').eq('id', r.id).maybeSingle();
      const rj = (fresh?.result_json && typeof fresh.result_json === 'object') ? fresh.result_json as Record<string, unknown> : {};
      const prev = (rj.auto_release && typeof rj.auto_release === 'object') ? rj.auto_release as Record<string, unknown> : {};
      await sb.from('paper_marking_runs').update({ result_json: { ...rj, auto_release: { ...record, attempts: Number(prev.attempts || 0) + 1 } } }).eq('id', r.id);
    } catch (e) { console.warn('[auto-release-sweep] stamp skipped', r.id, (e as Error).message); }
  }
  const released = out.filter(o => o.ok).length;
  await logJobRun('auto-release-sweep', true, `${released} released, ${out.length - released} still failing, ${rows.length} unreleased hand-ins seen`).catch(() => {});
  return NextResponse.json({ ok: true, released, results: out, skipped });
}
