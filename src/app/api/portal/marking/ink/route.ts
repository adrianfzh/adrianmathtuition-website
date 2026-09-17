// GET  /api/portal/marking/ink?run=<id>          → { pages }
// POST /api/portal/marking/ink {runId, pages}     → { ok }
//
// ✍️ The student's own ink on their marked pages (17 Sep 2026, SPEC-STUDENT-FIRST
// §12) — a layer OVER the marked copy, stored in `student_ink` keyed by (run,
// identity). The run must be theirs and released; that filter is the access
// control. Shape and limits: lib/student-ink (pure, tested). An empty save
// clears the layer. The marked copy itself is never written here.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateInkPages, inkIsEmpty } from '@/lib/student-ink';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

async function ownsReleasedRun(runId: string, sid: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin().from('paper_marking_runs').select('id')
    .eq('id', runId).eq('student_id', sid).not('released_at', 'is', null).maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);
  const runId = req.nextUrl.searchParams.get('run') || '';
  if (!UUID.test(runId)) return NextResponse.json({ error: 'run required' }, { status: 400 });
  if (!(await ownsReleasedRun(runId, sid))) return NextResponse.json({ error: 'Not your paper' }, { status: 404 });
  const { data } = await getSupabaseAdmin().from('student_ink').select('pages, updated_at').eq('run_id', runId).eq('identity', sid).maybeSingle();
  return NextResponse.json({ pages: data?.pages ?? {}, updatedAt: data?.updated_at ?? null });
}

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);
  const body = await req.json().catch(() => ({} as { runId?: unknown; pages?: unknown }));
  const runId = typeof body.runId === 'string' ? body.runId : '';
  if (!UUID.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  const v = validateInkPages(body.pages ?? {});
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (!(await ownsReleasedRun(runId, sid))) return NextResponse.json({ error: 'Not your paper' }, { status: 404 });
  const sb = getSupabaseAdmin();
  if (inkIsEmpty(v.pages)) {
    const { error } = await sb.from('student_ink').delete().eq('run_id', runId).eq('identity', sid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, empty: true });
  }
  const { error } = await sb.from('student_ink')
    .upsert({ run_id: runId, identity: sid, pages: v.pages, updated_at: new Date().toISOString() }, { onConflict: 'run_id,identity' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
