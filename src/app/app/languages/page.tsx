// /app/languages — the Languages family's Home (SPEC-ESSAY-MARKING.md, 12 Sep
// 2026). Hand in first, then what is being read, then the latest essays. The
// door is essayMarkingOpen(): the preview identity and Adrian while E1 is closed.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import { essayMarkingOpen } from '@/lib/portal-beta';
import PortalIcon from '@/components/PortalIcon';
import { SURFACES } from '@/lib/portal-theme';
import { loadEssaysFor } from '@/lib/essay-runs';
import { trendFor } from '@/lib/essay-report';
import { codeLabel } from '@/lib/essay-codes';
import { EssayCard, EssayDisclaimer } from './essay-cards';

export const dynamic = 'force-dynamic';

const L = SURFACES.languages;
const S = SURFACES.submit;
const HOME_LIMIT = 3;

export default async function LanguagesPage() {
  if (!(await essayMarkingOpen())) redirect('/app');
  const account = await currentAccount();
  const sid = portalIdentity(account);
  const essays = await loadEssaysFor(sid);
  const inFlight = essays.filter(e => e.status === 'queued' || e.status === 'marking' || e.status === 'held');
  const done = essays.filter(e => e.status === 'marked');
  const trend = trendFor(essays.map(e => ({ marked_at: e.marked_at, created_at: e.created_at, code_counts: e.code_counts })));

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${L.tile}`}>
          <PortalIcon name={L.icon} className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-navy leading-tight">Languages</h1>
          <p className="text-[12px] text-gray-500">English essays — marked for feedback first</p>
        </div>
      </div>

      <Link
        href="/app/languages/submit"
        className="flex items-center gap-3 bg-violet-600 text-white rounded-3xl px-4 py-3.5 font-semibold shadow-[0_8px_24px_-10px_rgba(124,58,237,0.8)] hover:brightness-105 active:scale-[0.98] transition"
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-2xl bg-white/25 shrink-0" aria-hidden>
          <PortalIcon name={S.icon} className="w-5 h-5" />
        </span>
        <span className="flex-1">Hand in an essay</span>
        <span className="shrink-0 text-white/80 text-lg">›</span>
      </Link>

      {inFlight.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Being read</h2>
          {inFlight.map(e => <EssayCard key={e.id} row={e} />)}
        </div>
      )}

      {trend.length > 0 && (
        <div className="bg-white rounded-3xl p-4 border border-black/5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Your habits, essay by essay</h2>
          <ul className="space-y-1">
            {trend.map(t => (
              <li key={t.code} className="flex items-baseline justify-between text-sm">
                <span className="text-navy font-semibold">{codeLabel('english', t.code)}</span>
                <span className="font-mono text-[13px] text-gray-600">{t.counts.join(' → ')}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400 mt-1.5">Oldest to newest. Lower is better.</p>
        </div>
      )}

      {done.length === 0 && inFlight.length === 0 ? (
        <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm space-y-2">
          <p className="text-sm text-gray-700">
            Finished an essay? <b>Paste it in with the question</b> — it comes back with every slip marked on your own
            words, the three habits to fix first, and a band range against the O-Level descriptors.
          </p>
          <EssayDisclaimer />
        </div>
      ) : (
        <>
          {done.length > 0 && (
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Marked essays</h2>
              {done.length > HOME_LIMIT && (
                <Link href="/app/languages/essays" className="text-[12px] font-semibold text-navy hover:underline">All {done.length} ›</Link>
              )}
            </div>
          )}
          {done.slice(0, HOME_LIMIT).map(e => <EssayCard key={e.id} row={e} />)}
          {done.length > 0 && <EssayDisclaimer />}
        </>
      )}
    </div>
  );
}
