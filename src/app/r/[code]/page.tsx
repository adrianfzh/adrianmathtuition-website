// /r/<studentRecId> — a family's shareable referral landing page.
//
// Parents forward this link; it (a) greets the new family with WHO recommended
// them, (b) drops a 90-day cookie so a later signup on this device attaches the
// referrer exactly (see lib/referral-link.ts), and (c) pre-fills the WhatsApp
// message to Adrian with the referrer marker, so even the fully-manual funnel
// (parent → WhatsApp → Adrian mints a signup link) carries exact attribution.
//
// Privacy: renders the referrer's FIRST NAME only. Rec ids are 17-char
// unguessable tokens; an invalid/unknown code still renders the page, just
// without a name (also what the health-check probes, so it has no data
// dependency). Single-record GET returns all fields (Airtable ignores fields[]
// there) — we read Student Name and nothing else.

import type { Metadata } from 'next';
import Link from 'next/link';
import { airtableRequest } from '@/lib/airtable';
import { REC_ID_RE } from '@/lib/referral-link';
import SaveRef from './save-ref';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "You're invited — Adrian's Math Tuition",
  robots: { index: false, follow: false },
};

async function referrerFirstName(code: string): Promise<string | null> {
  if (!REC_ID_RE.test(code)) return null;
  try {
    const rec = await airtableRequest('Students', `/${code}`);
    const full = (rec?.fields?.['Student Name'] as string) || '';
    return full.trim().split(/\s+/)[0] || null;
  } catch {
    return null; // unknown id → generic invite, never an error page
  }
}

export default async function ReferralLanding({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const firstName = await referrerFirstName(code);
  const validCode = REC_ID_RE.test(code) && firstName !== null;

  const waText = encodeURIComponent(
    firstName
      ? `Hi Adrian! ${firstName}'s family shared your tuition with us — we'd like to find out more about a trial lesson. (ref: ${code})`
      : `Hi Adrian! A friend shared your tuition with us — we'd like to find out more about a trial lesson.`
  );
  const waHref = `https://wa.me/6591397985?text=${waText}`;

  return (
    <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-5 py-10">
      {validCode && <SaveRef id={code} name={firstName || ''} />}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="text-4xl mb-4">🎓</div>
        <h1 className="text-2xl font-bold text-slate-900 leading-snug">
          {firstName
            ? <>{firstName}&apos;s family recommends<br />Adrian&apos;s Math Tuition</>
            : <>You&apos;ve been invited to<br />Adrian&apos;s Math Tuition</>}
        </h1>
        <p className="mt-4 text-[15px] text-slate-600 leading-relaxed">
          Small-group Secondary and JC math lessons in Singapore — with step-by-step
          AI homework help between classes, marked practice papers, and a print
          station stocked with school exam questions.
        </p>
        <a
          href={waHref}
          className="mt-6 inline-block w-full rounded-xl bg-[#25D366] px-5 py-3.5 text-[16px] font-semibold text-white shadow hover:opacity-90 transition"
        >
          💬 WhatsApp Adrian about a trial
        </a>
        <Link
          href="/"
          className="mt-3 inline-block w-full rounded-xl border-[1.5px] border-slate-300 px-5 py-3 text-[15px] font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          See how lessons work
        </Link>
        {firstName && (
          <p className="mt-5 text-[13px] text-slate-400">
            Signing up through this page links your registration to {firstName}&apos;s
            family automatically.
          </p>
        )}
      </div>
    </main>
  );
}
