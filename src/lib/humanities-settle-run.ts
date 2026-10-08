// Settling a humanities answer from its plan reads (SPEC-HUMANITIES.md §The reader on the plan,
// 8 Oct 2026). The hand-in queues two reads in plan_reads; nothing pushes the answer back, so the
// run is settled whenever it is LOOKED AT while in flight — the feedback page (it refreshes every
// few seconds), the timed paper's result page, the answers list, the admin door the bench polls,
// and the health check, so no answer waits on a page being open. Server-only.
import { getSupabaseAdmin } from './supabase';
import { enqueuePlanRead } from './plan-reads';
import { questionById } from './humanities-questions';
import { buildHumanitiesPayload, humanitiesPrompt, readContext, type HumanitiesPayload } from './humanities-prompt';
import { parseReadReply, validateRead, validatePointsRead, nextStep, buildReport, buildPointsReport, telegramLine, type PassState, type Checked } from './humanities-settle';
import { sendTelegram } from './telegram';

export const HUMANITIES_READ_KIND = 'humanities-read';
/** The plan reader's model alias (plan_reads takes sonnet · opus · haiku). The bench in SPEC-HUMANITIES.md §4 chose it. */
export const HUMANITIES_PLAN_MODEL: PlanModel = 'opus';
export type PlanModel = 'sonnet' | 'opus';
export const isPlanModel = (m: unknown): m is PlanModel => m === 'sonnet' || m === 'opus';
/** Only one settler writes at a time: the run's claimed_at is a short lease. */
const LEASE_MS = 20_000;

interface ReadRow { id: string; ref: string | null; status: string; reply: string | null; error: string | null; meta: Record<string, unknown> | null; created_at: string }

/** Queue one read of an answer. → false when the queue refused it. */
export async function enqueueHumanitiesRead(run: { id: string; identity: string }, payload: HumanitiesPayload, pass: number, model: PlanModel): Promise<boolean> {
  const id = await enqueuePlanRead({
    kind: HUMANITIES_READ_KIND, identity: run.identity, ref: `${run.id}:${pass}`,
    prompt: humanitiesPrompt(payload, pass), model, meta: { runId: run.id, pass, model },
  });
  return !!id;
}

function check(payload: HumanitiesPayload, raw: Record<string, unknown> | null): Checked {
  const c = readContext(payload);
  return c.points
    ? validatePointsRead(raw, { answer: payload.answer, points: payload.points?.list ?? [], max: c.max, develop: !!payload.points?.develop })
    : validateRead(raw, { answer: payload.answer, levelsMax: c.max, tags: c.tags });
}

/**
 * Look at one run. If it is in flight and its reads are back, settle it: two reads the same →
 * marked; different → a third is queued; three with no majority → held; a read that failed or did
 * not pass the belt → one more is queued, then failed. Safe to call from anywhere, any number of times.
 */
