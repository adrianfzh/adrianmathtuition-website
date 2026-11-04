// /app/focus — 🎯 the 10-minute set from this week's parent report
// (SPEC-PARENT-REPORT.md). The parent forwards this address; the student opens it
// signed in and sees three short questions on one topic. Each opens the normal
// practice page (?qid=…&from=focus), so it is marked like any practice and the
// next report counts it. No name or id in the address.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { createServiceClient } from '@/lib/supabase-server';
import type { ReportFacts } from '@/lib/parent-report';

export const dynamic = 'force-dynamic';

export default async function FocusPage() {
  const account = await sessionAccount();
  if (!account) redirect('/login?next=/app/focus');
  const identity = portalIdentity(account);
  const sb = createServiceClient();
  const { data: links } = await sb.from('parent_links').select('id').eq('student_identity', identity).eq('status', 'active');
  const ids = ((links ?? []) as { id: string }[]).map(l => l.id);
  const { data: rep } = ids.length
    ? await sb.from('parent_reports').select('facts, created_at').in('link_id', ids).not('facts->focus', 'is', null).order('week_start', { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const focus = (rep?.facts as ReportFacts | undefined)?.focus ?? null;

  let tried = new Set<string>();
  if (focus?.questionIds.length) {
    const { data: att } = await sb.from('student_attempts').select('question_id')
      .or(`user_id.eq.${account.id},airtable_student_id.eq."${identity}"`)
      .in('question_id', focus.questionIds).gte('attempted_at', rep!.created_at as string);
    tried = new Set(((att ?? []) as { question_id: string }[]).map(a => a.question_id));
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app" className="text-sm text-gray-500 hover:text-navy">‹ Home</Link>
        <h1 className="text-xl font-bold text-navy mt-1">🎯 Your 10-minute set</h1>
        {focus
          ? <p className="text-sm text-gray-500 mt-0.5">{focus.topic} · {focus.questionIds.length} short questions. Try each one before you look at any help.</p>
          : <p className="text-sm text-gray-500 mt-0.5">Nothing set this week. Ten minutes of any practice counts.</p>}
      </div>
      {focus ? (
        <ol className="space-y-2">
          {focus.questionIds.map((q, i) => (
            <li key={q}>
              <Link href={`/app/practice?qid=${q}&from=focus`} className="flex items-center justify-between rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                <span className="font-semibold text-navy">Question {i + 1}</span>
                <span className={`text-sm ${tried.has(q) ? 'text-green-700' : 'text-gray-400'}`}>{tried.has(q) ? '✓ Done' : 'Start ›'}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <Link href="/app/practice" className="inline-block rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-[hsl(45,100%,96%)]">Go to practice</Link>
      )}
    </div>
  );
}
