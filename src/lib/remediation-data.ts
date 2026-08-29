// Targeted remediation loop — server-side orchestration (SPEC-REMEDIATION.md).
// The pure logic (classification, state machine, clear rules) lives in
// remediation.ts; this module owns the Supabase reads/writes shared by the
// portal page, the portal API and the admin API. Service-role only — the
// airtable_student_id filter IS the access control, same posture as
// paper_marking_runs, so identity must never come from anything client-set.
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateAssignment } from '@/lib/assignments';
import { sendTelegram } from '@/lib/telegram';
import {
  attemptClears, relockItems, nextOpenItem, planDone,
  type ClearRule, type ItemKind, type ItemState, type LossClass, type PlanStatus,
} from '@/lib/remediation';

export type PlanRow = {
  id: string;
  airtable_student_id: string;
  student_name: string;
  level: string;
  source_run_ids: string[];
  status: PlanStatus;
  report_md: string | null;
  created_at: string;
  approved_at: string | null;
};

export type ItemRow = {
  id: string;
  plan_id: string;
  seq: number;
  kind: ItemKind;
  loss_class: LossClass;
  topic: string;
  skill: string;
  evidence: string[];
  material: { bank_qids?: string[]; docx_url?: string; subgroup_id?: number; note?: string };
  clear_rule: ClearRule;
  state: ItemState;
  attempts: number;
  assignment_ids: string[];
  cleared_at: string | null;
};

const MAX_DRILL_ATTEMPTS = 6;

export async function loadPlan(planId: string): Promise<{ plan: PlanRow; items: ItemRow[] } | null> {
  const sb = getSupabaseAdmin();
  const { data: plan } = await sb.from('remediation_plans').select('*').eq('id', planId).single<PlanRow>();
  if (!plan) return null;
  const { data: items } = await sb.from('remediation_items').select('*').eq('plan_id', planId).order('seq');
  return { plan, items: (items ?? []) as ItemRow[] };
}

/** The student's single visible plan: the newest ACTIVE one. */
export async function loadActivePlan(identity: string): Promise<{ plan: PlanRow; items: ItemRow[] } | null> {
  const sb = getSupabaseAdmin();
  const { data: plan } = await sb
    .from('remediation_plans').select('*')
    .eq('airtable_student_id', identity).eq('status', 'active')
    .order('created_at', { ascending: false }).limit(1).maybeSingle<PlanRow>();
  if (!plan) return null;
  const { data: items } = await sb.from('remediation_items').select('*').eq('plan_id', plan.id).order('seq');
  return { plan, items: (items ?? []) as ItemRow[] };
}

/**
 * Create the next drill assignment for an item: first bank qid no assignment has
 * used yet. Returns the new assignment id, or null (list exhausted / invalid).
 * The assignment is a normal question-kind portal_assignments row, so grading,
 * cap exemption, mastery and Adrian's Telegram all ride the existing rails.
 */
export async function ensureAssignmentForItem(plan: PlanRow, item: ItemRow): Promise<string | null> {
  if (item.kind !== 'drill' && item.kind !== 'probe' && item.kind !== 'prove') return null;
  const qids = item.material?.bank_qids ?? [];
  if (!qids.length) return null;
  const sb = getSupabaseAdmin();
  let used = new Set<string>();
  if (item.assignment_ids.length) {
    const { data: prev } = await sb.from('portal_assignments')
      .select('id, question_id').in('id', item.assignment_ids);
    used = new Set((prev ?? []).map((a: { question_id: string | null }) => a.question_id ?? ''));
  }
  const nextQid = qids.find((q) => !used.has(q));
  if (!nextQid) return null;
  const v = validateAssignment({
    studentId: plan.airtable_student_id,
    kind: 'question',
    questionId: nextQid,
    title: `Game plan: ${item.skill}`.slice(0, 120),
    topic: item.topic.slice(0, 80),
    level: plan.level.slice(0, 20),
    note: `Game plan step ${item.seq} — clear it to unlock the next.`,
  });
  if (!v.ok) return null;
  const { data: created, error } = await sb.from('portal_assignments').insert(v.row).select('id').single<{ id: string }>();
  if (error || !created) return null;
  await sb.from('remediation_items')
    .update({ assignment_ids: [...item.assignment_ids, created.id] })
    .eq('id', item.id);
  item.assignment_ids = [...item.assignment_ids, created.id];
  return created.id;
}

