// /app/stretch — 🧩 This week's stretch set (SPEC-STRETCH-SET.md, Adrian 4 Nov 2026).
// Built on the student's first visit of the week (or earlier, by Adrian's preview
// on /admin/stretch) and then kept, so the student gets exactly what he saw.
// Behind STRETCH_SET_OPEN_TO_STUDENTS (lib/portal-beta stretchSetVisible).
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { stretchSetVisible } from '@/lib/portal-beta';
import { createServiceClient } from '@/lib/supabase-server';
import { loadOrBuildSet, toScreen, viewSet } from '@/lib/stretch-set-store';
import { setProgress } from '@/lib/stretch-set';
import StretchSet from '@/components/StretchSet';

export const dynamic = 'force-dynamic';

export default async function StretchPage() {
  const account = await sessionAccount();
  if (!account) redirect('/login');
  if (!(await stretchSetVisible(portalIdentity(account)))) notFound();
  const sb = createServiceClient();
  let out = null;
  let failed = false;
  try { out = await loadOrBuildSet(sb, account, { builtBy: 'student' }); }
  catch (e) { console.error('[stretch] build failed:', (e as Error).message); failed = true; }
  const view = out ? await viewSet(sb, account, out.row) : [];
  const items = toScreen(view, false);
  const p = out ? setProgress(out.row.items, Object.fromEntries(view.map(v => [v.slot, v.result])), out.row.responses ?? {}) : null;

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app" className="text-sm text-gray-500 hover:text-navy">‹ Home</Link>
        <h1 className="text-xl font-bold text-navy mt-1">🧩 This week’s stretch set</h1>
        <p className="text-sm text-gray-500 mt-0.5">A few questions that look different from the usual. They train you for the exam question you have never seen before.</p>
        {p && p.total > 0 && <p className="text-sm font-semibold text-navy mt-2">{p.done} of {p.total} done{p.rightFirst ? ` · ${p.rightFirst} right first time` : ''}</p>}
      </div>
      {failed ? <p className="text-sm text-gray-500">This week’s set could not be loaded — try again in a minute.</p> : <StretchSet items={items} />}
    </div>
  );
}
