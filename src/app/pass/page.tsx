// /pass — the paywall + renewal page for stranger (self-serve) accounts.
// Served at BOTH /pass and /app/pass: next.config.ts rewrites /app/pass here
// so the page lives OUTSIDE the /app layout whose paywall gate redirects to
// it — under src/app/app it would redirect to itself forever.
//
// Flow: /join signup → signed in → /app. A REFERRED signup carries a 3-day
// trial pass and goes straight in; an unreferred one hits the layout gate
// (no airtable_student_id, no active pass) → redirect('/app/pass') → this
// page → Stripe payment link carrying ?client_reference_id=<account id> →
// the stripe-webhook grants 30 days in portal_passes → "Tap refresh" back to
// /app now passes the gate.
//
// Three branches for a signed-in caller:
//   tuition account            → /app (never owes anything here)
//   active pass, >3 days left  → /app (nothing to do)
//   active pass, ≤3 days left  → renew screen ("Your trial/pass ends <date>")
//   no active pass             → the paywall
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, sessionAccount } from '@/lib/portal-auth';
import {
  HANDINS_PER_PASS,
  currentPassInRows,
  handinAllowance,
  hasActivePassInRows,
  isTuitionAccount,
  latestPassExpiry,
  type MeteredPassRow,
} from '@/lib/portal-passes';
import { passCheckoutUrl } from '@/lib/portal-join';
import { createServiceClient } from '@/lib/supabase-server';
import SignOutButton from '@/app/app/signout-button';

export const dynamic = 'force-dynamic';

const RENEW_WINDOW_MS = 3 * 86_400_000; // start offering renewal in the last 3 days

// Two tiers, one meter (portal_passes.tier + handins_used — lib/portal-passes):
// everything is unlimited on both; ONLY marked hand-ins are counted.
const SHARED = [
  'Unlimited practice questions from real school papers, marked line by line',
  'Unlimited mock papers and topic sheets to print and sit',
  'Revision notes and worked examples for your level',
  'Full 30 days from the moment you pay — renewing later stacks on top',
] as const;

function sgtDate(d: Date): string {
  return d.toLocaleDateString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore',
  });
}

