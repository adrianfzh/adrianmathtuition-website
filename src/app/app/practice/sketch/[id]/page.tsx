// 📈 One checked sketch (SPEC-SKETCH-CHECK.md): the photo with the red pen and the
// correct sketch beside it, then the checklist (what is wrong first, each with its
// fix), then what a mark scheme would take off. Polls while the bot is still reading.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { h2ToolOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { fileHref } from '@/lib/student-files-url';
import { sketchQuestionById, headline, checklist, deductionLine } from '@/lib/sketch-check';
import { loadSketch } from '@/lib/sketch-check-store';
import { MathText } from '../../question-view';
import RunPoll from '../../../humanities/[id]/run-poll';

export const dynamic = 'force-dynamic';
const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const UUID = /^[0-9a-f-]{36}$/i;

export default async function SketchResult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await sessionAccount().catch(() => null);
  const isAdmin = !(await viewingAsStudent()) && (await isNotesAuthed());
  if (!account && !isAdmin) redirect('/login');
  if (!(await h2ToolOpen('sketch', account))) redirect('/app/practice');
  if (!UUID.test(id)) redirect('/app/practice/sketch');
  const row = await loadSketch(id, isAdmin ? { admin: true } : account ? portalIdentity(account) : null);
  if (!row) redirect('/app/practice/sketch');

  const q = sketchQuestionById(row.question_ref);
  const busy = row.status === 'queued' || row.status === 'checking';
  const report = row.status === 'checked' ? row.report : null;
  const shown = q?.shown ?? row.shown;

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <RunPoll active={busy} />
      <div className="pt-1">
        <Link href="/app/practice/sketch" className="text-xs text-gray-500">‹ Check my sketch</Link>
        {q && <p className="text-xs text-gray-400 mt-1">{q.source}</p>}
        {shown && <p className="text-lg text-navy mt-1"><MathText text={shown.includes('\\') ? `$${shown}$` : shown} /></p>}
        <h1 className={`text-base font-bold mt-2 ${report && report.deductions.length === 0 ? 'text-emerald-700' : 'text-navy'}`}>{headline(report, row.status)}</h1>
      </div>

      {busy && (
        <div className={`${CARD} p-4 text-sm text-gray-600`}>
          Reading your sketch. This takes about 15 seconds.
        </div>
      )}

      {row.status === 'failed' && (
        <div className={`${CARD} p-4 space-y-2`}>
          <p className="text-sm text-gray-800">{row.error ?? 'Something went wrong.'}</p>
          <Link href="/app/practice/sketch" className="inline-block text-sm font-semibold text-navy">Try again ›</Link>
        </div>
      )}

      {report && row.result_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileHref(row.result_url)} alt="Your sketch with the red pen, and the sketch with every feature" className="w-full rounded-2xl border border-black/10 bg-white" />
      )}

      {report && (
        <section className={`${CARD} p-4 space-y-2`}>
          <ul className="space-y-1.5">
            {checklist(report).map((l, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span aria-hidden className={`w-4 shrink-0 font-bold ${l.mark === '✓' ? 'text-emerald-600' : l.mark === '?' ? 'text-amber-600' : 'text-red-600'}`}>{l.mark}</span>
                <span className="min-w-0 flex flex-wrap items-baseline gap-x-2">
                  {l.name && <span className="text-xs text-gray-500">{l.name}</span>}
                  {l.tex ? <span className="text-gray-900"><MathText text={`$${l.tex}$`} /></span> : <span className="text-gray-800">{l.text}</span>}
                  {l.short && <span className={l.mark === '✓' ? 'text-gray-500' : 'text-red-700'}>{l.short}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-gray-600 pt-1 border-t border-black/5">{deductionLine(report)}</p>
        </section>
      )}

      {!busy && (
        <Link href={q ? `/app/practice/sketch?q=${q.id}` : '/app/practice/sketch'} className="block text-center rounded-xl bg-navy text-white font-semibold py-3">
          Sketch it again
        </Link>
      )}
    </div>
  );
}
