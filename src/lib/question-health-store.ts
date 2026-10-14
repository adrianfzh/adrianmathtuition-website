// 🩺 Question health — the database half (SPEC-QUESTION-HEALTH.md). The decisions live in
// question-health.ts (pure, tested); this file reads and writes the MATHS project's
// question_health / question_health_edits / question_health_settings (migrations/question_health.sql).
//
// Serving doors call noteServed() / prefetchTopic() — fire-and-forget, they never slow or fail a
// student's request, and they queue nothing while the switch is off (the SQL checks it too).
import { getSupabaseAdmin } from './supabase';
import { decide, HEALTH_REASONS, PREFETCH, type BankRow, type Decision, type Edit, type HealthReason, type HealthReport, type WeekCounts } from './question-health';

const db = () => getSupabaseAdmin();

/** Queue these questions for a check (the ones never checked). Never throws. */
export async function noteServed(ids: (string | null | undefined)[], reason: HealthReason): Promise<void> {
  const list = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length === 36))];
  if (!list.length) return;
  try {
    const { error } = await db().rpc('qh_enqueue', { p_ids: list, p_reason: reason });
    if (error && !/qh_enqueue|does not exist/i.test(error.message)) console.warn('[question-health] enqueue:', error.message);
  } catch (e) { console.warn('[question-health] enqueue:', (e as Error).message); }
}

/** App practice: a topic opened — queue a few of its never-checked questions. Never throws. */
export async function prefetchTopic(level: string, topic: string, isIp: boolean, n = 4): Promise<void> {
  try {
    const { error } = await db().rpc('qh_prefetch', { p_level: level, p_topic: topic, p_is_ip: isIp, p_n: n });
    if (error && !/qh_prefetch|does not exist/i.test(error.message)) console.warn('[question-health] prefetch:', error.message);
  } catch (e) { console.warn('[question-health] prefetch:', (e as Error).message); }
}

/**
 * App practice served `id`. practice_next serves a checked question first, so an UNCHECKED one
 * means this topic has run out of checked questions: queue it (checked straight after) and a few
 * more of the topic, so the student's next ones are ready. A checked one costs one read. Never throws.
 */
export async function afterPracticeServe(id: string, level: string, topic: string, isIp: boolean): Promise<void> {
  try {
    const { data, error } = await db().from('question_health').select('status').eq('question_id', id).maybeSingle();
    if (error || data) return;   // already known (or the table is not there yet)
    await noteServed([id], 'practice');
    await prefetchTopic(level, topic, isIp, PREFETCH);
  } catch (e) { console.warn('[question-health] after serve:', (e as Error).message); }
}

/** Of these ids, the ones paused or retired — for doors that read `questions` directly, not
 *  through the pickers. Fails OPEN (an empty set) so a hiccup never empties a student's paper. */
export async function blockedIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  try {
    const { data, error } = await db().from('question_health').select('question_id').in('question_id', ids).in('status', ['paused', 'retired']);
    if (error) return new Set();
    return new Set((data ?? []).map((r) => r.question_id as string));
  } catch { return new Set(); }
}

export type HealthSettings = { on: boolean; changedAt: string | null; changedBy: string | null };

export async function getSettings(): Promise<HealthSettings> {
  const { data, error } = await db().from('question_health_settings').select('is_on, changed_at, changed_by').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  return { on: data?.is_on === true, changedAt: data?.changed_at ?? null, changedBy: data?.changed_by ?? null };
}

export async function setOn(on: boolean, by: string): Promise<HealthSettings> {
  const row = { id: 1, is_on: on, changed_at: new Date().toISOString(), changed_by: by };
  const { error } = await db().from('question_health_settings').upsert(row);
  if (error) throw new Error(error.message);
  return { on, changedAt: row.changed_at, changedBy: by };
}

export const QUESTION_COLUMNS = 'id, question_text, answer, solution, parts, total_marks, topics, level, school, year, paper, exam_type, question_number, has_image, image_url, images, figure_url, question_image_url, ai_generated, twin_of, source_file, gen_meta';

