// /app/assignments/[id] — one worksheet from Adrian: the PDF (view / open /
// print) and the door into the existing hand-in flow, pre-tagged with this
// assignment so the run auto-releases into Marked papers and flips the
// assignment to marked. A question-kind id redirects to the practice grader.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { getStudentAssignment } from '@/lib/portal-assignments';
import { assignmentHref, dueLabel, isOverdue } from '@/lib/assignments';
import { getSupabaseAdmin } from '@/lib/supabase';

import { fileHref } from '@/lib/student-files-url';
export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await currentAccount();
  const a = await getStudentAssignment(id, portalIdentity(account));
  if (!a) notFound();
  if (a.kind === 'question') redirect(assignmentHref(a));

  const due = dueLabel(a.due_on);
  const overdue = isOverdue(a);

  // If it's been marked, find whether the run is released so we can link it.
  let released = false;
  if (a.run_id) {
    const { data } = await getSupabaseAdmin()
      .from('paper_marking_runs').select('released_at').eq('id', a.run_id).maybeSingle();
    released = !!data?.released_at;
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-baseline justify-between pt-1">
        <Link href="/app/assignments" className="text-sm text-gray-500 hover:text-navy">← From Adrian</Link>
      </div>

      <div className={`${CARD} p-5 space-y-3`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">📬 Worksheet from Adrian</p>
          <h1 className="text-lg font-bold text-navy">{a.title}</h1>
          <p className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2">
            {a.topic && <span>{a.topic}</span>}
            {due && a.status !== 'marked' && <span className={overdue ? 'text-amber-700' : ''}>· {due}</span>}
          </p>
        </div>
        {a.note && <p className="text-sm text-gray-700 italic border-l-2 border-[hsl(43,90%,60%)] pl-3">“{a.note}”</p>}

        {a.status === 'assigned' && (
          <Link
            href={`/app/submit?assignment=${a.id}`}
            className="block text-center text-sm font-bold bg-navy text-[hsl(45,100%,96%)] rounded-xl py-3"
          >
            📷 Submit your working
          </Link>
        )}
        {a.status === 'submitted' && (
          <p className="text-sm bg-blue-50 text-blue-800 rounded-xl px-3 py-2.5">
            ⏳ Sent for marking — it&apos;ll appear in <Link href="/app/marking" className="underline font-semibold">Marked papers</Link> when it&apos;s done.
          </p>
        )}
        {a.status === 'marked' && (
          <p className="text-sm bg-emerald-50 text-emerald-800 rounded-xl px-3 py-2.5">
            ✅ Marked{a.score != null && a.out_of != null ? ` — ${a.score}/${a.out_of}` : ''}.{' '}
            {released
              ? <Link href="/app/marking" className="underline font-semibold">See it in Marked papers →</Link>
              : 'Adrian is checking it before release.'}
          </p>
        )}

        {a.pdf_url && (
          <div className="flex gap-2">
            <a href={fileHref(a.pdf_url)} target="_blank" rel="noopener noreferrer"
              className="flex-1 text-center text-sm font-semibold text-navy rounded-xl px-4 py-2.5 border border-black/10 hover:bg-navy/5">
              ↗ Open PDF
            </a>
            <a href={fileHref(a.pdf_url)} download
              className="flex-1 text-center text-sm font-semibold text-navy rounded-xl px-4 py-2.5 border border-black/10 hover:bg-navy/5">
              ⬇ Download to print
            </a>
          </div>
        )}
      </div>

      {a.pdf_url && (
        <div className={`${CARD} overflow-hidden`}>
          <iframe
            src={`${fileHref(a.pdf_url)}#toolbar=0&view=FitH`}
            title={a.title}
            className="w-full bg-white"
            style={{ height: '70vh' }}
          />
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Do it on paper, then photograph every page and submit. It&apos;s marked by Adrian&apos;s marking pipeline and released to you automatically.
      </p>
    </div>
  );
}
