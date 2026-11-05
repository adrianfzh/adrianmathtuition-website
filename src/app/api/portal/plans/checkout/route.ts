// POST /api/portal/plans/checkout { plan: 'lite'|'plus'|'max' } — start buying a
// self-serve plan (lib/plans.ts, SPEC-PLANS.md, 5 Nov 2026).
//
//   • Test site: NO money moves. The plan is granted at once as a 'manual' pass
//     row (reference test-checkout:…) so Adrian can try the whole loop. No
//     referral reward is paid for a pretend purchase.
//   • Main site: only while PLANS_OPEN_TO_STUDENTS is on — a real Stripe Checkout
//     page priced from lib/plans.ts; the stripe-webhook grants the plan when paid.
// Tuition accounts never buy (they are never limited).
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { grantPass, isTuitionAccount } from '@/lib/portal-passes';
import { PLANS, PLAN_PERIOD_DAYS, isPlanKey, plansActive, testCheckoutAllowed } from '@/lib/plans';
import { createPlanCheckout } from '@/lib/stripe-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!plansActive()) return NextResponse.json({ error: 'Not available.' }, { status: 404 });
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id, deactivated_at')
    .eq('id', user.id)
    .maybeSingle<{ id: string; airtable_student_id: string | null; deactivated_at: string | null }>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (isTuitionAccount(account)) return NextResponse.json({ error: 'Your lessons already include marking.' }, { status: 400 });

  let body: { plan?: unknown } = {};
  try { body = await req.json(); } catch { /* fall through to the check */ }
  if (!isPlanKey(body.plan)) return NextResponse.json({ error: 'Pick a plan.' }, { status: 400 });
  const plan = PLANS[body.plan];

  if (testCheckoutAllowed()) {
    const r = await grantPass({
      accountId: account.id,
      days: PLAN_PERIOD_DAYS,
      source: 'manual',
      reference: `test-checkout:${account.id}:${plan.key}:${Date.now()}`,
      tier: plan.key,
    });
    return NextResponse.json({ ok: true, test: true, plan: plan.key, expiresAt: r.expiresAt });
  }

  const baseUrl = new URL(req.url).origin;
  try {
    const s = await createPlanCheckout({
      accountId: account.id,
      plan: plan.key,
      label: `AdrianMath ${plan.label}`,
      priceCents: Math.round(plan.priceSgd * 100),
      papers: plan.papersPerPeriod,
      days: PLAN_PERIOD_DAYS,
      baseUrl,
    });
    return NextResponse.json({ ok: true, url: s.url });
  } catch (e) {
    console.error('[plans/checkout]', (e as Error).message);
    return NextResponse.json({ error: 'Payment page could not open — try again in a minute.' }, { status: 502 });
  }
}
