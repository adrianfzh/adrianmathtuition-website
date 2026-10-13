// /app/languages/practice/editing/map — the grammar map (SPEC-ENGLISH-PRACTICE.md, 13 Oct 2026,
// Adrian: "keep linking students to go deeper and deeper … a graph?"). The 16 kinds of editing
// mistake as boxes on six paths, easier at the top of each path, harder at the foot; each box
// coloured by this student's own record from their handed-in passages. Tap a box → its lesson + Try 3.
import { redirect } from 'next/navigation';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { englishPracticeOpen } from '@/lib/portal-beta';
import { grammarRecordFor } from '@/lib/english-practice-store';
import { isEditKind } from '@/lib/english-grammar';
import GrammarMap from './grammar-map';

export const dynamic = 'force-dynamic';

export default async function GrammarMapPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  if (!(await englishPracticeOpen())) redirect('/app/languages');
  const sp = await searchParams;
  const account = await sessionAccount().catch(() => null);
  const identity = account ? portalIdentity(account) : 'admin';
  const record = await grammarRecordFor(identity).catch(() => null);
  return <GrammarMap record={record} open={isEditKind(sp.kind) ? sp.kind : null} />;
}
