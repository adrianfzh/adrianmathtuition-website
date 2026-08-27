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
  hasActivePassInRows,
  isTuitionAccount,
  latestPassExpiry,
  type PassRow,
} from '@/lib/portal-passes';
import { passCheckoutUrl } from '@/lib/portal-join';
import { createServiceClient } from '@/lib/supabase-server';
import SignOutButton from '@/app/app/signout-button';

export const dynamic = 'force-dynamic';

const RENEW_WINDOW_MS = 3 * 86_400_000; // start offering renewal in the last 3 days

const INCLUDED = [
  'Practice questions from real school papers, marked line by line',
  'Hand in your own papers — get them marked with feedback',
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
  type Row = PassRow & { source: string };
  const { data } = await createServiceClient()
    .from('portal_passes')
    .select('expires_at, source')
    .eq('account_id', account.id);
  const rows = (data ?? []) as Row[];
  const now = new Date();
  const active = hasActivePassInRows(rows, now);
  const expiry = latestPassExpiry(rows);
  const msLeft = active && expiry ? expiry.getTime() - now.getTime() : 0;
  if (active && msLeft > RENEW_WINDOW_MS) redirect('/app');

  // Renewal wording: honest about WHAT is ending — the free trial or a paid
  // pass (the row holding the latest expiry says which).
  const renewing = active && expiry
    ? {
        endsLabel: sgtDate(expiry),
        isTrial: rows.find(r => Date.parse(r.expires_at) === expiry.getTime())?.source === 'trial',
      }
    : null;

  const checkout = passCheckoutUrl(process.env.STRIPE_PASS_LINK || '', account.id);
  const firstName = (account.display_name || account.email).split(' ')[0];

  return (
    <main className="min-h-screen bg-[hsl(45,100%,97%)] px-4 py-10">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center">
          <p className="font-display font-bold text-navy tracking-tight text-lg">AdrianMath</p>
          <h1 className="text-2xl font-bold text-navy mt-3 tracking-tight">
            {renewing
              ? `Your ${renewing.isTrial ? 'trial' : 'pass'} ends ${renewing.endsLabel}`
              : 'Your 30-day pass'}
          </h1>
          <p className="text-sm text-gray-600 mt-2">
            {renewing
              ? `Hi ${firstName} — keep access: S$29 for 30 days, added on top of the days you already have.`
              : `Hi ${firstName} — your account is ready. One pass unlocks everything below.`}
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-6">
          <div className="flex items-baseline justify-between mb-4">
            <p className="font-bold text-navy">30 days of AdrianMath</p>
            <p className="text-2xl font-bold text-navy">S$29</p>
          </div>
          <ul className="space-y-2.5 mb-5">
            {INCLUDED.map(item => (
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
              {renewing ? 'Keep access — S$29 for 30 days' : 'Get your pass — S$29'}
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
