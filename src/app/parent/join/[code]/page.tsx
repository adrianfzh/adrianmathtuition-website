// /parent/join/<code> — a parent confirms the weekly report for their child
// (SPEC-PARENT-REPORT.md). The child made the code in their app and sent it; the
// code is 8 random letters (no name in the address) and lasts 7 days. The parent
// reads what they agree to, gives an email, ticks, and confirms: that is the
// consent, recorded in consent_records with the exact words' version and hash.
import type { Metadata } from 'next';
import { ParentShell } from '@/components/ParentReport';
import { PARENT_NOTICE, normalizeInviteCode } from '@/lib/parent-report';
import { accountForIdentity, firstName } from '@/lib/parent-report-store';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Weekly report for parents', robots: { index: false, follow: false } };

export default async function JoinPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ e?: string }> }) {
  const { code: raw } = await params;
  const { e } = await searchParams;
  const code = normalizeInviteCode(raw);
  const sb = createServiceClient();
  const { data: link } = code
    ? await sb.from('parent_links').select('id, student_identity, status, invite_expires_at').eq('invite_code', code).maybeSingle()
    : { data: null };
  const live = link && link.status === 'pending' && link.invite_expires_at && new Date(link.invite_expires_at as string) > new Date();
  if (!live) {
    return (
      <ParentShell>
        <h1 className="mt-6 text-xl font-bold text-[#1e3a5f]">This link no longer works</h1>
        <p className="mt-2 text-slate-600">Links last 7 days and work once. Ask your child to send a new one from the app: Settings → Weekly report for a parent.</p>
      </ParentShell>
    );
  }
  const name = firstName(await accountForIdentity(sb, link.student_identity as string));
  return (
    <ParentShell>
      <h1 className="mt-4 text-2xl font-bold text-[#1e3a5f]">Weekly report{name ? ` for ${name}` : ''}</h1>
      <p className="mt-2 text-[16px] text-slate-700">{name ?? 'Your child'} asked us to send you a short report every Sunday evening: what they practised, how their marked papers went, and one thing to work on.</p>
      <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[15px] text-slate-700">
        {PARENT_NOTICE.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <form action="/api/parent/join" method="post" className="mt-5 space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <input type="hidden" name="code" value={code!} />
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Your email</span>
          <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px]" />
        </label>
        <label className="flex items-start gap-2 text-[15px] text-slate-700">
          <input name="agree" type="checkbox" value="yes" required className="mt-1 h-5 w-5" />
          <span>I am {name ? `${name}’s` : 'this child’s'} parent or guardian, and I agree to the points above.</span>
        </label>
        {e && <p className="text-sm text-red-600">{e === 'email' ? 'Please check the email address.' : 'Please tick the box to agree.'}</p>}
        <button type="submit" className="w-full rounded-xl bg-[#1e3a5f] px-4 py-3 text-[16px] font-semibold text-white">Confirm</button>
      </form>
      <p className="mt-4 text-xs text-slate-400">How we look after your child’s information: <a className="underline" href="/privacy">Privacy</a></p>
    </ParentShell>
  );
}
