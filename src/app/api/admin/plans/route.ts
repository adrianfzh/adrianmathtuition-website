// /api/admin/plans — Adrian's view of self-serve plans (lib/plans.ts, SPEC-PLANS.md, 5 Nov 2026).
//
// GET  → the plans with their money at full use, and every self-serve account
//        (no linked tuition record, or deactivated) with its plan and papers used.
// POST → change one account by hand:
//   { action:'set_plan', accountId, plan }  end the current plan now, start <plan> for 30 days
//   { action:'free', accountId }            end the current plan now (back to free)
//   { action:'bonus', accountId, papers }   give (or, negative, take back) free marked papers
//   { action:'reset_used', accountId }      set the current plan's papers used back to 0
// Tuition accounts are never listed or changed here — they are never limited.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { grantPass, isTuitionAccount } from '@/lib/portal-passes';
import { BONUS_SOURCE, grantBonusPapers, planStatusFromRows, type PassRowWithSource } from '@/lib/plan-usage';
import { PLANS, PLAN_ORDER, PLAN_PERIOD_DAYS, COST_PER_PAPER_SGD, FREE_MARKED_PAPERS, REFERRED_EXTRA_FREE_PAPERS, isPlanKey, isTestSite, planEconomics, plansActive } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Acct = { id: string; email: string | null; display_name: string | null; airtable_student_id: string | null; deactivated_at: string | null; created_at: string | null; level: string | null };

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = getSupabaseAdmin();
  const { data: accts, error } = await svc
    .from('portal_accounts')
    .select('id, email, display_name, airtable_student_id, deactivated_at, created_at, level')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const selfServe = ((accts ?? []) as Acct[]).filter(a => !isTuitionAccount(a));
  const ids = selfServe.map(a => a.id);

  const passes: (PassRowWithSource & { account_id: string })[] = [];
  const freeUsed = new Map<string, number>();
  if (ids.length) {
    const { data: rows } = await svc
      .from('portal_passes')
      .select('id, account_id, source, starts_at, expires_at, tier, handins_used')
      .in('account_id', ids);
    passes.push(...((rows ?? []) as (PassRowWithSource & { account_id: string })[]));
    const { data: runs } = await svc
      .from('paper_marking_runs')
      .select('student_id')
      .in('student_id', ids.map(id => `acct:${id}`))
      .eq('result_json->>plan_free', 'true');
    for (const r of (runs ?? []) as { student_id: string }[]) {
      const id = r.student_id.slice(5);
      freeUsed.set(id, (freeUsed.get(id) ?? 0) + 1);
    }
  }
  const now = new Date();
  const accounts = selfServe.map(a => {
    const mine = passes.filter(p => p.account_id === a.id);
    const st = planStatusFromRows(mine, freeUsed.get(a.id) ?? 0, now);
    return {
      id: a.id,
      name: a.display_name,
      email: a.email,
      level: a.level,
      joined: a.created_at,
      exStudent: Boolean(a.deactivated_at),
      kind: st.kind,
      label: st.kind === 'free' ? 'Free' : st.label,
      plan: st.kind === 'plan' ? st.plan : null,
      used: st.used,
      allowance: st.allowance,
      left: st.left,
      endsAt: st.kind === 'plan' ? st.endsAt : null,
      bonus: st.kind === 'free' ? st.bonus : null,
    };
  });

  return NextResponse.json({
    plansOn: plansActive(),
    testSite: isTestSite(),
    costPerPaperSgd: COST_PER_PAPER_SGD,
    freePapers: FREE_MARKED_PAPERS,
    referredExtraFreePapers: REFERRED_EXTRA_FREE_PAPERS,
    periodDays: PLAN_PERIOD_DAYS,
    plans: PLAN_ORDER.map(k => ({ ...PLANS[k], ...planEconomics(PLANS[k]) })),
    accounts,
  });
}

/** End every active (non-bonus) plan/pass row now. */
async function endCurrent(accountId: string, now: Date): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('portal_passes')
    .update({ expires_at: now.toISOString() })
    .eq('account_id', accountId)
    .neq('source', BONUS_SOURCE)
    .gt('expires_at', now.toISOString());
  if (error) throw new Error(`end plan failed: ${error.message}`);
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { action?: string; accountId?: string; plan?: string; papers?: number } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const accountId = String(body.accountId || '');
  if (!UUID_RE.test(accountId)) return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  const svc = getSupabaseAdmin();
  const { data: acct } = await svc
    .from('portal_accounts')
    .select('id, airtable_student_id, deactivated_at')
    .eq('id', accountId)
    .maybeSingle<{ id: string; airtable_student_id: string | null; deactivated_at: string | null }>();
  if (!acct) return NextResponse.json({ error: 'No such account' }, { status: 404 });
  if (isTuitionAccount(acct)) return NextResponse.json({ error: 'Tuition students are never limited.' }, { status: 400 });

  const now = new Date();
  try {
    switch (body.action) {
      case 'set_plan': {
        if (!isPlanKey(body.plan)) return NextResponse.json({ error: 'plan must be lite, plus or max' }, { status: 400 });
        await endCurrent(accountId, now);
        const r = await grantPass({ accountId, days: PLAN_PERIOD_DAYS, source: 'manual', reference: `admin-plan:${accountId}:${body.plan}:${now.getTime()}`, tier: body.plan, now });
        return NextResponse.json({ ok: true, expiresAt: r.expiresAt });
      }
      case 'free':
        await endCurrent(accountId, now);
        return NextResponse.json({ ok: true });
      case 'bonus': {
        const n = Math.trunc(Number(body.papers));
        if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 50) return NextResponse.json({ error: 'papers must be a whole number from -50 to 50, not 0' }, { status: 400 });
        await grantBonusPapers({ accountId, papers: n, now });
        return NextResponse.json({ ok: true });
      }
      case 'reset_used': {
        const { data: rows } = await svc
          .from('portal_passes')
          .select('id, source, expires_at, tier, handins_used')
          .eq('account_id', accountId)
          .neq('source', BONUS_SOURCE)
          .gt('expires_at', now.toISOString())
          .order('expires_at', { ascending: false })
          .limit(1);
        const cur = rows?.[0];
        if (!cur) return NextResponse.json({ error: 'No plan running — give bonus papers instead.' }, { status: 400 });
        const { error } = await svc.from('portal_passes').update({ handins_used: 0 }).eq('id', cur.id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
