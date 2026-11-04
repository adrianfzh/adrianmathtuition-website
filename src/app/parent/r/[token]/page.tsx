// /parent/r/<token> — one weekly report, no login (SPEC-PARENT-REPORT.md). Like
// the link in a "track your parcel" SMS: the signed token opens exactly ONE
// report and stops working after 14 days. No name or id of the child is in the
// address. READ-ONLY: link previewers open this before the parent does.
import type { Metadata } from 'next';
import ParentReport, { ParentShell } from '@/components/ParentReport';
import { verifyReportToken, type ReportFacts } from '@/lib/parent-report';
import { FOCUS_URL, accountForIdentity, firstName, reportWords, whatsappShare } from '@/lib/parent-report-store';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Weekly report', robots: { index: false, follow: false } };

function Plain({ title, line }: { title: string; line: string }) {
  return (
    <ParentShell>
      <h1 className="mt-6 text-xl font-bold text-[#1e3a5f]">{title}</h1>
      <p className="mt-2 text-slate-600">{line}</p>
    </ParentShell>
  );
}

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reportId = verifyReportToken(token, process.env.SIGNUP_SECRET || '');
  if (!reportId) return <Plain title="This link no longer works" line="Report links stop working after 14 days. The next report will come by email on Sunday evening." />;

  const sb = createServiceClient();
  const { data: rep } = await sb.from('parent_reports').select('id, facts, link:parent_links(id, status, student_identity)').eq('id', reportId).maybeSingle();
  const link = (rep?.link ?? null) as unknown as { id: string; status: string; student_identity: string } | null;
  if (!rep || !link) return <Plain title="This link no longer works" line="We could not find this report." />;
  if (link.status !== 'active') return <Plain title="These reports have been stopped" line="You will not get any more weekly reports for this child." />;

  const account = await accountForIdentity(sb, link.student_identity);
  const words = reportWords(rep.facts as ReportFacts, firstName(account), FOCUS_URL);
  return (
    <ParentShell>
      <ParentReport words={words} shareUrl={whatsappShare(words.forwardText)} stop={{ action: '/api/parent/stop', fields: { token } }} />
    </ParentShell>
  );
}
