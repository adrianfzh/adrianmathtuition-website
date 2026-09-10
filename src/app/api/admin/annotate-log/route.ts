// POST /api/admin/annotate-log — the annotate overlay's diagnostics, posted by
// the page itself (10 Sep 2026 — Adrian: "when annotating, it's laggy, will
// triple-tap register?"). The overlay used to keep its ink log in memory and
// hand it over only through a triple-tap on the page counter, which a laggy pen
// session can swallow. Now the first strokes' calibration snapshots post here
// on their own, and a single 📋 tap posts the whole log. Rows land in Supabase
// `annotate_ink_log`, read with SQL. Admin session/bearer only; anonymous 401.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const KINDS = new Set(['calib', 'log']);
const MAX_BYTES = 400_000;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { runId?: unknown; kind?: unknown; ua?: unknown; payload?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const kind = String(body.kind || '');
  if (!KINDS.has(kind)) return NextResponse.json({ error: 'kind must be calib | log' }, { status: 400 });
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  if (JSON.stringify(payload).length > MAX_BYTES) return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('annotate_ink_log').insert({
    run_id: typeof body.runId === 'string' ? body.runId.slice(0, 64) : null,
    kind,
    ua: typeof body.ua === 'string' ? body.ua.slice(0, 300) : null,
    payload,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
