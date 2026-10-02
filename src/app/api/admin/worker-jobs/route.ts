// /api/admin/worker-jobs — 🎚 the Fly worker's job switches (lib/worker-jobs.ts,
// 2 Oct 2026: "put toggles for pdf extraction, twins … and whatever other worker jobs").
//   GET                     → { jobs: [{key, label, what, when, group, on, at, by}], off: [keys] }
//   POST { job, on: bool }  → the same, after the flip; one line to the ops topic
// Bearer ADMIN_PASSWORD, the admin session cookie, or the `switches` agent token. The
// worker's scheduler (bot worker/fly/jobs.sh) calls GET every two minutes with its admin
// token and starts no new run of a job in `off`. Anonymous → 401 (the health check probes it).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { verifyAgentAuth } from '@/lib/agent-auth';
import { WORKER_JOBS, isWorkerJob, offJobs, workerJobRows } from '@/lib/worker-jobs';
import { getWorkerJobs, setWorkerJob } from '@/lib/worker-jobs-store';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const authed = (req: NextRequest) => verifyAdminAuth(req) || verifyAgentAuth(req, 'switches', { route: 'worker-jobs' });

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    // The page asks fresh; the worker's two-minute read may take the 30 s cache.
    const map = await getWorkerJobs(req.nextUrl.searchParams.get('fresh') === '1');
    return NextResponse.json({ jobs: workerJobRows(map), off: offJobs(map) });
  } catch (e) {
    // No `off` key on a failed read: the worker keeps the last list it read rather than
    // switching everything back on because Airtable blinked.
    return NextResponse.json({ jobs: workerJobRows({}), error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { job?: unknown; on?: unknown };
  if (!isWorkerJob(body.job) || typeof body.on !== 'boolean') return NextResponse.json({ error: 'job (a known worker job) and on (boolean) are required' }, { status: 400 });
  const job = WORKER_JOBS.find(j => j.key === body.job)!;
  try {
    const map = await setWorkerJob(job.key, body.on, 'adrian');
    sendTelegram(body.on
      ? `🎚 ${job.label} is ON — the worker starts it again within two minutes.`
      : `🎚 ${job.label} is OFF — no new run starts; one already running finishes.`, 'ops').catch(() => {});
    return NextResponse.json({ jobs: workerJobRows(map), off: offJobs(map) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
