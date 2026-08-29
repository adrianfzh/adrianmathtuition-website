// /api/portal/remediation — the signed-in student's fix-it plan.
//   GET → { plan, items, next, openAssignment } for the active plan (null plan when none)
//   POST { action:'attest', itemId }   — clear a self-attest (learn) step
//   POST { action:'another', itemId }  — next similar question after a miss
// Student session only; the airtable_student_id filter is the access control
// (service-role reads, same posture as /app/marking). Probed by health-check
// (expects 401 anonymously).
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';
import { loadActivePlan, reconcilePlan, attestItem, anotherSimilar } from '@/lib/remediation-data';
import { nextOpenItem } from '@/lib/remediation';

export const runtime = 'nodejs';

async function identityOr401(): Promise<{ identity: string } | { res: NextResponse }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: account } = await supabase.from('portal_accounts')
    .select('id, airtable_student_id').eq('id', user.id).single<PortalAccount>();
  if (!account) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { identity: portalIdentity(account) };
}

export async function GET() {
  const auth = await identityOr401();
  if ('res' in auth) return auth.res;
  const loaded = await loadActivePlan(auth.identity);
  if (!loaded) return NextResponse.json({ plan: null, items: [], next: null, openAssignment: null });
  const view = await reconcilePlan(loaded.plan, loaded.items);
  // The student's view never carries Adrian's report or the raw evidence refs.
  const items = view.items.map((it) => ({
    id: it.id, seq: it.seq, kind: it.kind, skill: it.skill, topic: it.topic,
    state: it.state, clearKind: it.clear_rule.kind, material: {
      ...(it.material.docx_url ? { docx_url: it.material.docx_url } : {}),
      ...(it.material.subgroup_id ? { subgroup_id: it.material.subgroup_id } : {}),
      ...(it.material.note ? { note: it.material.note } : {}),
    },
  }));
  const next = nextOpenItem(view.items);
  return NextResponse.json({
    plan: { id: view.plan.id, status: view.plan.status },
    items,
    next: next ? next.id : null,
    openAssignment: view.openAssignment,
  });
}

export async function POST(req: NextRequest) {
  const auth = await identityOr401();
  if ('res' in auth) return auth.res;
  let body: { action?: string; itemId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const itemId = String(body.itemId ?? '');
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  if (body.action === 'attest') {
    const r = await attestItem(auth.identity, itemId);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (body.action === 'another') {
    const r = await anotherSimilar(auth.identity, itemId);
    return r.ok ? NextResponse.json({ ok: true, assignmentId: r.assignmentId }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
