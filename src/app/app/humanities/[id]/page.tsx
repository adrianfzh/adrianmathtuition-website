// /app/humanities/<run id> — the feedback on one answer (SPEC-HUMANITIES.md §2).
// Order: the level range and the ONE lift → the student's answer with each claim
// tagged → what a top answer does → the level ladder → sources and a model
// answer, folded. Never a mark. A student sees only their own row.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOpen, viewingAsStudent, GEOGRAPHY_MARKS_OPEN_TO_STUDENTS } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { loadHumanitiesRun } from '@/lib/humanities-runs';
import { questionById, modelAnswer, ALL_TAGS, tagsFor, isPointsQuestion } from '@/lib/humanities-questions';
import { levelLabel, marksLabel, pointClaims, segmentAnswer, humanitiesStatusLine } from '@/lib/humanities-report';
import { SourceCards, DataTableCard } from '../sources';
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
  // Point-marked (Geography): a point made, and a point made and developed.
  developed: { mark: 'bg-emerald-100 decoration-emerald-500', chip: 'bg-emerald-100 text-emerald-800' },
};
const POINT_TAGS = [{ key: 'point', label: 'A point' }, { key: 'developed', label: 'A developed point' }];
const tagLabel = (k: string, points = false) => (points ? POINT_TAGS.find(t => t.key === k)?.label : undefined) ?? ALL_TAGS.find(t => t.key === k)?.label ?? k;

export default async function HumanitiesRunPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await humanitiesOpen())) redirect('/app');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const admin = (await isNotesAuthed()) && !(await viewingAsStudent());
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const run = await loadHumanitiesRun(id, admin ? { admin: true } : sid);
  if (!run) notFound();
  const ctx = questionById(run.question_id);
  if (!ctx) notFound();

  const inFlight = run.status === 'queued' || run.status === 'marking';
  const report = run.report;
  const max = run.levels_max ?? ctx.scheme.levels.length;
  // A point-marked answer (Geography): credits per point; the level fields hold marks.
  const points = isPointsQuestion(ctx.question);
  const claims = points ? pointClaims(report?.points) : report?.claims ?? [];
  const showMark = admin || GEOGRAPHY_MARKS_OPEN_TO_STUDENTS;
  const credited = new Map((report?.points ?? []).filter(p => p.id !== 'other').map(p => [p.id, p]));
  const made = (ctx.question.points ?? []).filter(p => (credited.get(p.id)?.credit ?? 0) > 0);
  const extra = (report?.points ?? []).filter(p => p.id === 'other' && p.credit > 0);
  const toAdd = (ctx.question.points ?? []).filter(p => (credited.get(p.id)?.credit ?? 0) === 0).slice(0, 3);
  const segs = report ? segmentAnswer(run.answer_text, claims) : [{ text: run.answer_text, claim: null }];
  const usedTags = (points ? POINT_TAGS : tagsFor(run.skill)).filter(t => claims.some(c => c.tag === t.key));
  const model = modelAnswer(ctx.question);
  const lo = report ? Math.min(report.level_lo, report.level_hi) : 0;
  const hi = report ? Math.max(report.level_lo, report.level_hi) : 0;
  // A case study is a run of five: offer the next one.
  const next = ctx.set.background ? ctx.set.questions[ctx.set.questions.findIndex(q => q.id === ctx.question.id) + 1] : undefined;

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
            <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">{points && !showMark ? 'Your feedback' : 'Where this answer sits'}</p>
            {points
              ? showMark && <p className="text-2xl font-bold text-navy">{marksLabel(report.level_lo, report.level_hi, max)}</p>
              : <p className="text-2xl font-bold text-navy">{levelLabel(report.level_lo, report.level_hi, max)}</p>}
            {run.status === 'held' && <p className="text-[13px] text-gray-600 mt-1">{points ? 'The reads did not fully agree on this one. Use the points below.' : humanitiesStatusLine('held')}</p>}
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
        {report && claims.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-black/5 pt-3">
            {segs.filter(s => s.claim).map((s, i) => (
              <li key={i} className="text-[13px] leading-snug">
                <span className={`inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 mr-1.5 ${TAG_STYLE[s.claim!.tag]?.chip ?? 'bg-gray-100 text-gray-700'}`}>{tagLabel(s.claim!.tag, points)}</span>
                <span className="text-gray-500">“{s.text.length > 70 ? s.text.slice(0, 67) + '…' : s.text}”</span>
                {s.claim!.note && <span className="block text-gray-800 mt-0.5">{s.claim!.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {report && points && (
        <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm space-y-3">
          {(made.length > 0 || extra.length > 0) && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Points you made</p>
              <ul className="space-y-2">
                {made.map(p => {
                  const c = credited.get(p.id)!;
                  return (
                    <li key={p.id} className="text-[15px] leading-snug">
                      <span className="text-emerald-700 font-bold">✓ </span><span className="text-gray-800">{p.text}</span>
                      {c.credit >= 2 && <span className="ml-1.5 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800">developed</span>}
                      {c.credit === 1 && ctx.question.develop && p.develop && <span className="block text-[13px] text-amber-800 mt-0.5">Develop it: {p.develop}.</span>}
                    </li>
                  );
                })}
                {extra.map((p, i) => (
                  <li key={`o${i}`} className="text-[15px] leading-snug">
                    <span className="text-emerald-700 font-bold">✓ </span><span className="text-gray-800">{p.text || 'Another valid point'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {toAdd.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Points you could add</p>
              <ul className="space-y-1.5">
                {toAdd.map(p => <li key={p.id} className="text-[15px] text-gray-800 leading-snug"><span className="text-gray-400">○ </span>{p.text}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {report && report.gap?.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">What a top answer does</p>
          <ul className="space-y-1.5">
            {report.gap.map((g, i) => <li key={i} className="text-[15px] text-gray-800 leading-snug">{g}</li>)}
          </ul>
        </div>
      )}

      {report && !points && (
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

      {points ? ctx.question.table && <DataTableCard table={ctx.question.table} /> : (
        <details className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <summary className="text-sm font-semibold text-navy cursor-pointer">{ctx.set.kind === 'structured' ? 'The extract' : 'The sources'}</summary>
          <div className="mt-3"><SourceCards sources={ctx.inView} /></div>
        </details>
      )}

      {report && model && (
        <details className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <summary className="text-sm font-semibold text-navy cursor-pointer">{points ? 'See a full answer' : 'See a top-level answer'}</summary>
          <p className="text-[15px] text-gray-800 leading-relaxed mt-3 whitespace-pre-line">{model}</p>
        </details>
      )}

      {next && (
        <Link href={`/app/humanities/q/${next.id}`} className="flex items-center gap-3 bg-white rounded-3xl px-4 py-3.5 border border-amber-200 shadow-sm hover:border-amber-300 active:scale-[0.99] transition">
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] font-semibold text-amber-800">Next in this case study</span>
            <span className="block text-sm text-navy">{next.question}</span>
          </span>
          <span className="shrink-0 text-gray-400">›</span>
        </Link>
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