export async function settleHumanitiesRun(runId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data: run } = await sb.from('humanities_runs')
    .select('id, status, airtable_student_id, student_name, skill, question_id, answer_text, source')
    .eq('id', runId).maybeSingle();
  if (!run || (run.status !== 'queued' && run.status !== 'marking')) return;
  const { data } = await sb.from('plan_reads').select('id, ref, status, reply, error, meta, created_at')
    .eq('kind', HUMANITIES_READ_KIND).like('ref', `${runId}:%`).order('created_at', { ascending: true });
  const rows = (data ?? []) as ReadRow[];
  if (!rows.length) return;   // the paid path's run (the bot writes it), or a hand-in still being queued
  const ctx = questionById(String(run.question_id));
  const payload = ctx ? buildHumanitiesPayload(ctx, String(run.answer_text ?? '')) : null;

  // One row a pass (the earliest, should two settlers ever have queued the same one).
  const byPass = new Map<number, ReadRow>();
  for (const r of rows) { const p = Number(String(r.ref ?? '').split(':')[1]); if (Number.isInteger(p) && !byPass.has(p)) byPass.set(p, r); }
  const passes: PassState[] = [];
  const log: { pass: number; level: number | null; problems: string[]; dropped: string[]; raw: unknown }[] = [];
  for (const [pass, r] of [...byPass.entries()].sort((a, b) => a[0] - b[0])) {
    if (r.status === 'queued' || r.status === 'claimed') { passes.push({ pass, state: 'waiting' }); continue; }
    if (r.status !== 'replied' || !payload) { passes.push({ pass, state: 'bad' }); log.push({ pass, level: null, problems: [r.error || 'the read failed'], dropped: [], raw: null }); continue; }
    const raw = parseReadReply(r.reply);
    const v = check(payload, raw);
    log.push({ pass, level: v.read ? v.read.level : null, problems: raw ? v.problems : ['the reply was not JSON'], dropped: v.dropped, raw: raw ?? String(r.reply ?? '').slice(0, 1500) });
    passes.push(v.read ? { pass, state: 'clean', read: v.read } : { pass, state: 'bad' });
  }
  const step = payload ? nextStep(passes) : { do: 'failed' as const, error: 'the question is no longer in the bank' };
  const model = String(rows[0].meta?.model ?? '');

  if (step.do === 'wait') {
    if (run.status === 'queued' && rows.some(r => r.status !== 'queued')) await sb.from('humanities_runs').update({ status: 'marking' }).eq('id', runId).eq('status', 'queued');
    return;
  }
  // The lease: of several pages and polls looking at once, one acts.
  const now = Date.now();
  const { data: won } = await sb.from('humanities_runs').update({ claimed_at: new Date(now).toISOString() })
    .eq('id', runId).in('status', ['queued', 'marking']).or(`claimed_at.is.null,claimed_at.lt.${new Date(now - LEASE_MS).toISOString()}`).select('id');
  if (!won || !won.length) return;

  if (step.do === 'read') {
    const ok = await enqueueHumanitiesRead({ id: runId, identity: String(run.airtable_student_id) }, payload!, step.pass, isPlanModel(model) ? model : HUMANITIES_PLAN_MODEL);
    if (ok) await sb.from('humanities_runs').update({ status: 'marking' }).eq('id', runId).in('status', ['queued', 'marking']);
    return;   // a refused queue is tried again when the lease runs out
  }
  const at = new Date().toISOString();
  const base = { marked_at: at, model: model ? `plan:${model}` : null, cost_usd: 0, reads: log };
  let row: Record<string, unknown>;
  if (step.do === 'failed') {
    row = { ...base, status: 'failed', error: step.error };
  } else {
    const c = readContext(payload!);
    const report = c.points ? buildPointsReport(step.reads, step.agreement, c.max) : buildReport(step.reads, step.agreement, c.max);
    const held = step.do === 'held';
    row = {
      ...base, status: step.do, report,
      // A held answer carries its range but NO settled level — the bench counts it as not read.
      level: held ? null : report.level, level_lo: report.level_lo, level_hi: report.level_hi,
      held_reason: held ? `the reads disagree: ${step.agreement.levels.join(' / ')}` : null,
      released_at: held ? null : at,
    };
  }
  const { data: wrote, error } = await sb.from('humanities_runs').update(row).eq('id', runId).in('status', ['queued', 'marking']).select('id');
  if (error) { console.error('[humanities] settle failed:', error.message); return; }
  if (wrote?.length && step.do !== 'marked' && run.source !== 'calibration') {
    const rep = (row.report as Parameters<typeof telegramLine>[0]['report']) ?? null;
    await sendTelegram(telegramLine({ studentName: run.student_name, skill: String(run.skill), report: rep, held: step.do === 'held', heldReason: (row.held_reason as string) ?? null, error: step.do === 'failed' ? step.error : null }), 'marking').catch(() => false);
  }
}

/**
 * Settle the answers still in flight — one student's, one timed paper's, or (the health check)
 * everyone's, oldest first. → how many were looked at.
 */
export async function settleOpenHumanities(scope: { identity?: string; paperId?: string }, limit = 20): Promise<number> {
  const sb = getSupabaseAdmin();
  let q = sb.from('humanities_runs').select('id').in('status', ['queued', 'marking']).order('created_at', { ascending: true }).limit(limit);
  if (scope.identity) q = q.eq('airtable_student_id', scope.identity);
  if (scope.paperId) q = q.eq('paper_id', scope.paperId);
  const { data } = await q;
  const ids = ((data ?? []) as { id: string }[]).map(r => r.id);
  await Promise.all(ids.map(id => settleHumanitiesRun(id).catch(e => console.error('[humanities] settle threw:', (e as Error).message))));
  return ids.length;
}
