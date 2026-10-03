// /app/humanities/<run id> — the feedback on one answer (SPEC-HUMANITIES.md §2).
// Order: the level range and the ONE lift → the student's answer with each claim
// tagged → what a top answer does → the level ladder → sources and a model
// answer, folded. Never a mark. A student sees only their own row.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { loadHumanitiesRun } from '@/lib/humanities-runs';
import { questionById, modelAnswer, ALL_TAGS, tagsFor } from '@/lib/humanities-questions';
import { levelLabel, segmentAnswer, humanitiesStatusLine } from '@/lib/humanities-report';
import { SourceCards } from '../sources';
import { skillLabel } from '../skills';
import RunPoll from './run-poll';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

const TAG_STYLE: Record<string, { mark: string; chip: string }> = {
  from_source: { mark: 'bg-emerald-100 decoration-emerald-500', chip: 'bg-emerald-100 text-emerald-800' },
  not_supported: { mark: 'bg-rose-100 decoration-rose-500', chip: 'bg-rose-100 text-rose-800' },
  uses_context: { mark: 'bg-sky-100 decoration-sky-500', chip: 'bg-sky-100 text-sky-800' },
  evaluates: { mark: 'bg-violet-100 decoration-violet-500', chip: 'bg-violet-100 text-violet-800' },
  // Structured response (answered from own knowledge).
  point: { mark: 'bg-amber-100 decoration-amber-500', chip: 'bg-amber-100 text-amber-800' },
  example: { mark: 'bg-sky-100 decoration-sky-500', chip: 'bg-sky-100 text-sky-800' },
  link: { mark: 'bg-emerald-100 decoration-emerald-500', chip: 'bg-emerald-100 text-emerald-800' },
  not_explained: { mark: 'bg-rose-100 decoration-rose-500', chip: 'bg-rose-100 text-rose-800' },
  weighs: { mark: 'bg-violet-100 decoration-violet-500', chip: 'bg-violet-100 text-violet-800' },
};
const tagLabel = (k: string) => ALL_TAGS.find(t => t.key === k)?.label ?? k;

