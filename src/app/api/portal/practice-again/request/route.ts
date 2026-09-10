// POST /api/portal/practice-again/request → { ok, state:'queued', jobId }
//
//   { runId }                  one paper           (8 Sep 2026)
//   { runIds: [a, b, c] }      ONE sheet for two or three papers (11 Sep 2026)
//   { runId | runIds, wave:2 } the next wave of a sheet they already have
//
// The student's door to a Practice Again sheet (Adrian, 8 Sep 2026: "allow
// them to request for Practice Again worksheets, so only generate when they
// request"). Their own RELEASED papers only; the queue guard in lib/sheet-queue
// is the same one Adrian's desk uses, so the two doors can never disagree
// about which papers may have a sheet, and lib/student-batch adds the rules the
// student's tick has and his does not — two or three papers, one maths, marked
// in the last 5 days, and the STRONG refusal (under 10 marks lost between the
// papers there is nothing worth teaching; they are sent to print a new paper
// instead). The sheet goes out on its own once the Mac has written it and it
// clears the accuracy gate (sheet-jobs `done`).
// Anonymous → 401 (the health-check probes this).
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { queueSheetJob, queueSheetBatch, coveredRunIds } from '@/lib/sheet-queue';
import {
  studentBatchGuard, shelvedGaps, shelfWorthAWave, practiceAgainRequestLine, shortPaperName,
  MAX_BATCH_PAPERS, type StudentBatchRun, type StudentBatchJob,
} from '@/lib/student-batch';
import { displayPaperName } from '@/lib/paper-display-name';
import { escapeTelegramHtml } from '@/lib/telegram-html';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/** The guard's per-paper columns without the heavy `result_json` — only the two keys it reads. */
const RUN_COLUMNS =
  'id, paper_name, student_name, student_id, released_at, created_at, paper_subject, subject, total_awarded, total_max, totals:result_json->totals, marking_source:result_json->source';

type RunRow = {
  id: string; paper_name: string | null; student_name: string | null; student_id: string | null;
  released_at: string | null; created_at: string | null; paper_subject: string | null; subject: string | null;
  total_awarded: number | null; total_max: number | null;
  totals: unknown; marking_source: unknown;
};

