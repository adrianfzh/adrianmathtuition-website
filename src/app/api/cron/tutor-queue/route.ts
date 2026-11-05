// GET /api/cron/tutor-queue — every 30 min: 🧑‍🏫 tutors' papers join the 🌙 marking queue only
// while no paper of Adrian's own students is waiting there (lib/tutor-store
// releaseWaitingTutorPapers, the rule in lib/tutor-portal tutorPapersToRelease).
// The tutor's hand-in and their papers list call the same check, so this is the
// backstop, not the only door.
import { NextResponse } from 'next/server';
import { cronAuth } from '@/lib/cron-auth';
import { logJobRun } from '@/lib/job-log';
import { releaseWaitingTutorPapers } from '@/lib/tutor-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const r = await releaseWaitingTutorPapers();
    const summary = `sent ${r.released.length}, waiting ${r.waiting}, student papers in queue ${r.studentWaiting}, tutor papers in queue ${r.tutorInQueue}${r.failed.length ? `, enqueue failed ${r.failed.length}` : ''}`;
    await logJobRun('tutor-queue', r.failed.length === 0, summary, { ...r });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await logJobRun('tutor-queue', false, (e as Error).message).catch(() => {});
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
