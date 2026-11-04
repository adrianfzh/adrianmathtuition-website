// /parent — the parent's own page (SPEC-PARENT-REPORT.md): every child they
// are linked to, each with the latest weekly report. Opened on the phone that
// confirmed the link (a 180-day cookie, like staying signed in). Can be added to
// the Home Screen today; the app's parent view will show this same page.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import ParentReport, { ParentShell } from '@/components/ParentReport';
import { PARENT_COOKIE, shortDate, verifyParentCookie, type ReportFacts } from '@/lib/parent-report';
import { sgtDateISO } from '@/lib/sgt';
import { FOCUS_URL, accountForIdentity, firstName, reportWords, whatsappShare } from '@/lib/parent-report-store';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Weekly reports', robots: { index: false, follow: false } };

export default async function ParentHome({ searchParams }: { searchParams: Promise<{ linked?: string }> }) {
  const { linked } = await searchParams;
  const parentId = verifyParentCookie((await cookies()).get(PARENT_COOKIE)?.value, process.env.SIGNUP_SECRET || '');
  if (!parentId) {
    return (
      <ParentShell>
        <h1 className="mt-6 text-xl font-bold text-[#1e3a5f]">Weekly reports</h1>
        <p className="mt-2 text-slate-600">Open the latest report from your Sunday email. To link a child, ask them to send you a link from the app: Settings → Weekly report for a parent.</p>
      </ParentShell>
    );
  }
  const sb = createServiceClient();
  const { data: links } = await sb.from('parent_links').select('id, student_identity, linked_at').eq('parent_id', parentId).eq('status', 'active').order('linked_at');
  const children = await Promise.all(((links ?? []) as { id: string; student_identity: string; linked_at: string }[]).map(async (l) => {
    const [account, rep] = await Promise.all([
      accountForIdentity(sb, l.student_identity),
      sb.from('parent_reports').select('facts').eq('link_id', l.id).order('week_start', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return { link: l, name: firstName(account), facts: (rep.data?.facts as ReportFacts | undefined) ?? null };
  }));

  return (
    <ParentShell>
      <h1 className="mt-3 text-2xl font-bold text-[#1e3a5f]">Weekly reports</h1>
      {linked && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Done — you are linked. The first report comes on Sunday evening by email.</p>}
      {!children.length && <p className="mt-3 text-slate-600">No child is linked right now.</p>}
      {children.map(({ link, name, facts }) => facts ? (
        <ParentReport key={link.id} words={reportWords(facts, name, FOCUS_URL)} shareUrl={whatsappShare(reportWords(facts, name, FOCUS_URL).forwardText)}
          stop={{ action: '/api/parent/stop', fields: { link: link.id } }} />
      ) : (
        <article key={link.id} className="mt-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-[#1e3a5f]">{name ?? 'Your child'}</h2>
          <p className="mt-1 text-slate-600">Linked on {shortDate(sgtDateISO(new Date(link.linked_at)))}. The first report comes on Sunday evening.</p>
          <form action="/api/parent/stop" method="post" className="mt-3">
            <input type="hidden" name="link" value={link.id} />
            <button type="submit" className="text-sm text-slate-400 underline">Stop these reports</button>
          </form>
        </article>
      ))}
    </ParentShell>
  );
}
