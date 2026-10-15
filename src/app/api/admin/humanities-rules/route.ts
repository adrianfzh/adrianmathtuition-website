// PATCH /api/admin/humanities-rules { id, on } — turn a rule the Humanities marker learned off, or back on
// (15 Oct 2026, lib/humanities-selfcheck.ts). Admin cookie or Bearer. Takes effect within five minutes.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: unknown; on?: unknown };
  const id = String(body.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from('humanities_rule_patches')
    .update({ status: body.on === true ? 'live' : 'off', decided_at: new Date().toISOString() })
    .eq('id', id).in('status', body.on === true ? ['off'] : ['live']).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: !!data?.length });
}