export type ReconciledView = {
  plan: PlanRow;
  items: ItemRow[];
  /** For the open drill item: its live assignment to link to, if any. */
  openAssignment: { id: string; status: string; score: number | null; out_of: number | null } | null;
};

/**
 * Lazy reconcile — called on every read of an active plan. Idempotent:
 *  1. relock so exactly one frontier item is open;
 *  2. if the open item is a drill whose LATEST assignment is marked, apply the
 *     clear rule: cleared → advance (and relock again), else leave open so the
 *     student can ask for another similar;
 *  3. make sure the open drill item has a live assignment to point at;
 *  4. a plan with every item cleared/skipped flips to done.
 * All writes best-effort; the view returned reflects what was persisted.
 */
export async function reconcilePlan(plan: PlanRow, items: ItemRow[]): Promise<ReconciledView> {
  const sb = getSupabaseAdmin();

  const persistStates = async (next: ItemRow[]) => {
    for (const it of next) {
      const before = items.find((x) => x.id === it.id);
      if (before && before.state !== it.state) {
        await sb.from('remediation_items')
          .update({ state: it.state, ...(it.state === 'cleared' ? { cleared_at: new Date().toISOString() } : {}) })
          .eq('id', it.id);
      }
    }
    items = next;
  };

  await persistStates(relockItems(items));

  // Clear check on the frontier item (up to twice, so clearing one item can
  // surface the next without waiting for another page load).
  for (let hop = 0; hop < 2; hop++) {
    const open = nextOpenItem(items);
    if (!open) break;
    if ((open.kind === 'drill' || open.kind === 'probe' || open.kind === 'prove') && open.assignment_ids.length) {
      const lastId = open.assignment_ids[open.assignment_ids.length - 1];
      const { data: a } = await sb.from('portal_assignments')
        .select('id, status, score, out_of').eq('id', lastId).maybeSingle<{ id: string; status: string; score: number | null; out_of: number | null }>();
      if (a && a.status === 'marked' && attemptClears(open.clear_rule, Number(a.score) || 0, Number(a.out_of) || 0)) {
        await persistStates(items.map((it) => (it.id === open.id ? { ...it, state: 'cleared' as ItemState } : it)));
        await persistStates(relockItems(items));
        continue;
      }
    }
    break;
  }

  // Ensure the (possibly new) open drill item has an assignment.
  const open = nextOpenItem(items);
  let openAssignment: ReconciledView['openAssignment'] = null;
  if (open && (open.kind === 'drill' || open.kind === 'probe' || open.kind === 'prove')) {
    if (!open.assignment_ids.length) await ensureAssignmentForItem(plan, open);
    const lastId = open.assignment_ids[open.assignment_ids.length - 1];
    if (lastId) {
      const { data: a } = await sb.from('portal_assignments')
        .select('id, status, score, out_of').eq('id', lastId).maybeSingle<{ id: string; status: string; score: number | null; out_of: number | null }>();
      openAssignment = a ?? null;
    }
  }

  if (planDone(items) && plan.status === 'active') {
    await sb.from('remediation_plans').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', plan.id);
    plan = { ...plan, status: 'done' };
    // The finish-line doorbell (Adrian, 30 Aug 2026: "will I get notification on
    // remediation? I should"). Per-attempt pings already ride the practice
    // grader's assignment Telegram; this is the one that says the whole plan
    // cleared. Fire-and-forget — a Telegram hiccup never breaks the student's
    // page load.
    sendTelegram(
      `🎯 ${plan.student_name || plan.airtable_student_id} finished their game plan — all ${items.length} steps cleared.`
      + `\nhttps://www.adrianmathtuition.com/admin/remediation`
    ).catch(() => {});
  }

  return { plan, items, openAssignment };
}

