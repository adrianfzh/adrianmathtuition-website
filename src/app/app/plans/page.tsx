// /app/plans — the self-serve plans page (lib/plans.ts, SPEC-PLANS.md, 5 Nov 2026).
// Shows where the account stands (free paper / plan papers used) and the three
// plans. Prices and limits all come from lib/plans.ts. While plans are off (the
// main site until PLANS_OPEN_TO_STUDENTS), this page sends strangers to the old
// /app/pass. Tuition students never see it. Not in the sitemap (behind login).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { isTuitionAccount } from '@/lib/portal-passes';
import { getPlanStatus } from '@/lib/plan-usage';
import { PLANS, PLAN_ORDER, PLAN_PERIOD_DAYS, plansActive, sgd, testCheckoutAllowed } from '@/lib/plans';
import ChoosePlan from './choose-plan';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-5';

function sgtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const account = await currentAccount();
  if (isTuitionAccount(account)) redirect('/app');
  if (!plansActive()) redirect('/app/pass');
  const { paid } = await searchParams;
  const st = await getPlanStatus(account, portalIdentity(account));
  if (st.kind === 'tuition') redirect('/app');

  const currentPlan = st.kind === 'plan' ? st.plan : null;
  return (
    <div className="space-y-4 pb-24 sm:pb-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold text-navy pt-1">Plans</h1>
      {testCheckoutAllowed() && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Test site — choosing a plan here takes no money.
        </p>
      )}
      {paid && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">Thank you — your plan is on.</p>}

      {/* Where you stand */}
      <div className={`${CARD} text-center`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {st.kind === 'free' ? 'Free' : `${st.label} plan`}
        </p>
        <p className="text-3xl font-bold text-navy mt-1">
          {st.left}
          <span className="text-base font-semibold text-gray-500"> of {st.allowance} left</span>
        </p>
        <p className="text-sm text-gray-600 mt-1">
          {st.kind === 'free'
            ? (st.allowance === 1 ? 'free marked paper' : 'free marked papers')
            : `marked papers until ${sgtDate(st.endsAt)}`}
        </p>
        <p className="text-xs text-gray-500 mt-2">Practice questions are free on every plan.</p>
      </div>

      {/* The plans */}
      {PLAN_ORDER.map((k) => {
        const p = PLANS[k];
        const isCurrent = currentPlan === k;
        return (
          <div key={k} className={`${CARD} ${k === 'plus' ? 'border-2 border-navy/80' : ''}`}>
            <div className="flex items-baseline justify-between">
              <p className="font-bold text-navy">{p.label}</p>
              <p className="text-2xl font-bold text-navy">{sgd(p.priceSgd)}<span className="text-sm font-semibold text-gray-500"> / {PLAN_PERIOD_DAYS} days</span></p>
            </div>
            <p className="text-sm font-semibold text-gray-800 mt-1">{p.papersPerPeriod} full papers marked</p>
            <p className="text-sm text-gray-600">{p.blurb}{p.dailyCap ? ` · up to ${p.dailyCap} a day` : ''}</p>
            <div className="mt-3">
              <ChoosePlan plan={k} label={isCurrent ? `Add another ${PLAN_PERIOD_DAYS} days of ${p.label}` : `Choose ${p.label}`} />
            </div>
          </div>
        );
      })}

      <p className="text-xs text-gray-500 text-center">
        A new plan starts when your current one ends, so no days are lost.
      </p>
      <p className="text-center">
        <Link href="/app" className="text-sm text-navy font-semibold underline underline-offset-2">Back to Home</Link>
      </p>
    </div>
  );
}
