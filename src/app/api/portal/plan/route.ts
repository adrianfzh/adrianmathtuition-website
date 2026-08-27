// GET /api/portal/plan — the student's adaptive revision plan
// (SPEC-REVISION-PLAN.md): { focus, keepWarm, wins, empty, beingMarked },
// derived on read from the same papers+notebook assembly the notebook API uses
// (lib/notebook-data.ts) and shaped by lib/plan.ts (pure, tested). No stored
// plan, no cron — recomputing from live mastery on every visit IS the
// adaptive path.
//
// In the MARKING_ONLY_BETA allowlist (unlike /api/portal/notebook): the plan
// is marking-derived and released-only, so students may read it during the
// beta. No fullPortalVisible() gate here, on purpose.
import { NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { portalIdentity } from '@/lib/portal-auth';
import { loadPapersAndNotebook } from '@/lib/notebook-data';
import { buildPlan } from '@/lib/plan';
import { sgtToday } from '@/lib/notebook';
import { homeCounts } from '@/lib/portal-home-counts';

export const dynamic = 'force-dynamic';

// The session's portal identity (rec… / acct:<uuid>) — a paying stranger's
// plan derives from their own hand-ins, same as everyone else's.
async function sessionStudentId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // portal_accounts RLS: a student can read their own row only.
  const { data } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id')
    .eq('id', user.id)
    .single();
  return data ? portalIdentity(data) : null;
}

export async function GET() {
  const sid = await sessionStudentId();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createServiceClient();
  const res = await loadPapersAndNotebook(svc, sid, sgtToday());
  if (!res.ok) {
    return NextResponse.json({ error: 'Could not load your plan' }, { status: 500 });
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
  // Papers still with Adrian — the plan acknowledges work handed in before
  // it is released, so "hand it in" never feels like shouting into a void.
  const { beingMarked } = await homeCounts(sid);

  return NextResponse.json({ ...plan, beingMarked });
}
