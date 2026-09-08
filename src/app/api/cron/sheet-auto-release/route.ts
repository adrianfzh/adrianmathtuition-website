// GET /api/cron/sheet-auto-release — release-by-silence sweep (every 30 min).
//
// Every finished Practice Again sheet whose hold window has passed, and that
// Adrian did not hold, goes out with its marked paper through the SAME call the
// desk's "Approve & release" makes (/api/admin/release-with-sheet), so the
// choice of PDF, the assignment, and the release stamp are one code path.
// A release the route cannot do on its own (ambiguous PDF, missing folder)
// clears the schedule and tells Adrian — nothing is guessed. Stamps job_runs.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { releasedWithWatchLine, heldByPaperLine } from '@/lib/sheet-auto-release';
import { computeAutoHold } from '@/lib/mark-triage';

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
  const now = new Date().toISOString();
  const { data: due, error } = await sb.from('sheet_jobs')
    .select('id, run_id, student_name, paper_name, auto_release_at')
    .eq('status', 'done').is('held_at', null).is('auto_released_at', null)
    .not('auto_release_at', 'is', null).lte('auto_release_at', now)
    .order('auto_release_at', { ascending: true }).limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const base = process.env.WEBSITE_URL || 'https://www.adrianmathtuition.com';
  const out: Array<{ id: string; ok: boolean; note: string }> = [];
  for (const j of due ?? []) {
    const who = j.student_name || 'A student';
    try {
      // The clock is not a way round the desk (Adrian, 8 Sep 2026): a paper with
      // questions still flagged for review does not go out, however long it has
      // waited. Checked HERE, at fire time — a re-mark can add flags after the
      // sheet was filed, and Adrian may clear them in the meantime.
      const { data: run } = await sb.from('paper_marking_runs').select('released_at, result_json').eq('id', j.run_id).maybeSingle<{ released_at: string | null; result_json: unknown }>();
      // The paper is already out — since 8 Sep 2026 every marked hand-in goes at
      // once, so this is the NORMAL case for a sheet Adrian queued afterwards
      // (Practice Again on request). Only a sheet the desk already sent (its
      // assignment exists) is finished here; otherwise the clock sends the sheet
      // by itself through the same route, which attaches it to the released
      // paper and does not release the paper a second time.
      const paperAlreadyOut = !!run?.released_at;
      if (paperAlreadyOut) {
        const { data: sent } = await sb.from('portal_assignments').select('id')
          .eq('source_run_id', j.run_id).eq('source', 'practice-again').eq('kind', 'worksheet').neq('status', 'revoked').limit(1);
        if ((sent ?? []).length) {
          await sb.from('sheet_jobs').update({ auto_released_at: new Date().toISOString(), stage: 'sent from the desk before the clock' }).eq('id', j.id);
          out.push({ id: j.id, ok: true, note: 'already sent' });
          continue;
        }
      }
      // The paper's accuracy signals are watch-outs on the released line (Adrian,
      // 8 Sep 2026: "just release them, but ping me for anything important").
      // Only a paper with nothing marked stops here.
      const hold = run ? computeAutoHold(run.result_json) : { hold: false, reasons: [] };
      const watch = hold.reasons.filter(x => x !== 'no questions were marked');
      if (hold.reasons.includes('no questions were marked')) {
        await sb.from('sheet_jobs').update({ auto_release_at: null, stage: 'held — the paper has nothing marked' }).eq('id', j.id);
        await sendTelegram(heldByPaperLine(who, j.paper_name, ['the paper has nothing marked'], `${base}/admin/desk?run=${j.run_id}`)).catch(() => {});
        out.push({ id: j.id, ok: false, note: 'held: nothing marked' });
        continue;
      }
      const r = await fetch(`${base}/api/admin/release-with-sheet`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ADMIN_PASSWORD}` },
        body: JSON.stringify({ runId: j.run_id }),
      });
      const d = await r.json().catch(() => ({} as { error?: string }));
      if (r.ok) {
        await sb.from('sheet_jobs').update({ auto_released_at: new Date().toISOString(), stage: paperAlreadyOut ? 'auto-released — the sheet followed the paper on the clock' : 'auto-released' }).eq('id', j.id);
        const followed = paperAlreadyOut ? '\nThe marked paper was already with them; the Practice Again sheet followed on the clock — compulsory, the app reminds them until it is handed in.' : '';
        await sendTelegram(releasedWithWatchLine(who, j.paper_name, watch) + followed).catch(() => {});
        out.push({ id: j.id, ok: true, note: 'released' });
      } else {
        // Not something a cron should decide: hand it back to the desk, once.
        await sb.from('sheet_jobs').update({ auto_release_at: null, stage: `auto-release stopped — ${String(d.error || r.status).slice(0, 120)}` }).eq('id', j.id);
        await sendTelegram(`⚠️ ${who} — could not auto-release: ${d.error || `HTTP ${r.status}`}. Release from the desk.`).catch(() => {});
        out.push({ id: j.id, ok: false, note: String(d.error || r.status) });
      }
    } catch (e) {
      out.push({ id: j.id, ok: false, note: (e as Error).message });
    }
  }
  const released = out.filter(o => o.ok).length;
  await logJobRun('sheet-auto-release', true, `${released} released, ${out.length - released} stopped, ${(due ?? []).length} due`).catch(() => {});
  return NextResponse.json({ ok: true, due: (due ?? []).length, released, results: out });
}
