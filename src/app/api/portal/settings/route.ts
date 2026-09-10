// POST /api/portal/settings — update the caller's own portal_accounts row.
// Only whitelisted fields; the row is located by the authenticated uid, never
// by client-supplied identifiers.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { mergePrefs, readPrefsPatch } from '@/lib/portal-prefs';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const fields: Record<string, unknown> = {};

  if ('telegram_chat_id' in body) {
    const raw = body.telegram_chat_id;
    if (raw === null || raw === '') fields.telegram_chat_id = null;
    else if (/^\d{5,15}$/.test(String(raw))) fields.telegram_chat_id = Number(raw);
    else return NextResponse.json({ error: 'telegram_chat_id must be a numeric chat ID' }, { status: 400 });
  }
  if (typeof body.display_name === 'string' && body.display_name.trim()) {
    fields.display_name = body.display_name.trim().slice(0, 80);
  }
  // Preferences (10 Sep 2026): whitelisted booleans laid over the stored blob.
  // lib/portal-prefs.ts owns the list — a client can never write an arbitrary
  // key into prefs, and an unknown key is a 400, not a silent drop.
  if ('prefs' in body) {
    const read = readPrefsPatch(body.prefs);
    if ('error' in read) return NextResponse.json({ error: read.error }, { status: 400 });
    const { data: cur } = await createServiceClient()
      .from('portal_accounts').select('prefs').eq('id', user.id).maybeSingle();
    fields.prefs = mergePrefs(cur?.prefs, read.patch);
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await createServiceClient()
    .from('portal_accounts')
    .update(fields)
    .eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
