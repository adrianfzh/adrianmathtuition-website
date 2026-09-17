// GET /api/cron/consistency-remark — the Sunday-night shadow read (17 Sep 2026).
//
// Adrian: "we need consistency in marking … how can we measure the effectiveness
// of all these changes?" Every ACTIVE paper in `consistency_set` is asked to be
// read again in SHADOW: the bot queues it on the Mac lane, a slot reads it with
// the same prompt and the same grounding as a whole re-mark, and the reading is
// filed beside the paper's real marking in result_json.shadow_runs[]. **Nothing
// is delivered** — no student, no parent and no desk lane can see a shadow. The
// Monday report then prints how far the marking moved.
//
// Cron: `0 14 * * 0` UTC = Sunday 22:00 SGT — after the evening's hand-ins have
// been marked and released, so a measurement never sits in front of a student.
// Cost: about 8 × 16 min of Mac plan time. Under 🖥 Mac plan only it behaves like
// any other re-mark; there is no API-lane path at all, so a shadow that finds no
// slot simply waits for next Sunday and this job can never spend money.
//
// Stamps job_runs 'consistency-remark' (docs/OPS.md, weekly rhythm).
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { listSet } from '@/lib/consistency-set';

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
  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return NextResponse.json({ error: 'bot not configured' }, { status: 503 });

  let rows;
  try { rows = await listSet(true); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }

  const queued: string[] = [];
  const skipped: { runId: string; why: string }[] = [];
  for (const row of rows) {
    try {
      // The same door a whole re-mark uses, with `shadow: true`. `remark` is
      // required alongside it on the bot side, so a shadow can only ever be
      // asked for deliberately.
      const r = await fetch(`${botBase}/api/mark-paper`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'enqueue', id: row.run_id, remark: true, shadow: true, note: row.note ?? null }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (data.ok) queued.push(row.run_id);
      // Every refusal is normal and none of them is worth failing the job over:
      // a shadow of this paper is already running, the paper lost its photos,
      // the run was archived. They are counted and reported, not retried.
      else skipped.push({ runId: row.run_id, why: data.error || `HTTP ${r.status}` });
    } catch (e) {
      skipped.push({ runId: row.run_id, why: (e as Error).message });
    }
  }
  const summary = `${queued.length} of ${rows.length} queued for a shadow read${skipped.length ? `, ${skipped.length} skipped` : ''}`;
  console.log(`[consistency-remark] ${summary}${skipped.length ? `: ${skipped.map((s) => `${s.runId.slice(0, 8)} ${s.why}`).join('; ')}` : ''}`);
  // Only the success path stamps, as every job here does — a crashed or
  // never-started run alarms by ABSENCE (docs/OPS.md).
  await logJobRun('consistency-remark', true, summary).catch(() => {});
  return NextResponse.json({ ok: true, set: rows.length, queued: queued.length, skipped });
}
