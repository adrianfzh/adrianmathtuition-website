import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// Paper marking can take minutes (solve + mark per question). 300s is the Vercel ceiling.
export const maxDuration = 300;

// Proxy to the bot's /api/mark-paper, injecting the bot secret server-side.
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return NextResponse.json({ error: 'bot not configured' }, { status: 503 });

  const body = await req.text();
  try {
    const r = await fetch(`${botBase}/api/mark-paper`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body,
    });
    const data = await r.json().catch(() => ({}));
    // The bot's stats payload predates checked_at, and re-deploying the bot is
    // gated — the history list's seen/unseen split needs it, so merge it in
    // from Supabase here. Harmless once the bot returns it natively.
    if (r.ok && body.includes('"phase":"stats"') && Array.isArray(data.runs) && data.runs.length) {
      try {
        const ids = data.runs.map((x: { id?: string }) => x.id).filter(Boolean);
        const { data: rows } = await getSupabaseAdmin()
          .from('paper_marking_runs').select('id, checked_at').in('id', ids);
        const byId = new Map((rows ?? []).map((row) => [row.id as string, row.checked_at as string | null]));
        for (const run of data.runs) run.checked_at = byId.get(run.id) ?? null;
      } catch { /* the list is still useful without the split */ }
      // 📘 Self-study sheet state, merged the same way (31 Aug 2026). Queueing a
      // sheet used to leave no trace on the row: the green confirmation vanished
      // on the next refresh, so a paper whose sheet was being written looked
      // exactly like one nobody had touched — and when the worker was silently
      // dead, that was the whole story Adrian had to go on. sheet_jobs lives in
      // the website's Supabase, not the bot, so the bot cannot report it.
      try {
        const ids = data.runs.map((x: { id?: string }) => x.id).filter(Boolean);
        const { data: jobs } = await getSupabaseAdmin()
          .from('sheet_jobs').select('run_id, status, error, created_at, completed_at')
          .in('run_id', ids).order('created_at', { ascending: true });
        // Last job wins: re-queueing after a failure should show the retry.
        const byRun = new Map<string, { status: string; error: string | null; created_at: string; completed_at: string | null }>();
        for (const j of jobs ?? []) byRun.set(j.run_id as string, j as never);
        for (const run of data.runs) {
          const j = byRun.get(run.id);
          run.sheet_status = j?.status ?? null;
          run.sheet_error = j?.error ?? null;
          run.sheet_at = j?.completed_at ?? j?.created_at ?? null;
        }
      } catch { /* a missing badge is better than a broken list */ }
    }
    return NextResponse.json(data, { status: r.status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
