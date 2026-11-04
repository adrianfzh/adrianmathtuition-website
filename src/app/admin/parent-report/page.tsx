// /admin/parent-report — 👪 preview any student's weekly parent report exactly as
// a parent would see it this week (SPEC-PARENT-REPORT.md). Built live, nothing
// is stored or sent. Admin cookie only. Also lists the linked parents.
import Link from 'next/link';
import ParentReport from '@/components/ParentReport';
import { isNotesAuthed } from '@/lib/notes-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';
import { ACCOUNT_COLUMNS } from '@/lib/stretch-set-store';
import { FOCUS_URL, accountForIdentity, buildFacts, firstName, reportWords, whatsappShare } from '@/lib/parent-report-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function ParentReportAdmin({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  if (!(await isNotesAuthed())) {
    return <main className="p-6"><p>Sign in on <Link className="underline" href="/admin">/admin</Link> first.</p></main>;
  }
  const { who } = await searchParams;
  const sb = createServiceClient();
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const [{ data: recent }, { data: links }] = await Promise.all([
    sb.from('portal_accounts').select(ACCOUNT_COLUMNS).is('deactivated_at', null).gte('last_seen_at', since).order('display_name').limit(80),
    sb.from('parent_links').select('student_identity, status').neq('status', 'ended'),
  ]);
  const linked = new Map<string, string>();
  for (const l of (links ?? []) as { student_identity: string; status: string }[]) linked.set(l.student_identity, l.status);

  let preview: React.ReactNode = null;
  if (who) {
    const account = await accountForIdentity(sb, who);
    if (!account) preview = <p className="text-red-600">No such student.</p>;
    else {
      try {
        const facts = await buildFacts(sb, account);
        const words = reportWords(facts, firstName(account), FOCUS_URL);
        preview = (
          <div className="mx-auto max-w-[390px] rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-300">
            <ParentReport words={words} shareUrl={whatsappShare(words.forwardText)} stop={null} />
            <p className="mt-3 text-xs text-slate-400">10-minute set: {facts.focus ? `${facts.focus.topic} · ${facts.focus.questionIds.length} question(s)` : 'none found'}</p>
          </div>
        );
      } catch (e) { preview = <p className="text-red-600">Could not build: {(e as Error).message}</p>; }
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="text-xl font-bold text-[#1e3a5f]">👪 Weekly parent report — preview</h1>
      <p className="mt-1 text-sm text-slate-500">This week’s report for one student, as the parent sees it. Nothing is saved or sent from here.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
        <ul className="max-h-[70vh] overflow-auto text-sm">
          {((recent ?? []) as unknown as PortalAccount[]).map((a) => {
            const id = portalIdentity(a);
            return (
              <li key={a.id}>
                <Link href={`/admin/parent-report?who=${encodeURIComponent(id)}`} className={`block rounded px-2 py-1 hover:bg-slate-100 ${who === id ? 'bg-slate-200 font-semibold' : ''}`}>
                  {a.display_name || a.email} <span className="text-slate-400">{a.level}</span>{linked.has(id) ? <span className="ml-1">👪{linked.get(id) === 'pending' ? '…' : ''}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <div>{preview ?? <p className="text-sm text-slate-500">Pick a student.</p>}</div>
      </div>
    </main>
  );
}
