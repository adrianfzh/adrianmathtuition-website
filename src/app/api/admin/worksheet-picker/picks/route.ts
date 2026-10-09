// /api/admin/worksheet-picker/picks — saved selections for the worksheet picker
// (8 Oct 2026, Adrian opened the page without its ?ids= link: "nothing is
// appearing"). A session POSTs the questions it shortlisted; the page lists the
// recent ones and opens one with ?pick=<id>. Admin auth (cookie, or the Bearer
// password a session uses from a script).
//   GET  ?id=<uuid>      → { pick }                 (stamps opened_at)
//   GET                  → { picks: [...] }         (newest 40)
//   POST { title, subtitle?, note?, source?, question_ids[] } → { pick }
//   PATCH { id, state } → { ok }   (the page's working state: title, subtitle,
//                                    cands[], picked[]; null = restart)
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { parseIds } from '@/lib/pick-worksheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLS = 'id, created_at, title, subtitle, note, source, question_ids, opened_at, state';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supa = getSupabaseAdmin();
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const { data, error } = await supa.from('worksheet_picks').select(COLS).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await supa.from('worksheet_picks').update({ opened_at: new Date().toISOString() }).eq('id', id);
    return NextResponse.json({ pick: data });
  }
  const { data, error } = await supa.from('worksheet_picks').select(COLS).order('created_at', { ascending: false }).limit(40);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ picks: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { title?: unknown; subtitle?: unknown; note?: unknown; source?: unknown; question_ids?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  const ids = parseIds(Array.isArray(body.question_ids) ? body.question_ids.join(',') : String(body.question_ids ?? ''));
  if (!ids.length) return NextResponse.json({ error: 'question_ids[] needs at least one uuid' }, { status: 400 });
  const row = {
    title,
    subtitle: typeof body.subtitle === 'string' ? body.subtitle.trim().slice(0, 160) : '',
    note: typeof body.note === 'string' ? body.note.trim().slice(0, 600) : '',
    source: typeof body.source === 'string' ? body.source.trim().slice(0, 40) || 'session' : 'session',
    question_ids: ids.slice(0, 60),
  };
  const { data, error } = await getSupabaseAdmin().from('worksheet_picks').insert(row).select(COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pick: data, url: `/admin/worksheet-picker?pick=${data.id}` });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { id?: unknown; state?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  let state: Record<string, unknown> | null = null;
  if (body.state && typeof body.state === 'object') {
    const st = body.state as Record<string, unknown>;
    state = {
      title: typeof st.title === 'string' ? st.title.slice(0, 120) : '',
      subtitle: typeof st.subtitle === 'string' ? st.subtitle.slice(0, 160) : '',
      cands: parseIds(Array.isArray(st.cands) ? st.cands.join(',') : '').slice(0, 80),
      picked: parseIds(Array.isArray(st.picked) ? st.picked.join(',') : '').slice(0, 80),
      savedAt: new Date().toISOString(),
    };
  }
  const { error } = await getSupabaseAdmin().from('worksheet_picks').update({ state }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, state });
}