/** The shape lib/student-batch reads — result_json rebuilt from the two keys the guard uses. */
function toBatchRun(r: RunRow): StudentBatchRun {
  return {
    id: r.id, paper_name: r.paper_name, student_name: r.student_name, student_id: r.student_id,
    released_at: r.released_at, created_at: r.created_at, paper_subject: r.paper_subject, subject: r.subject,
    total_awarded: r.total_awarded, total_max: r.total_max,
    result_json: { totals: r.totals, source: r.marking_source },
  };
}

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const raw = Array.isArray((body as { runIds?: unknown }).runIds)
    ? ((body as { runIds: unknown[] }).runIds)
    : [(body as { runId?: unknown }).runId];
  const ids = Array.from(new Set(raw.map(x => String(x ?? '').trim()).filter(x => UUID.test(x))));
  if (!ids.length) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  if (ids.length > MAX_BATCH_PAPERS) {
    return NextResponse.json({ error: 'Three papers at most for one sheet.' }, { status: 400 });
  }
  // Wave two: the next sheet from what the last one shelved. A continuation,
  // never a first request — the finished job it continues has to exist.
  const wave = Number((body as { wave?: unknown }).wave) >= 2 ? 2 : 1;

  const sb = getSupabaseAdmin();
  type JobRow = StudentBatchJob & { result: unknown; created_at: string };
  const sheetJobsFor = async (list: string[]): Promise<JobRow[]> => {
    const csv = list.join(',');
    const { data } = await sb.from('sheet_jobs')
      .select('id, status, run_id, run_ids, result, created_at')
      .or(`run_id.in.(${csv}),run_ids.ov.{${csv}}`)
      .order('created_at', { ascending: false });
    return (data ?? []) as JobRow[];
  };

  // Every sheet job that covers any of the papers they named — batch jobs
  // found through `run_ids` as well as `run_id`.
  let jobs = await sheetJobsFor(ids);

  // What the last finished sheet kept back, for a wave-two request. Read from
  // the job itself, never from the client — the student asks for "the next
  // wave", the server decides what that means.
  // …and only a shelf worth a sheet (two gaps, or five marks — the threshold, 11 Sep 2026).
  const finished = wave >= 2 ? jobs.find(j => j.status === 'done' && shelfWorthAWave(j.result).worth) : undefined;
  if (wave >= 2 && !finished) {
    return NextResponse.json({ error: 'There is no sheet with more gaps kept back for these papers.' }, { status: 409 });
  }
  const shelved = shelvedGaps(finished?.result);
  // A wave two continues the sheet that shelved them — the SAME papers, so a
  // batch's next wave covers the whole batch even when the tap came from one
  // of its papers.
  const runIds = finished
    ? coveredRunIds({ run_id: String(finished.run_id ?? ''), run_ids: finished.run_ids })
    : ids;
  if (!runIds.length) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  if (runIds.length > MAX_BATCH_PAPERS) {
    return NextResponse.json({ error: 'Three papers at most for one sheet.' }, { status: 400 });
  }
  if (runIds.some(id => !ids.includes(id))) jobs = await sheetJobsFor(runIds);

  // The ownership filter IS the access control (paper_marking_runs has no
  // per-student RLS): their own identity, released only. A paper that is not
  // theirs simply does not come back, and the guard reads that as 404.
  const { data: rows } = await sb.from('paper_marking_runs')
    .select(RUN_COLUMNS)
    .in('id', runIds).eq('student_id', sid).not('released_at', 'is', null);
  const byId = new Map(((rows ?? []) as unknown as RunRow[]).map(r => [r.id, toBatchRun(r)]));

  // ── One paper ─────────────────────────────────────────────────────────────
  if (runIds.length === 1) {
    const run = byId.get(runIds[0]);
    if (!run) return NextResponse.json({ error: 'That paper is not one of yours, or is not out yet.' }, { status: 404 });
    const out = await queueSheetJob(runIds[0], {
      requestedBy: 'student',
      wave,
      focus: wave >= 2 ? { wave, shelved } : undefined,
    });
    if (!out.ok) {
      // Already being written: that IS what they asked for — say so, no error.
      if (out.status === 'duplicate') return NextResponse.json({ ok: true, state: 'queued', already: true, jobId: out.jobId ?? null });
      const copy = out.status === 'exists'
        ? 'A Practice Again sheet for this paper already exists — Adrian is checking it before it comes to you.'
        : out.status === 'not-released'
          ? 'This paper is not out yet — ask once it is.'
          : 'This paper can’t have a sheet yet — ask Adrian.';
      return NextResponse.json({ error: copy }, { status: out.http });
    }
    const jobId = (out.job as { id?: string } | null)?.id ?? null;
    await log(sb, sid, { runIds, jobId, wave });
    tell(account.display_name || run.student_name, [run], undefined, wave);
    return NextResponse.json({ ok: true, state: 'queued', jobId, runIds });
  }

  // ── Two or three papers, one sheet ────────────────────────────────────────
  const guard = studentBatchGuard(runIds.map(id => byId.get(id) ?? null), jobs, { wave });
  if (!guard.ok) {
    // "These papers are strong" is an ANSWER, not an error (Adrian, 11 Sep
    // 2026: "recommend new exam papers instead") — 200, with somewhere to go.
    if (guard.status === 'strong') {
      return NextResponse.json({ ok: false, reason: 'strong', message: guard.message, href: guard.href ?? '/app/print' });
    }
    return NextResponse.json({ error: guard.message, runId: guard.runId ?? null }, { status: guard.http });
  }

  const out = await queueSheetBatch(guard.runIds, {
    requestedBy: 'student',
    focus: wave >= 2 ? { wave, shelved } : undefined,
  });
  if (!out.ok) return NextResponse.json({ error: out.message, runId: out.runId ?? null }, { status: out.http });
  const jobId = (out.job as { id?: string } | null)?.id ?? null;

  await log(sb, sid, { runIds: guard.runIds, jobId, batch: true, wave });
  const papers = guard.runIds.map(id => byId.get(id)!).filter(Boolean);
  tell(account.display_name || papers[0]?.student_name, papers, guard.subject, wave);

  return NextResponse.json({ ok: true, state: 'queued', jobId, runIds: guard.runIds });
}

/** The student-side record of the ask (PORTAL.md §Activity). Never fails the request. */
async function log(
  sb: ReturnType<typeof getSupabaseAdmin>,
  identity: string,
  detail: Record<string, unknown>,
): Promise<void> {
  const { error } = await sb.from('portal_event_log').insert({ identity, kind: 'practice-again:request', detail });
  if (error) console.warn('[practice-again/request] event log failed:', error.message);
}

/** One line to the marking topic. Best-effort — the job is queued either way. */
function tell(who: string | null | undefined, papers: StudentBatchRun[], subject: string | undefined, wave: number): void {
  const names = papers.map(p => escapeTelegramHtml(shortPaperName(displayPaperName(p.paper_name, p.student_name))));
  sendTelegram(
    practiceAgainRequestLine({
      who: escapeTelegramHtml(who || 'A student'),
      papers: names,
      subject: subject ? escapeTelegramHtml(subject) : undefined,
      wave,
    }),
    'marking',
  ).catch(() => {});
}
