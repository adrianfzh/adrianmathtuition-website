// GET  /api/admin/figures?subject=AM[&topic=]&flaggedOnly=1
//   → figure-bearing units, each figure (core + example steps) with its SVG + flag state.
// POST /api/admin/figures  { unit_id, step_index|null, flagged: bool, subject, topic, unit_order }
//   → toggle a regen flag. Admin only. The flagged set is the Fable re-render worklist.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

type FigureItem = {
  unit_id: string; step_index: number | null; subject: string; topic: string;
  unit_order: number; kind: string; title: string; label: string; svg: string; flagged: boolean;
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const subject = p.get('subject') || 'AM';
  const topic = p.get('topic');
  const flaggedOnly = p.get('flaggedOnly') === '1';
  const supa = getSupabaseAdmin();

  // Page through units (past the 1000-row cap) for the subject (+topic).
  const rows: { id: string; subject: string; topic: string; unit_order: number; kind: string; title: string; payload: Record<string, unknown> }[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supa.from('learning_units')
      .select('id, subject, topic, unit_order, kind, title, payload')
      .eq('subject', subject).order('unit_order').range(from, from + 999);
    if (topic) q = q.eq('topic', topic);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data || []) as typeof rows);
    if (!data || data.length < 1000) break;
  }

  const { data: flags } = await supa.from('figure_regen_flags')
    .select('unit_id, step_index').eq('subject', subject).eq('status', 'flagged');
  const flagSet = new Set((flags || []).map(f => `${f.unit_id}:${f.step_index ?? 'core'}`));

  const items: FigureItem[] = [];
  for (const r of rows) {
    const pay = r.payload as { figure_svg?: string; steps?: { figure_svg?: string; label?: string }[] };
    const push = (step_index: number | null, svg: string, label: string) => {
      const flagged = flagSet.has(`${r.id}:${step_index ?? 'core'}`);
      if (flaggedOnly && !flagged) return;
      items.push({ unit_id: r.id, step_index, subject: r.subject, topic: r.topic, unit_order: Number(r.unit_order), kind: r.kind, title: r.title, label, svg, flagged });
    };
    if (typeof pay.figure_svg === 'string') push(null, pay.figure_svg, 'core');
    (pay.steps || []).forEach((s, i) => { if (typeof s.figure_svg === 'string') push(i, s.figure_svg, s.label || `step ${i + 1}`); });
  }

  // Topic list for the filter (all figure-bearing topics in this subject).
  const topics = [...new Set(items.map(i => i.topic))].sort();
  return NextResponse.json({ subject, topics, count: items.length, items });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const { unit_id, step_index = null, flagged, subject, topic, unit_order, note } = b;
  if (!unit_id) return NextResponse.json({ error: 'unit_id required' }, { status: 400 });
  const supa = getSupabaseAdmin();
  // Delete any existing flag for this (unit, step) first — matches the COALESCE unique
  // index without needing ON CONFLICT — then insert if flagging on.
  let del = supa.from('figure_regen_flags').delete().eq('unit_id', unit_id);
  del = step_index === null ? del.is('step_index', null) : del.eq('step_index', step_index);
  const { error: delErr } = await del;
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  if (flagged) {
    const { error } = await supa.from('figure_regen_flags')
      .insert({ unit_id, step_index, subject, topic, unit_order, note: note ?? null, status: 'flagged' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, flagged: !!flagged });
}

