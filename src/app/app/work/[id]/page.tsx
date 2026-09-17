// /app/work/[id] — do an assigned sheet IN the app (17 Sep 2026,
// SPEC-STUDENT-FIRST §12 use 2). The sheet's PDF becomes pages in the browser,
// the student writes on them with the same Pencil overlay, progress saves as
// they go, and Submit flattens the ink and hands in through the normal door
// (/api/portal/submit with assignmentId), so marking starts exactly as for a
// photographed paper. Ownership: the logged-in student's own assignment.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getStudentAssignment } from '@/lib/portal-assignments';
import { fileHref } from '@/lib/student-files-url';
import type { InkPages } from '@/lib/student-ink';
import WorkInApp from './work-in-app';

export const dynamic = 'force-dynamic';

export default async function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const a = await getStudentAssignment(id, sid);
  if (!a || !a.pdf_url) notFound();
  // Handed in already → the marked paper (or the list) is the place to be.
  if (a.status !== 'assigned') redirect(a.run_id ? `/app/marking/${a.run_id}` : '/app/marking');
  const { data: inkRow } = await getSupabaseAdmin().from('student_work_ink').select('pages, page_count').eq('assignment_id', a.id).eq('identity', sid).maybeSingle();
  const ink = (inkRow?.pages as InkPages | undefined) ?? null;
  const back = a.source_run_id ? `/app/marking/${a.source_run_id}` : '/app/assignments';
  return (
    <div className="space-y-4 pb-8">
      <Link href={back} className="inline-block text-sm font-semibold text-navy hover:underline">← Back</Link>
      <header className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
        <h1 className="font-bold text-navy text-lg leading-snug break-words">{a.title}</h1>
        <p className="text-xs text-gray-500 mt-1">Write on the pages here. Your work saves as you go. When you are done, tap Submit and it goes for marking.</p>
      </header>
      <WorkInApp assignmentId={a.id} title={a.title} pdfUrl={fileHref(a.pdf_url)} initial={ink} />
    </div>
  );
}
