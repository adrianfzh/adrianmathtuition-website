// /app/languages/[id] — one essay: the report (SPEC-ESSAY-MARKING.md §What
// comes back), or its status while the bot reads it. A student opens only their
// own; Adrian's admin cookie opens any (the desk's link lands here).
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { essayMarkingOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { loadEssay } from '@/lib/essay-runs';
import { essayRubricFor } from '@/lib/essay-rubric';
import { studentStatusLine } from '@/lib/essay-report';
import { essayTitle, kindLabel } from '../essay-cards';
import EssayReportView from './essay-report-view';
import EssayPoll from './essay-poll';

export const dynamic = 'force-dynamic';

export default async function EssayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await essayMarkingOpen())) redirect('/app');
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = (await isNotesAuthed()) && !(await viewingAsStudent());
  const account = await currentAccount().catch(() => null);
  const sid = account ? portalIdentity(account) : null;
  const row = await loadEssay(id, admin ? null : sid);
  if (!row) notFound();

  const rubric = essayRubricFor(row.subject, row.essay_kind);
  const inFlight = row.status === 'queued' || row.status === 'marking';
  const when = new Date(row.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' });

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <EssayPoll active={inFlight} />
      <div className="pt-1">
        <Link href="/app/languages" className="text-[12px] text-gray-500 hover:text-navy">‹ Languages</Link>
        <h1 className="text-xl font-bold text-navy leading-tight mt-1">{essayTitle(row)}</h1>
        <p className="text-[12px] text-gray-500">{kindLabel(row.essay_kind)} · {when} · {row.word_count ?? '—'} words{admin && row.student_name ? ` · ${row.student_name}` : ''}</p>
      </div>

      {row.status === 'marked' && row.report && rubric ? (
        <EssayReportView text={row.essay_text} report={row.report} criteria={rubric.criteria} subject={row.subject} />
      ) : row.status === 'held' && row.report && rubric ? (
        <>
          <p className="text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2">{studentStatusLine('held')}</p>
          {admin && row.held_reason && <p className="text-[12px] text-amber-800 px-1">Adrian only: {row.held_reason}</p>}
          <EssayReportView text={row.essay_text} report={row.report} criteria={rubric.criteria} subject={row.subject} />
        </>
      ) : (
        <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm space-y-3">
          <p className="text-sm text-gray-700">{studentStatusLine(row.status)}</p>
          {inFlight && <p className="text-[12px] text-gray-400">This page refreshes by itself.</p>}
          {admin && row.error && <p className="text-[12px] text-rose-700">Adrian only: {row.error}</p>}
          <details className="text-[13px] text-gray-600">
            <summary className="cursor-pointer text-gray-500">Your essay as handed in</summary>
            <div className="mt-2 whitespace-pre-wrap leading-relaxed">{row.essay_text}</div>
          </details>
        </div>
      )}
    </div>
  );
}