export default async function HumanitiesRunPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await humanitiesOpen())) redirect('/app');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const admin = (await isNotesAuthed()) && !(await viewingAsStudent());
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const run = await loadHumanitiesRun(id, admin ? null : sid);
  if (!run) notFound();
  const ctx = questionById(run.question_id);
  if (!ctx) notFound();

  const inFlight = run.status === 'queued' || run.status === 'marking';
  const report = run.report;
  const max = run.levels_max ?? ctx.scheme.levels.length;
  const segs = report ? segmentAnswer(run.answer_text, report.claims ?? []) : [{ text: run.answer_text, claim: null }];
  const usedTags = tagsFor(run.skill).filter(t => report?.claims?.some(c => c.tag === t.key));
  const model = modelAnswer(ctx.question);
  const lo = report ? Math.min(report.level_lo, report.level_hi) : 0;
  const hi = report ? Math.max(report.level_lo, report.level_hi) : 0;

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <RunPoll active={inFlight} />
      <Link href="/app/humanities/answers" className="text-[12px] text-gray-500 hover:text-navy">‹ Your answers</Link>
      <div>
        <p className="text-[12px] font-semibold text-amber-800">{skillLabel(run.skill)} · {ctx.set.title}</p>
        <h1 className="text-xl font-bold text-navy leading-snug">{ctx.question.question}</h1>
      </div>

      {!report && (
        <p className={`text-sm rounded-2xl px-3 py-2 border ${run.status === 'failed' ? 'text-rose-700 bg-rose-50 border-rose-100' : 'text-gray-700 bg-amber-50 border-amber-100'}`}>
          {humanitiesStatusLine(run.status)}
        </p>
      )}
      {!report && run.status === 'failed' && (
        <Link href={`/app/humanities/q/${ctx.question.id}`} className="inline-block text-sm font-semibold text-amber-800">Try this question again ›</Link>
      )}

      {report && (
        <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm space-y-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Where this answer sits</p>
            <p className="text-2xl font-bold text-navy">{levelLabel(report.level_lo, report.level_hi, max)}</p>
            {run.status === 'held' && <p className="text-[13px] text-gray-600 mt-1">{humanitiesStatusLine('held')}</p>}
          </div>
          {report.lift && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2.5">
              <p className="text-[12px] font-semibold text-amber-800">To lift it</p>
              <p className="text-[15px] font-semibold text-navy leading-snug">{report.lift}</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Your answer</p>
        {usedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {usedTags.map(t => (
              <span key={t.key} className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TAG_STYLE[t.key]?.chip ?? 'bg-gray-100 text-gray-700'}`}>{t.label}</span>
            ))}
          </div>
        )}
        <p className="text-[15px] text-gray-800 leading-loose whitespace-pre-line">
          {segs.map((s, i) => s.claim
            ? <mark key={i} className={`rounded px-0.5 text-inherit underline decoration-2 underline-offset-4 ${TAG_STYLE[s.claim.tag]?.mark ?? 'bg-gray-100'}`}>{s.text}</mark>
            : <span key={i}>{s.text}</span>)}
        </p>
        {report && report.claims?.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-black/5 pt-3">
            {segs.filter(s => s.claim).map((s, i) => (
              <li key={i} className="text-[13px] leading-snug">
                <span className={`inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 mr-1.5 ${TAG_STYLE[s.claim!.tag]?.chip ?? 'bg-gray-100 text-gray-700'}`}>{tagLabel(s.claim!.tag)}</span>
                <span className="text-gray-500">“{s.text.length > 70 ? s.text.slice(0, 67) + '…' : s.text}”</span>
                {s.claim!.note && <span className="block text-gray-800 mt-0.5">{s.claim!.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {report && report.gap?.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">What a top answer does</p>
          <ul className="space-y-1.5">
            {report.gap.map((g, i) => <li key={i} className="text-[15px] text-gray-800 leading-snug">{g}</li>)}
          </ul>
        </div>
      )}

      {report && (
        <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400 mb-2">The levels for {ctx.scheme.label.toLowerCase()}</p>
          <ol className="space-y-1.5">
            {ctx.scheme.levels.map(l => {
              const here = l.level >= lo && l.level <= hi;
              return (
                <li key={l.level} className={`flex gap-2.5 rounded-2xl px-3 py-2 text-sm ${here ? 'bg-amber-50 border border-amber-200' : ''}`}>
                  <span className={`shrink-0 font-bold ${here ? 'text-amber-800' : 'text-gray-400'}`}>L{l.level}</span>
                  <span className={here ? 'text-navy' : 'text-gray-600'}>{l.does}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <details className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
        <summary className="text-sm font-semibold text-navy cursor-pointer">{ctx.set.kind === 'structured' ? 'The extract' : 'The sources'}</summary>
        <div className="mt-3"><SourceCards sources={ctx.sources} /></div>
      </details>

      {report && model && (
        <details className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <summary className="text-sm font-semibold text-navy cursor-pointer">See a top-level answer</summary>
          <p className="text-[15px] text-gray-800 leading-relaxed mt-3 whitespace-pre-line">{model}</p>
        </details>
      )}

      {report && (
        <Link href={`/app/humanities/q/${ctx.question.id}`} className="block text-center bg-amber-600 text-white rounded-3xl px-4 py-3.5 font-semibold hover:brightness-105 active:scale-[0.98] transition">
          Write it again
        </Link>
      )}

      {admin && (
        <p className="text-[12px] text-gray-500">
          Adrian only: {run.status}{run.held_reason ? ` · ${run.held_reason}` : ''}{run.error ? ` · ${run.error}` : ''}
          {Array.isArray(run.reads) ? ` · reads ${(run.reads as { level?: number }[]).map(r => r.level ?? '–').join(', ')}` : ''}
          {run.truth_level ? ` · written at L${run.truth_level}` : ''}
          {run.cost_usd != null ? ` · US$${Number(run.cost_usd).toFixed(3)}` : ''}
        </p>
      )}
    </div>
  );
}
