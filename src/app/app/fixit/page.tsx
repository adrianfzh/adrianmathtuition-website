// /app/fixit — the student's fix-it plan (SPEC-REMEDIATION.md).
//
// One weakness at a time: read the material, clear the step, the next unlocks.
// A plan only ever appears here after Adrian activated it — drafts are
// invisible by construction. Server component; the identity filter inside
// remediation-data IS the access control (no per-student RLS on the tables),
// so it comes from the session, never from anything the client sends.
// Deliberately NOT gated by requireFullPortal(): like /app/submit and
// /app/marking, the fix-it lane is part of the marking-only beta surface.
import Link from 'next/link';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { loadActivePlan, reconcilePlan, type ItemRow } from '@/lib/remediation-data';
import { AttestButton, AnotherSimilarButton } from './fixit-actions';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<ItemRow['kind'], string> = {
  probe: 'Warm-up check',
  learn: 'Read + learn',
  drill: 'Practice',
  prove: 'Prove it',
};

export default async function FixitPage() {
  const account = await currentAccount();
  const identity = portalIdentity(account);
  const loaded = await loadActivePlan(identity);
  const view = loaded ? await reconcilePlan(loaded.plan, loaded.items) : null;

  const items = view?.items ?? [];
  const cleared = items.filter((it) => it.state === 'cleared' || it.state === 'skipped').length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/app" className="text-sm text-slate-400 hover:text-navy">←</Link>
        <h1 className="text-xl font-bold text-navy">🎯 Fix-it plan</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Built from your marked papers — one skill at a time. Clear a step to unlock the next.
      </p>

      {!view && (
        <div className="bg-white rounded-3xl shadow-sm p-6 text-center text-slate-500 text-sm">
          No plan right now. When Mr Fong sets one from your marked work, it appears here.
        </div>
      )}

      {view && (
        <>
          <div className="bg-white rounded-3xl shadow-sm p-4 mb-4 flex items-center gap-3">
            <div className="text-2xl">{view.plan.status === 'done' ? '🏆' : '🎯'}</div>
            <div className="flex-1">
              <div className="text-sm font-bold text-navy">
                {view.plan.status === 'done' ? 'Plan complete — great work!' : `${cleared} of ${items.length} steps cleared`}
              </div>
              <div className="h-2 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${items.length ? Math.round((cleared / items.length) * 100) : 0}%` }} />
              </div>
            </div>
          </div>

          <ol className="space-y-3">
            {items.map((it) => {
              const isOpen = it.state === 'open' || it.state === 'awaiting_marking';
              const isDone = it.state === 'cleared' || it.state === 'skipped';
              return (
                <li
                  key={it.id}
                  className={`rounded-3xl p-4 ${isOpen
                    ? 'bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_16px_-4px_rgba(15,23,42,0.08)] ring-2 ring-emerald-400'
                    : isDone ? 'bg-emerald-50/60' : 'bg-white/60'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                      isDone ? 'bg-emerald-500 text-white' : isOpen ? 'bg-navy text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {isDone ? '✓' : it.seq}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[11px] font-semibold uppercase tracking-wide ${isOpen ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {isDone ? (it.state === 'skipped' ? 'Skipped' : 'Cleared') : it.state === 'locked' ? '🔒 Locked' : KIND_LABEL[it.kind]}
                      </div>
                      <div className={`text-sm font-semibold ${isDone ? 'text-slate-400 line-through' : 'text-navy'}`}>{it.skill}</div>
                      {it.topic && !isDone && <div className="text-xs text-slate-400 mt-0.5">{it.topic}</div>}

                      {isOpen && (
                        <div className="mt-2">
                          {it.material?.note && <p className="text-sm text-slate-600 italic mb-1">{it.material.note}</p>}
                          {it.material?.docx_url && (
                            <a href={it.material.docx_url} className="inline-flex items-center gap-2 text-sm font-semibold text-navy underline underline-offset-2" target="_blank" rel="noreferrer">
                              📖 Open the study notes
                            </a>
                          )}
                          {it.clear_rule.kind === 'self_attest' && <AttestButton itemId={it.id} />}
                          {view.openAssignment && it.clear_rule.kind !== 'self_attest' && (
                            view.openAssignment.status === 'marked' ? (
                              <div className="mt-2">
                                <div className="text-sm text-slate-600">
                                  Last attempt: <span className="font-bold">{view.openAssignment.score}/{view.openAssignment.out_of}</span>
                                  {' '}— not cleared yet. Have another go:
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                  <AnotherSimilarButton itemId={it.id} />
                                  <Link href={`/app/practice?assignment=${view.openAssignment.id}`} className="mt-2 inline-flex text-sm text-slate-500 underline underline-offset-2">
                                    review that attempt
                                  </Link>
                                </div>
                              </div>
                            ) : (
                              <Link
                                href={`/app/practice?assignment=${view.openAssignment.id}`}
                                className="mt-3 inline-flex items-center gap-2 bg-navy text-white text-sm font-semibold rounded-full px-4 py-2 hover:opacity-90 transition-opacity"
                              >
                                ✏️ Do the question →
                              </Link>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
