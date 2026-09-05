// GET /api/portal/assignments — the signed-in student's Practice to-do list
// (SPEC-PORTAL-V2 §3): every row they may see, newest first, with `source`
// (adrian | practice-again | find), `skill_title` and `status` so a client can
// group it, plus `sections` already grouped (lib/practice-todo). Held rows
// (created by the sheet hand-back, not yet released) and revoked rows are
// excluded IN THE QUERY; a row carrying a subject is shown only when the
// account has that subject (lib/portal-subjects). Student session only: this is
// the student's own view; Adrian reads the admin route. Also probed by
// /api/health-check (expects 401).
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { listStudentAssignments } from '@/lib/portal-assignments';
import { homeCardSummary, pendingCount } from '@/lib/assignments';
import { groupPracticeTodo, visibleToStudent } from '@/lib/practice-todo';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // `subjects` + `level` feed the subject gate (SPEC-PORTAL-V2 §2).
  const { data: account } = await supabase
    .from('portal_accounts').select('id, airtable_student_id, level, subjects').eq('id', user.id)
    .single<Pick<PortalAccount, 'id' | 'airtable_student_id' | 'level' | 'subjects'>>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Identity, not the raw airtable id: strangers get an (empty) list instead
    // of every-row-matches-'' surprises if rows are ever keyed acct:<uuid>.
    // Both gates, in this order: the subject gate inside the list (SPEC-PORTAL-V2 §2),
    // then the student-visibility rule (held / revoked never shown, §3).
    const all = await listStudentAssignments(portalIdentity(account), account);
    const assignments = all.filter(r => visibleToStudent(r, account));
    const sections = groupPracticeTodo(assignments).map(s => ({ key: s.key, title: s.title, counts: s.counts, ids: s.items.map(i => i.id) }));
    return NextResponse.json({ assignments, pending: pendingCount(assignments), summary: homeCardSummary(assignments), sections });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
