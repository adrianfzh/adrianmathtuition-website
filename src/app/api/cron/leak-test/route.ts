// GET /api/cron/leak-test — 🔒 the weekly leak test (5 Oct 2026; Phase G made automatic).
// Mondays 04:00 SGT (`0 20 * * 0` UTC). What it tries → lib/leak-test.ts.
//
// Quiet when nothing leaks (job_runs `leak-test` ok=true). ANY leak → ok=false and
// one Telegram line to Adrian's main chat (not a topic — this one he must see).
// ?base=<origin> points the door checks at another deployment (default: this one).
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { getSupabaseAdmin } from '@/lib/supabase';
import { leakTestLine } from '@/lib/leak-test';
import { controlProblems, mintTestSession, otherStudentProbes, probeLeaks, tableLeaks } from '@/lib/leak-test-store';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  if (process.env.ADMIN_PASSWORD && safeEqual(auth, `Bearer ${process.env.ADMIN_PASSWORD}`)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const baseParam = req.nextUrl.searchParams.get('base');
  const base = baseParam && /^https:\/\/[a-z0-9.-]+$/i.test(baseParam) ? baseParam : req.nextUrl.origin;
  try {
    const admin = getSupabaseAdmin();
    const session = await mintTestSession(admin);
    const t = await tableLeaks(session);
    const probes = await otherStudentProbes(admin, session.self);
    const p = await probeLeaks(base, session, probes);
    const controls = await controlProblems(admin, base, session);
    const problems = [...t.problems, ...p.problems, ...controls];
    const line = leakTestLine(problems, t.tables, p.asked);
    await logJobRun('leak-test', problems.length === 0, line, { base, tables: t.tables, asked: p.asked, problems: problems.slice(0, 20) });
    if (problems.length) await sendTelegram(line).catch(() => {});
    return NextResponse.json({ ok: problems.length === 0, line, base, tables: t.tables, asked: p.asked, problems });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[leak-test] could not run:', msg);
    await sendTelegram(`🔒 The weekly leak test could not run: ${msg.slice(0, 200)}`, 'ops').catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
