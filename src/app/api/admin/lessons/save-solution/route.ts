// POST /api/admin/lessons/save-solution — persist an AI-generated worked solution onto a bank
// question's top-level `solution` field (tagged solution_source='ai_opus' so it's distinguishable
// from marking-scheme solutions). Only fills questions that currently have NO solution anywhere,
// so it can never clobber a real marking-scheme solution.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: string; solution?: string };
  const id = (body.id ?? '').trim();
  const solution = (body.solution ?? '').trim();
  if (!id || !solution) return NextResponse.json({ error: 'id and solution required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  // Guard: don't overwrite an existing solution (top-level OR any part/subpart).
  const { data: q, error: readErr } = await supa
    .from('questions').select('solution, parts').eq('id', id).single();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  type P = { solution?: string; subparts?: Array<{ solution?: string }> };
  const partsArr: P[] = Array.isArray(q?.parts) ? (q!.parts as P[]) : [];
  const hasExisting = (q?.solution && String(q.solution).trim() !== '')
    || partsArr.some(p => (p?.solution && p.solution.trim() !== '')
      || (Array.isArray(p?.subparts) && p.subparts.some(sp => sp?.solution && sp.solution.trim() !== '')));
  if (hasExisting) return NextResponse.json({ ok: false, skipped: 'already has a solution' });

  const { error } = await supa
    .from('questions')
    .update({ solution, solution_source: 'ai_opus' })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