/** Waiting = queued, or held by a worker that went quiet past the lease. */
export async function peek(): Promise<{ on: boolean; waiting: number }> {
  const s = await getSettings();
  if (!s.on) return { on: false, waiting: 0 };
  const lease = new Date(Date.now() - 30 * 60_000).toISOString();
  const { count, error } = await db().from('question_health').select('question_id', { count: 'exact', head: true })
    .or(`status.eq.queued,and(status.eq.checking,claimed_at.lt.${lease})`);
  if (error) throw new Error(error.message);
  return { on: true, waiting: count ?? 0 };
}

/** A worker takes up to n questions and gets everything it needs to check them. */
export async function claim(runner: string, n: number): Promise<Record<string, unknown>[]> {
  const { data: ids, error } = await db().rpc('qh_claim', { p_runner: runner.slice(0, 60), p_n: n });
  if (error) throw new Error(error.message);
  const list = ((ids ?? []) as unknown[]).map((r) => (typeof r === 'string' ? r : (r as { qh_claim?: string }).qh_claim)).filter(Boolean) as string[];
  if (!list.length) return [];
  const { data, error: e2 } = await db().from('questions').select(QUESTION_COLUMNS).in('id', list);
  if (e2) throw new Error(e2.message);
  const { data: health } = await db().from('question_health').select('question_id, reason, checks').in('question_id', list);
  const meta = new Map((health ?? []).map((h) => [h.question_id, h]));
  return (data ?? []).map((q) => ({ ...q, _health: meta.get(q.id) ?? null }));
}

async function applyEdits(q: BankRow & Record<string, unknown>, edits: Edit[], by: string): Promise<void> {
  if (!edits.length) return;
  const patch: Record<string, unknown> = {};
  const log = edits.map((e) => {
    patch[e.field] = e.after;
    return { question_id: q.id, field: e.field, before: (q as Record<string, unknown>)[e.field] ?? null, after: e.after, kind: e.kind, evidence: e.evidence.slice(0, 500), made_by: by };
  });
  // the logbook first: an edit that cannot be undone is never made
  const { error: le } = await db().from('question_health_edits').insert(log);
  if (le) throw new Error(`edit log: ${le.message}`);
  const { error } = await db().from('questions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', q.id);
  if (error) throw new Error(error.message);
}

/** The worker's report → the decision applied: edits made (logged), the row stamped. */
export async function submitResult(report: HealthReport, runner: string): Promise<Decision> {
  const { data: q, error } = await db().from('questions').select(QUESTION_COLUMNS).eq('id', report.question_id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!q) throw new Error('no such question');
  const { data: h } = await db().from('question_health').select('checks, status').eq('question_id', report.question_id).maybeSingle();
  const checks = h?.checks ?? 0;
  const d = decide(q as BankRow, report, checks);
  await applyEdits(q as BankRow & Record<string, unknown>, d.edits, 'check');
  const now = new Date().toISOString();
  const row = {
    question_id: report.question_id,
    status: d.status,
    reason: d.requeue ? 'after-fix' : undefined,
    checks: checks + 1,
    checked_at: now,
    queued_at: d.requeue ? now : undefined,
    claimed_at: null, claimed_by: d.requeue ? null : runner.slice(0, 60),
    method: { solver_model: report.solver_model, scheme_found: report.scheme_found, scheme_source: report.scheme_source ?? null, parts: report.parts, completeness: report.completeness, problem: report.problem ?? null },
    note: d.note.slice(0, 500),
    decided_by: 'check', decided_at: now,
  };
  const { error: ue } = await db().from('question_health').upsert(Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)));
  if (ue) throw new Error(ue.message);
  return d;
}

/** Take back one edit: the field gets its old value; the question is checked again. */
export async function undoEdit(id: number, by: string): Promise<void> {
  const { data: e, error } = await db().from('question_health_edits').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!e) throw new Error('no such edit');
  if (e.undone_at) return;
  const { error: ue } = await db().from('questions').update({ [e.field]: e.before, updated_at: new Date().toISOString() }).eq('id', e.question_id);
  if (ue) throw new Error(ue.message);
  await db().from('question_health_edits').update({ undone_at: new Date().toISOString(), undone_by: by }).eq('id', id);
}

