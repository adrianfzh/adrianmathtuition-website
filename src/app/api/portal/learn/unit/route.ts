// GET /api/portal/learn/unit?id=<uuid>
// Full payload for one unit + its visible topic siblings (for "next unit").
// Same auth + status rule as the overview route. Fixture ids resolve in-code.
import { NextRequest, NextResponse } from 'next/server';
import { practiceAuth } from '@/lib/practice';
import { getSupabaseAdmin } from '@/lib/supabase';
import { learnSubjectsForLevel } from '@/lib/learn';
import { getFixtureUnit, isFixtureId } from '@/lib/learn-fixture';
import type { LearnUnit, UnitKind, UnitSummary } from '@/lib/learn-types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const isStudent = caller.kind === 'student';

  // Fixture units (empty-DB fallback) resolve without a query.
  if (isFixtureId(id)) {
    const fx = getFixtureUnit(id);
    if (!fx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(fx);
  }

  const supabase = getSupabaseAdmin();
  const { data: unit, error } = await supabase
    .from('learning_units')
    .select('id, subject, topic, unit_order, kind, title, status, payload')
    .eq('id', id)
    .single();
  if (error || !unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Status + subject scoping for students.
  if (isStudent) {
    if (unit.status !== 'approved') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!learnSubjectsForLevel(caller.account.level).includes(unit.subject)) {
      return NextResponse.json({ error: 'Not available' }, { status: 403 });
    }
  }

  let sq = supabase
    .from('learning_units')
    .select('id, kind, title, unit_order, status')
    .eq('subject', unit.subject)
    .eq('topic', unit.topic);
  sq = isStudent ? sq.eq('status', 'approved') : sq.in('status', ['approved', 'pending']);
  const { data: sib } = await sq.order('unit_order');

  const siblings: UnitSummary[] = (sib || []).map(s => ({
    id: s.id, kind: s.kind as UnitKind, title: s.title,
    unit_order: Number(s.unit_order), status: s.status,
    ...(s.status !== 'approved' ? { pending: true } : {}),
  }));

  const full: LearnUnit = {
    id: unit.id, subject: unit.subject, topic: unit.topic,
    kind: unit.kind as UnitKind, title: unit.title,
    unit_order: Number(unit.unit_order), status: unit.status,
    ...(unit.status !== 'approved' ? { pending: true } : {}),
    payload: unit.payload,
  };

  return NextResponse.json({ unit: full, siblings });
}
