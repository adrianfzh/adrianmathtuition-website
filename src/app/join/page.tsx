// /join — public landing for the invite → self-serve signup → paywall loop.
//
// Every portal student carries a personal share link (the 🎟 Invite card on
// /app Home): https://www.adrianmathtuition.com/join?ref=<their account id>.
// This page resolves the ref server-side to the inviter's first name ("Zane
// invited you"), pitches the S$29/30-day pass, and hosts the stranger signup
// form (join-form.tsx → POST /api/portal/join). Already-signed-in visitors go
// straight to /app — the layout gate there decides whether they still owe a
// pass.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/portal-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { validateInviteRef } from '@/lib/portal-join';
import JoinForm from './join-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Join AdrianMath — practice, mock papers and marking',
  description:
    'Practise real school exam questions with instant marking, hand in papers for full feedback, and read the revision notes — S$29 for 30 days.',
};

const BENEFITS = [
  ['✏️', 'Practise questions from real school papers — marked line by line, on the spot'],
  ['📄', 'Hand in a full paper and get it marked with feedback, like a tuition student'],
  ['📚', 'Revision notes and worked examples for your level'],
] as const;

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  // Signed-in visitors have nothing to sign up for — the /app gate takes over.
  const user = await getSessionUser();
  if (user) redirect('/app');

  // Resolve the ref to a real inviter account. The name is cosmetic, but
  // `inviterFound` also decides the pitch: only a signup the API will actually
  // attribute gets the "3 days free" wording (the trial grant in
  // /api/portal/join fires on the same condition — a uuid that matches no
  // account must not promise a trial it won't get).
  const validRef = validateInviteRef(ref);
  let inviterFound = false;
  let inviterFirstName: string | null = null;
  if (validRef) {
    try {
      const { data } = await createServiceClient()
        .from('portal_accounts')
        .select('id, display_name')
        .eq('id', validRef)
        .maybeSingle<{ id: string; display_name: string | null }>();
      inviterFound = !!data;
      inviterFirstName = (data?.display_name || '').trim().split(' ')[0] || null;
    } catch { /* cosmetic — worst case the generic pitch shows */ }
  }

  return (
    <main className="min-h-screen bg-[hsl(45,100%,97%)] px-4 py-10">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center">
          <p className="font-display font-bold text-navy tracking-tight text-lg">AdrianMath</p>
          <h1 className="text-2xl font-bold text-navy mt-3 tracking-tight">
            You&apos;re invited to AdrianMath
          </h1>
          <p className="text-sm text-gray-600 mt-2">
            {inviterFirstName
              ? `${inviterFirstName} invited you to practise here.`
              : 'A friend shared their practice portal with you.'}
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] p-5">
          <ul className="space-y-2.5">
            {BENEFITS.map(([icon, text]) => (
              <li key={text} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className="shrink-0">{icon}</span>
                <span>{text}</span>
              </li>
            ))}
            <li className="flex items-start gap-2.5 text-sm text-gray-700">
              <span className="shrink-0">💳</span>
              <span>
                {inviterFound ? (
                  <><span className="font-semibold text-navy">3 days free, then S$29 for 30 days</span> — one-time payment, no subscription</>
                ) : (
                  <>S$29 for 30 days — one-time payment, no subscription, no auto-renew</>
                )}
              </span>
            </li>
          </ul>
        </div>

        <JoinForm refId={validRef} trial={inviterFound} />

        <p className="text-center text-xs text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="text-navy underline underline-offset-2">Log in</Link>
        </p>
      </div>
    </main>
  );
}
