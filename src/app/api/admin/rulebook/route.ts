import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';
import { cleanRuleInput, moveWithinGroup, positionForNew, type StaffRule } from '@/lib/staff-rules';

export const runtime = 'nodejs';

// 📏 Staff rulebook — read, add, change, move, remove (15 Oct 2026). Admin-only.
// GET → { rules }. POST { section, body, important } → adds. PATCH { id, section?, body?, important? }
// or { id, move: 'up'|'down' } → changes. DELETE ?id= → removes. Every write answers with the full list.

type Row = { id: string; section: string; body: string; important: boolean; position: number; updated_at: string };
const shape = (r: Row): StaffRule => ({ id: r.id, section: r.section, body: r.body, important: r.important, position: r.position, updatedAt: r.updated_at });

async function readAll(): Promise<StaffRule[]> {
  const { data, error } = await createServiceClient().from('staff_rules')
    .select('id, section, body, important, position, updated_at').order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(shape);
}

const fail = (e: unknown, status = 500) => NextResponse.json({ error: (e as Error).message || String(e) }, { status });

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json({ rules: await readAll() }); } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const input = cleanRuleInput(await req.json().catch(() => ({})));
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  try {
    const position = positionForNew(await readAll(), input.section);
    const { error } = await createServiceClient().from('staff_rules')
      .insert({ section: input.section, body: input.body, important: input.important, position });
    if (error) throw new Error(error.message);
    return NextResponse.json({ rules: await readAll() });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { id?: string; move?: string; section?: unknown; body?: unknown; important?: unknown };
  if (!b.id) return NextResponse.json({ error: 'Which rule?' }, { status: 400 });
  try {
    const supa = createServiceClient();
    const now = new Date().toISOString();
    if (b.move === 'up' || b.move === 'down') {
      for (const w of moveWithinGroup(await readAll(), b.id, b.move)) {
        const { error } = await supa.from('staff_rules').update({ position: w.position, updated_at: now }).eq('id', w.id);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ rules: await readAll() });
    }
    const input = cleanRuleInput(b);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
    const all = await readAll();
    const me = all.find((r) => r.id === b.id);
    if (!me) return NextResponse.json({ error: 'That rule is gone — reload the page.' }, { status: 404 });
    // a rule moved to another group goes to the end of that group
    const position = me.section === input.section ? me.position : positionForNew(all.filter((r) => r.id !== me.id), input.section);
    const { error } = await supa.from('staff_rules')
      .update({ section: input.section, body: input.body, important: input.important, position, updated_at: now }).eq('id', b.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ rules: await readAll() });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which rule?' }, { status: 400 });
  try {
    const { error } = await createServiceClient().from('staff_rules').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ rules: await readAll() });
  } catch (e) { return fail(e); }
}
