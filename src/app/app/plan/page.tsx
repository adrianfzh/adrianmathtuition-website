// /app/plan — "My Plan": the student's adaptive revision plan
// (SPEC-REVISION-PLAN.md). Three bands — Focus topics, Keep warm, This week's
// wins — recomputed from live mastery on every visit (no stored plan). Server
// component assembling data directly via the same libs as /api/portal/plan
// (the dashboard pattern).
//
// In the MARKING_ONLY_BETA allowlist: marking-derived and released-only, so
// students see it during the beta — no requireFullPortal() here, on purpose.
// The "Print a weak-spot paper" button is the one full-portal-only door on the
// page, so it hides from beta students (the practice page's printEntry rule).
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase-server';
import { sessionAccount } from '@/lib/portal-auth';
import { loadPapersAndNotebook } from '@/lib/notebook-data';
import { buildPlan } from '@/lib/plan';
import { sgtToday } from '@/lib/notebook';
import { homeCounts } from '@/lib/portal-home-counts';
import { fullPortalVisible } from '@/lib/portal-beta';
import { SURFACES } from '@/lib/portal-theme';
import PortalIcon from '@/components/PortalIcon';

export const dynamic = 'force-dynamic';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';
const BAND = 'text-xs font-semibold uppercase tracking-wide text-gray-400';

const STATE_PILL: Record<string, string> = {
  weak: 'bg-rose-50 text-rose-800',
  shaky: 'bg-amber-50 text-amber-800',
  solid: 'bg-emerald-50 text-emerald-800',
};

