// GET /api/portal/assignments — the signed-in student's "From Adrian" list
// (non-revoked, newest first). Student session only: this is the student's own
// view; Adrian reads the admin route. Also probed by /api/health-check (expects 401).
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { listStudentAssignments } from '@/lib/portal-assignments';
import { homeCardSummary, pendingCount } from '@/lib/assignments';
import type { PortalAccount } from '@/lib/portal-auth';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts').select('airtable_student_id').eq('id', user.id).single<Pick<PortalAccount, 'airtable_student_id'>>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const assignments = await listStudentAssignments(account.airtable_student_id);
    return NextResponse.json({ assignments, pending: pendingCount(assignments), summary: homeCardSummary(assignments) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
