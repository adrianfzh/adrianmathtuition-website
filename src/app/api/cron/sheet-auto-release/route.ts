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
import { releasedLine } from '@/lib/sheet-auto-release';

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
      const r = await fetch(`${base}/api/admin/release-with-sheet`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ADMIN_PASSWORD}` },
        body: JSON.stringify({ runId: j.run_id }),
      });
      const d = await r.json().catch(() => ({} as { error?: string }));
      if (r.ok) {
        await sb.from('sheet_jobs').update({ auto_released_at: new Date().toISOString(), stage: 'auto-released' }).eq('id', j.id);
        await sendTelegram(releasedLine(who, j.paper_name)).catch(() => {});
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