/** Adrian's answer on a paused question. */
export async function adrianDecide(questionId: string, action: 'keep' | 'use-solver' | 'retire', by: string): Promise<void> {
  const { data: h, error } = await db().from('question_health').select('method, status').eq('question_id', questionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!h) throw new Error('not checked');
  const now = new Date().toISOString();
  if (action === 'use-solver') {
    const { data: q } = await db().from('questions').select(QUESTION_COLUMNS).eq('id', questionId).maybeSingle();
    const parts = ((h.method as { parts?: { label: string; solver: string | null; agree: boolean }[] })?.parts ?? []).filter((p) => !p.agree && p.solver);
    if (!q || !parts.length) throw new Error('no solver answer to use');
    const { keyEdits } = await import('./question-health');
    const edits = keyEdits(q as BankRow, parts.map((p) => ({ label: p.label, ours: null, solver: p.solver, scheme: p.solver, agree: false })), 'Adrian chose the solver\'s answer')
      .map((x) => ({ ...x, kind: 'adrian' as const }));
    await applyEdits(q as BankRow & Record<string, unknown>, edits as unknown as Edit[], by);
  }
  const status = action === 'retire' ? 'retired' : action === 'keep' ? 'passed' : 'fixed';
  const note = action === 'retire' ? 'retired by Adrian' : action === 'keep' ? 'Adrian: our key is right' : 'Adrian: the solver is right — key changed';
  const { error: ue } = await db().from('question_health').update({ status, note, decided_by: 'adrian', decided_at: now, checked_at: now }).eq('question_id', questionId);
  if (ue) throw new Error(ue.message);
}

export type PausedItem = { question_id: string; note: string | null; checked_at: string | null; method: unknown; question: Record<string, unknown> | null };

export async function listPaused(limit = 50): Promise<PausedItem[]> {
  const { data, error } = await db().from('question_health').select('question_id, note, checked_at, method').eq('status', 'paused').order('checked_at', { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => r.question_id);
  const { data: qs } = ids.length ? await db().from('questions').select('id, question_text, parts, answer, school, year, paper, question_number, level, topics, figure_url, image_url').in('id', ids) : { data: [] };
  const byId = new Map((qs ?? []).map((q) => [q.id, q]));
  return (data ?? []).map((r) => ({ ...r, question: byId.get(r.question_id) ?? null }));
}

export async function listRecentEdits(limit = 40) {
  const { data, error } = await db().from('question_health_edits').select('id, question_id, field, kind, evidence, made_at, made_by, undone_at, before, after').order('made_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The last 7 days, for Monday's message and the page's header. */
export async function weekCounts(): Promise<WeekCounts> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const base = () => db().from('question_health').select('question_id', { count: 'exact', head: true });
  const c = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count, error } = await build(base());
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const settings = await getSettings();
  const [checked, passed, paused, pausedWaiting, retired, queued] = await Promise.all([
    c((q) => q.gte('checked_at', since)),
    c((q) => q.gte('checked_at', since).eq('status', 'passed')),
    c((q) => q.gte('checked_at', since).eq('status', 'paused')),
    c((q) => q.eq('status', 'paused')),
    c((q) => q.gte('checked_at', since).eq('status', 'retired')),
    c((q) => q.eq('status', 'queued')),
  ]);
  const { count: fixed } = await db().from('question_health_edits').select('id', { count: 'exact', head: true }).gte('made_at', since).is('undone_at', null);
  const { data: oldest } = await db().from('question_health').select('queued_at').eq('status', 'queued').order('queued_at', { ascending: true }).limit(1);
  const oldestQueuedHours = oldest?.[0]?.queued_at ? (Date.now() - Date.parse(oldest[0].queued_at)) / 3_600_000 : null;
  return { on: settings.on, checked, passed, fixed: fixed ?? 0, paused, pausedWaiting, retired, queued, oldestQueuedHours };
}

export const isHealthReason = (r: unknown): r is HealthReason => typeof r === 'string' && (HEALTH_REASONS as readonly string[]).includes(r);
