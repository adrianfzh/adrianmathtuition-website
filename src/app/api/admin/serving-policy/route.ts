// GET/POST /api/admin/serving-policy — the flip (SPEC-TWINS.md §6, 30 Sep 2026).
//   GET  → { rows } — every (tree level, topic) from `twin_readiness`, ready first.
//   POST { level, topic, schoolRows: false } → flip: school rows leave serving
//        there, only our rows (AdrianMath / AI Generated) pass the four RPCs.
//        Refused (409) below the threshold — verified twins ≥ school rows drawn
//        in 90 days, and ≥ 1. Nothing flips itself; this route is the one door.
//   POST { level, topic, schoolRows: true } → put the school rows back.
// The change is live on the next RPC call (serving_school_rows() reads the row).

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { flipReady, orderReadiness, type TopicReadiness } from '@/lib/serving-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readiness(): Promise<TopicReadiness[]> {
  const { data, error } = await getSupabaseAdmin().from('twin_readiness').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as TopicReadiness[];
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ rows: orderReadiness(await readiness()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { level?: string; topic?: string; schoolRows?: boolean } | null;
  const level = String(body?.level ?? '').trim();
  const topic = String(body?.topic ?? '').trim();
  if (!level || !topic || typeof body?.schoolRows !== 'boolean') {
    return NextResponse.json({ error: 'level, topic and schoolRows (boolean) required' }, { status: 400 });
  }
  try {
    const rows = await readiness();
    const r = rows.find(x => x.level === level && x.topic === topic);
    if (!r) return NextResponse.json({ error: 'no such (level, topic) in the tree' }, { status: 404 });
    if (body.schoolRows === false && !flipReady(r)) {
      return NextResponse.json({ error: `below the threshold: ${r.verified_twins} verified twin(s) for ${r.drawn_90d} school row(s) drawn in 90 days` }, { status: 409 });
    }
    const patch: { level: string; topic: string; school_rows: boolean; flipped_at: string | null; flipped_by: string | null } = body.schoolRows
      ? { level, topic, school_rows: true, flipped_at: null, flipped_by: null }
      : { level, topic, school_rows: false, flipped_at: new Date().toISOString(), flipped_by: 'Adrian' };
    const { error } = await getSupabaseAdmin().from('serving_policy').upsert(patch, { onConflict: 'level,topic' });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, level, topic, schoolRows: body.schoolRows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
