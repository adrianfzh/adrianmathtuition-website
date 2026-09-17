// /app/marking — the student's own marked scripts: the Papers header, the
// hand-in button, and the ONE papers view (./papers-view, shared with Adrian's
// profile tab since 17 Sep 2026). Access: the logged-in student's portal
// identity — the view's ownership filter IS the access control.
import Link from 'next/link';
import { currentAccount, portalIdentity } from '@/lib/portal-auth';
import PapersView from './papers-view';
import { SURFACES } from '@/lib/portal-theme';
import PortalIcon from '@/components/PortalIcon';

export const dynamic = 'force-dynamic';

const M = SURFACES.marking;
const S = SURFACES.submit;

export default async function MarkingPage() {
  const account = await currentAccount();
  const sid = portalIdentity(account);
  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {/* One "Papers" surface (Adrian, 2026-08-28: Hand in + Marked merged) —
          submitting is the tab's FIRST action, so the merge hides nothing. */}
      <div className="flex items-center gap-2.5 pt-1">
        <span className={`flex items-center justify-center w-9 h-9 rounded-2xl shrink-0 ${M.tile}`}>
          <PortalIcon name={M.icon} className="w-5 h-5" />
        </span>
        <h1 className="text-xl font-bold text-navy">Papers</h1>
      </div>
      <Link
        href="/app/submit"
        className="flex items-center gap-3 bg-teal-500 text-white rounded-3xl px-4 py-3.5 font-semibold shadow-[0_8px_24px_-10px_rgba(20,184,166,0.8)] hover:brightness-105 active:scale-[0.98] transition"
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-2xl bg-white/25 shrink-0" aria-hidden>
          <PortalIcon name={S.icon} className="w-5 h-5" />
        </span>
        <span className="flex-1">Hand in a paper</span>
        <span className="shrink-0 text-white/80 text-lg">›</span>
      </Link>
      <PapersView account={account} sid={sid} />
    </div>
  );
}