/**
 * One-shot stuck-step doorbell: a student who hit the retry cap or ran the
 * step's question list dry needs Adrian, not silence. Deduped via
 * material.stuck_notified so repeated taps ring once.
 */
async function notifyStuckOnce(plan: PlanRow, item: ItemRow, why: string): Promise<void> {
  if ((item.material as { stuck_notified?: boolean }).stuck_notified) return;
  const sb = getSupabaseAdmin();
  await sb.from('remediation_items')
    .update({ material: { ...item.material, stuck_notified: true } })
    .eq('id', item.id);
  sendTelegram(
    `⚠️ ${plan.student_name || plan.airtable_student_id} is stuck on game plan step ${item.seq} (“${item.skill}”) — ${why}.`
    + `\nhttps://www.adrianmathtuition.com/admin/remediation`
  ).catch(() => {});
}

/** Student taps "Done — I've read it" on a learn/self-attest item. */
export async function attestItem(identity: string, itemId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin();
  const { data: item } = await sb.from('remediation_items').select('*').eq('id', itemId).maybeSingle<ItemRow>();
  if (!item) return { ok: false, error: 'Not found' };
  const { data: plan } = await sb.from('remediation_plans').select('*').eq('id', item.plan_id).single<PlanRow>();
  if (!plan || plan.airtable_student_id !== identity || plan.status !== 'active') return { ok: false, error: 'Not found' };
  if (item.state !== 'open' || item.clear_rule.kind !== 'self_attest') return { ok: false, error: 'Not attestable' };
  await sb.from('remediation_items')
    .update({ state: 'cleared', cleared_at: new Date().toISOString() })
    .eq('id', itemId);
  return { ok: true };
}

/** Student asks for another similar question after a miss. */
export async function anotherSimilar(identity: string, itemId: string): Promise<{ ok: boolean; assignmentId?: string; error?: string }> {
  const sb = getSupabaseAdmin();
  const { data: item } = await sb.from('remediation_items').select('*').eq('id', itemId).maybeSingle<ItemRow>();
  if (!item) return { ok: false, error: 'Not found' };
  const { data: plan } = await sb.from('remediation_plans').select('*').eq('id', item.plan_id).single<PlanRow>();
  if (!plan || plan.airtable_student_id !== identity || plan.status !== 'active') return { ok: false, error: 'Not found' };
  if (item.state !== 'open') return { ok: false, error: 'This step is not open' };
  if (item.attempts + 1 >= MAX_DRILL_ATTEMPTS) {
    await notifyStuckOnce(plan, item, `hit the ${MAX_DRILL_ATTEMPTS}-attempt retry cap`);
    return { ok: false, error: 'Attempt limit reached — Mr Fong has been pinged to help with this one.' };
  }
  // Only after the current assignment was actually marked (and did not clear).
  const lastId = item.assignment_ids[item.assignment_ids.length - 1];
  if (lastId) {
    const { data: a } = await sb.from('portal_assignments')
      .select('status, score, out_of').eq('id', lastId).maybeSingle<{ status: string; score: number | null; out_of: number | null }>();
    if (!a || a.status !== 'marked') return { ok: false, error: 'Finish the current question first' };
    if (attemptClears(item.clear_rule, Number(a.score) || 0, Number(a.out_of) || 0)) return { ok: false, error: 'Already cleared — reload' };
  }
  const created = await ensureAssignmentForItem(plan, item);
  if (!created) {
    await notifyStuckOnce(plan, item, 'ran out of similar questions');
    return { ok: false, error: 'No more similar questions on this step — Mr Fong has been pinged to help with this one.' };
  }
  await sb.from('remediation_items').update({ attempts: item.attempts + 1 }).eq('id', itemId);
  return { ok: true, assignmentId: created };
}