export default async function PassPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const account = await sessionAccount();
  if (!account) redirect('/login');
  if (isTuitionAccount(account)) redirect('/app'); // tuition rides free — no DB hit

  // One passes read decides everything (rows are service-only; RLS keeps the
  // anon client out of portal_passes entirely).
  const { data } = await createServiceClient()
    .from('portal_passes')
    .select('id, expires_at, source, tier, handins_used')
    .eq('account_id', account.id);
  const rows = (data ?? []) as MeteredPassRow[];
  const now = new Date();
  const active = hasActivePassInRows(rows, now);
  const expiry = latestPassExpiry(rows);
  const msLeft = active && expiry ? expiry.getTime() - now.getTime() : 0;
  if (active && msLeft > RENEW_WINDOW_MS) redirect('/app');

  // Renewal wording: honest about WHAT is ending — the free trial or a paid
  // pass (the row holding the latest expiry says which). The meter line reads
  // the CURRENT pass (active, latest expiry — the row hand-ins count against).
  const currentPass = currentPassInRows(rows, now);
  const renewing = active && expiry
    ? {
        endsLabel: sgtDate(expiry),
        isTrial: rows.find(r => Date.parse(r.expires_at) === expiry.getTime())?.source === 'trial',
      }
    : null;

  const checkout = passCheckoutUrl(process.env.STRIPE_PASS_LINK || '', account.id);
  // Intensive rides the same client_reference_id pattern on its own payment
  // link; until STRIPE_PASS_LINK_INTENSIVE exists the card simply doesn't render.
  const checkoutIntensive = passCheckoutUrl(process.env.STRIPE_PASS_LINK_INTENSIVE || '', account.id);
  const firstName = (account.display_name || account.email).split(' ')[0];

  // Offboarding (2026-08-28): a DEACTIVATED ex-tuition account reaches this
  // page because isTuitionAccount() above no longer waves it through. Name
  // what happened — their student access ended, not "your account is ready" —
  // and offer the exact same S$29 card underneath. (With an active pass they
  // are a paying member again, so the renewal branch wins as usual.)
  const offboarded = Boolean(account.deactivated_at) && Boolean(account.airtable_student_id?.trim());

  return (
    <main className="min-h-screen bg-[hsl(45,100%,97%)] px-4 py-10">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center">
          <p className="font-display font-bold text-navy tracking-tight text-lg">AdrianMath</p>
          <h1 className="text-2xl font-bold text-navy mt-3 tracking-tight">
            {renewing
              ? `Your ${renewing.isTrial ? 'trial' : 'pass'} ends ${renewing.endsLabel}`
              : offboarded
                ? 'Your student access has ended'
                : 'Your 30-day pass'}
          </h1>
          <p className="text-sm text-gray-600 mt-2">
            {renewing
              ? `Hi ${firstName} — keep access: a new pass adds 30 days on top of the days you already have.`
              : offboarded
                ? `Hi ${firstName} — lessons with Adrian have wrapped up, but everything you built here is saved. One pass keeps it all open.`
                : `Hi ${firstName} — your account is ready. One pass unlocks everything below.`}
          </p>
          {renewing && currentPass && (
            <p className="inline-block text-xs font-semibold text-navy bg-[hsl(45,80%,92%)] rounded-full px-3 py-1 mt-3">
              {Math.min(currentPass.handins_used ?? 0, handinAllowance(currentPass))} of {handinAllowance(currentPass)} marked papers used on this pass
            </p>
          )}
        </div>

        {/* Standard — the primary card */}
        <div className="bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-6 border-2 border-navy/80">
          <div className="flex items-baseline justify-between mb-1">
            <p className="font-bold text-navy">Standard — 30 days</p>
            <p className="text-2xl font-bold text-navy">S$29</p>
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-3">
            {HANDINS_PER_PASS.standard} full papers marked with feedback (1 a day) — everything else unlimited
          </p>
          <ul className="space-y-2.5 mb-5">
            {SHARED.map(item => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className="shrink-0 text-emerald-600 font-bold">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {checkout ? (
            <a
              href={checkout}
              className="block w-full bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3 text-center text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {renewing ? 'Keep access — S$29 for 30 days' : 'Get Standard — S$29'}
            </a>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
              The payment link isn&apos;t set up right now — please check back soon.
            </p>
          )}
          <p className="text-xs text-gray-500 mt-3 text-center">
            One-time payment — no subscription, nothing renews by itself.
          </p>
        </div>

        {/* Intensive — rendered only once its payment link is configured */}
        {checkoutIntensive && (
          <div className="bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-6">
            <div className="flex items-baseline justify-between mb-1">
              <p className="font-bold text-navy">Intensive — 30 days</p>
              <p className="text-2xl font-bold text-navy">S$49</p>
            </div>
            <p className="text-sm font-semibold text-gray-800 mb-3">
              {HANDINS_PER_PASS.intensive} full papers marked with feedback (up to 3 a day) — for exam season
            </p>
            <p className="text-sm text-gray-700 mb-5">Everything in Standard, with more than twice the marking.</p>
            <a
              href={checkoutIntensive}
              className="block w-full border-2 border-navy text-navy rounded-xl py-3 text-center text-sm font-semibold hover:bg-navy hover:text-[hsl(45,100%,96%)] transition-colors"
            >
              {renewing ? 'Keep access — S$49 Intensive' : 'Get Intensive — S$49'}
            </a>
          </div>
        )}

        {renewing ? (
          <p className="text-center text-sm text-gray-600">
            Still on your {renewing.isTrial ? 'trial' : 'pass'} —{' '}
            <Link href="/app" className="text-navy font-semibold underline underline-offset-2">keep practising</Link>.
          </p>
        ) : (
          <p className="text-center text-sm text-gray-600">
            Paid a moment ago?{' '}
            <Link href="/app" className="text-navy font-semibold underline underline-offset-2">Tap refresh</Link>
            {' '}— passes activate automatically within a minute.
          </p>
        )}

        <div className="text-center">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
