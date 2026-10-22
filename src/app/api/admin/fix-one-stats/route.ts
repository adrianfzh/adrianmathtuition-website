// GET /api/admin/fix-one-stats — 🎯 Fix one, last 14 days (SPEC-STUDENT-FIRST.md
// §Fix one, 22 Oct 2026): papers released, opened within 24 h, fix shown /
// answered / correct, Practice Again requests within 24 h. Real students only
// (preview identities dropped). Read-only, admin-auth, counts from
// lib/fix-one-stats.ts. Shown on /admin/ops (fix-one-card.tsx).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { SCIENCE_PREVIEW_IDENTITIES } from '@/lib/portal-beta';
import { summariseFixOne, type StatsEvent, type StatsRun } from '@/lib/fix-one-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAYS = 14;
const PAGE = 1000;
const MAX_ROWS = 50_000;
const KINDS = ['marking:view', 'marking:open', 'fix:shown', 'fix:answered', 'practice-again:request'];

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const preview = new Set(SCIENCE_PREVIEW_IDENTITIES);

  const runs: StatsRun[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await sb.from('paper_marking_runs').select('id, student_id, released_at, subject')
      .gte('released_at', since).not('student_id', 'is', null).order('released_at').range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of data ?? []) {
      if (String(r.subject ?? 'math') !== 'math' || preview.has(r.student_id as string)) continue;
      runs.push({ id: r.id as string, student_id: r.student_id as string, released_at: r.released_at as string });
    }
    if ((data ?? []).length < PAGE) break;
  }

  const events: StatsEvent[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await sb.from('portal_event_log').select('identity, kind, created_at, detail')
      .in('kind', KINDS).gte('created_at', since).order('created_at').range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const e of data ?? []) if (!preview.has(e.identity as string)) events.push(e as StatsEvent);
    if ((data ?? []).length < PAGE) break;
  }

  return NextResponse.json(summariseFixOne(runs, events, DAYS));
}
