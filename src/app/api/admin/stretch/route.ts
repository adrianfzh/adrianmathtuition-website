// /api/admin/stretch — Adrian's preview of the 🧩 weekly stretch set (SPEC-STRETCH-SET.md).
//
// GET                 → students with a portal account (small columns) + this week's
//                       sets so far: who has one, what was tried, and every gap.
// GET ?account=<uuid> → that student's set for this week AS THEY WILL SEE IT — built now
//                       if it does not exist yet, then kept (the student later gets
//                       exactly this set), with a grey "why" under each card.
// POST { account, action: 'rebuild' } → build again (only while the student has not
//                       answered anything in it).
// Admin only (verifyAdminAuth: the admin cookie or Bearer).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';
import { ACCOUNT_COLUMNS, loadOrBuildSet, setLevelFor, thisWeek, toScreen, viewSet, weekSets } from '@/lib/stretch-set-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function preview(accountId: string, rebuild: boolean) {
  const sb = createServiceClient();
  const { data: account } = await sb.from('portal_accounts').select(ACCOUNT_COLUMNS).eq('id', accountId).maybeSingle<PortalAccount>();
  if (!account) return NextResponse.json({ error: 'No such account' }, { status: 404 });
  const out = await loadOrBuildSet(sb, account, { builtBy: 'admin', rebuild });
  if (!out) return NextResponse.json({ error: 'This account has no maths level to build a set at' }, { status: 409 });
  const view = await viewSet(sb, account, out.row);
  return NextResponse.json({
    account: { id: account.id, name: account.display_name, level: account.level },
    week: out.row.week_start, level: out.row.level, builtBy: out.row.built_by, builtAt: out.row.built_at, built: out.built,
    answered: Object.keys(out.row.responses ?? {}).length > 0,
    gaps: out.row.gaps ?? [], items: toScreen(view, true),
  });
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('account');
  try {
    if (id) {
      if (!UUID.test(id)) return NextResponse.json({ error: 'bad account id' }, { status: 400 });
      return await preview(id, false);
    }
    const sb = createServiceClient();
    const week = thisWeek();
    const [{ data: accts }, sets] = await Promise.all([
      sb.from('portal_accounts').select(ACCOUNT_COLUMNS).is('deactivated_at', null).order('display_name').limit(500),
      weekSets(sb, week),
    ]);
    const byId = new Map(sets.map(s => [s.airtable_student_id, s]));
    const students = ((accts ?? []) as PortalAccount[]).map(a => {
      const s = byId.get(portalIdentity(a));
      return {
        id: a.id, name: a.display_name || a.email, level: a.level, setLevel: setLevelFor(a),
        hasSet: !!s, gaps: s?.gaps?.length ?? 0, answered: s ? Object.keys(s.responses ?? {}).length : 0,
      };
    }).filter(s => s.setLevel);
    const gapCounts: Record<string, number> = {};
    for (const s of sets) for (const g of s.gaps ?? []) gapCounts[`${g.slot}: ${g.note}`] = (gapCounts[`${g.slot}: ${g.note}`] ?? 0) + 1;
    return NextResponse.json({ week, students, setsBuilt: sets.length, gaps: Object.entries(gapCounts).sort((a, b) => b[1] - a[1]).map(([note, n]) => ({ note, n })) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { account?: string; action?: string };
  if (!body.account || !UUID.test(body.account) || body.action !== 'rebuild') return NextResponse.json({ error: 'account + action rebuild required' }, { status: 400 });
  try { return await preview(body.account, true); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