export default async function PlanPage() {
  // The print-page pattern: Adrian's admin cookie may browse /app/* without a
  // student session, but a plan belongs to a student — show the pointer card.
  // sessionAccount() is per-request cached (lib/portal-auth.ts), so this
  // shares the layout's auth lookup instead of repeating it.
  const account = await sessionAccount();
  const sid: string | null = account?.airtable_student_id ?? null;

  if (!sid) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">My Plan</h1>
        <div className={`${CARD} p-5`}>
          <p className="text-sm text-gray-600">
            The plan is built from a student&apos;s own marked papers.{' '}
            <Link href="/login" className="font-semibold text-navy underline">Log in as a student</Link> to see one.
          </p>
        </div>
      </div>
    );
  }

  // The plan assembly, the Home-tile counts and the beta gate are independent
  // — one parallel batch instead of two sequential awaits.
  const svc = createServiceClient();
  const [res, { beingMarked }, printVisible] = await Promise.all([
    loadPapersAndNotebook(svc, sid, sgtToday()),
    homeCounts(sid),
    fullPortalVisible(),
  ]);
  if (!res.ok) {
    return (
      <div className="space-y-4 pb-24 sm:pb-4">
        <h1 className="text-xl font-bold text-navy pt-1">My Plan</h1>
        <div className={`${CARD} p-5 text-sm text-gray-600`}>
          Couldn&apos;t load your plan — refresh to try again.
        </div>
      </div>
    );
  }

  const plan = buildPlan(
    res.papers,
    res.entries.map(e => ({
      topic: e.topic,
      attempts: e.attempts,
      questionNumber: e.question_number,
      paperName: e.paper_name,
    })),
  );
  const S = SURFACES.submit;

  return (
    <div className="space-y-5 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy">My Plan</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Rebuilt from your marked papers and notebook wins every time you open it.
        </p>
      </div>

      {plan.empty ? (
        /* Empty state = the hand-in funnel: without EVIDENCE_MIN marks of
           evidence there is nothing honest for a plan to say. */
        <div className={`${CARD} p-5`}>
          <p className="font-bold text-navy">Hand in one paper and your plan builds itself</p>
          <p className="text-sm text-gray-600 mt-1.5">
            Every marked paper feeds a live picture of where you stand, topic by topic —
            the plan turns that into what to work on this week.
          </p>
          <Link
            href="/app/submit"
            className={`mt-4 inline-flex items-center gap-2 ${S.tile} rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm hover:brightness-105 active:scale-[0.99] transition`}
          >
            <PortalIcon name={S.icon} className="w-4.5 h-4.5" /> Hand in a paper
          </Link>
          {beingMarked > 0 && (
            <p className="text-[13px] text-gray-500 mt-3">
              📬 {beingMarked === 1 ? 'A paper is' : `${beingMarked} papers are`} with Adrian being
              marked — your plan starts the moment it comes back.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Band 1 — Focus topics */}
          <div>
            <p className={`${BAND} mb-2`}>Focus topics</p>
            {plan.focus.length === 0 ? (
              <div className={`${CARD} p-4`}>
                <p className="text-sm text-gray-600">
                  Nothing urgent — every topic we can score is holding up. 💪 Keep them warm below,
                  or <Link href="/app/practice" className="font-semibold text-navy underline">practise anything</Link>.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {plan.focus.map(t => (
                  <div key={t.topic} className={`${CARD} p-4`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-navy min-w-0 truncate">{t.topic}</p>
                      <span className={`shrink-0 text-sm rounded-full px-2.5 py-0.5 font-semibold ${STATE_PILL[t.state]}`}>
                        {t.score}%
                        {t.delta === 'up' && <span className="ml-1 text-emerald-600 font-bold">↑</span>}
                        {t.delta === 'down' && <span className="ml-1 text-rose-600 font-bold">↓</span>}
                      </span>
                    </div>
                    <p className="text-[13px] text-gray-600 mt-1">{t.evidence}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={t.practiceHref}
                        className="inline-flex items-center gap-1.5 bg-amber-400 text-navy rounded-xl px-3.5 py-2 text-[13px] font-semibold shadow-sm hover:brightness-105 active:scale-[0.99] transition"
                      >
                        <PortalIcon name="pencil" className="w-4 h-4" /> Practise now
                      </Link>
                      {printVisible && (
                        <Link
                          href="/app/print?preset=weakspots"
                          className="inline-flex items-center gap-1.5 bg-white border border-navy/20 text-navy rounded-xl px-3.5 py-2 text-[13px] font-semibold hover:bg-navy/5 transition"
                        >
                          🖨️ Print a weak-spot paper
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Band 2 — Keep warm */}
          {plan.keepWarm.length > 0 && (
            <div>
              <p className={`${BAND} mb-2`}>Keep warm</p>
              <div className="space-y-2">
                {plan.keepWarm.map(t => (
                  <div key={t.topic} className={`${CARD} p-4 flex items-center justify-between gap-3`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">
                        {t.topic}{' '}
                        <span className={`${t.state === 'solid' ? 'text-emerald-700' : 'text-amber-700'} font-bold`}>{t.score}%</span>
                      </p>
                      <p className="text-[12px] text-gray-500 mt-0.5">Fading from view — {t.lastTouched}.</p>
                    </div>
                    <Link
                      href={t.practiceHref}
                      className="shrink-0 inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 rounded-xl px-3 py-1.5 text-[13px] font-semibold hover:bg-amber-100 transition"
                    >
                      <PortalIcon name="pencil" className="w-3.5 h-3.5" /> Practise
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Band 3 — This week's wins (hidden at zero, like the hub cards) */}
          {(plan.wins.length > 0 || beingMarked > 0) && (
            <div>
              <p className={`${BAND} mb-2`}>This week&apos;s wins</p>
              <div className={`${CARD} p-4`}>
                {plan.wins.length > 0 && (
                  <ul className="divide-y divide-gray-100">
                    {plan.wins.map((w, i) => (
                      <li key={i} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-sm">
                        <span className="text-gray-700 min-w-0 truncate">
                          {w.kind === 'paper' ? '📄' : '🏆'} {w.label}
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">{w.dateLabel}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {beingMarked > 0 && (
                  <p className={`text-[13px] text-gray-500 ${plan.wins.length > 0 ? 'mt-3 pt-3 border-t border-gray-100' : ''}`}>
                    📬 {beingMarked === 1 ? 'A paper is' : `${beingMarked} papers are`} with Adrian
                    being marked — it&apos;ll land here when released.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
