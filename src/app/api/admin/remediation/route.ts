// /api/admin/remediation — the fix-it loop's admin API (SPEC-REMEDIATION.md).
//   GET  ?planId=…            → { plan, items }
//   GET  [?studentId=recXXX]  → { plans } (newest first, 30)
//   POST { action:'draft', studentId, runIds[], level, studentName? } → { plan, items }
//   POST { action:'activate' | 'archive', planId } → { plan }
//   POST { action:'add-item', planId, item:{kind, lossClass?, topic?, skill, material?, clearRule?, seq?} }
//   POST { action:'update-item', itemId, patch:{skill?, topic?, material?, clearRule?, seq?, kind?} }
//   POST { action:'remove-item' | 'skip-item', itemId }
// Drafts never reach a student; only 'activate' (Adrian's approval tap) makes a
// plan visible in the portal — the doctrine checkpoint.
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getTopicsForLevel } from '@/lib/canonical-topics';
import {
  extractLossEvidence, classifyLossDeterministic, evidenceRef, buildDraftPrompt,
  parsePlanDraft, buildReportMd, defaultClearRule, relockItems,
  type LossClass, type LossEvidence,
} from '@/lib/remediation';
import { loadPlan, ensureAssignmentForItem, type ItemRow, type PlanRow } from '@/lib/remediation-data';
import { logJobRun } from '@/lib/job-log';
import { extractQuestionEvidence, type ShelfEvidence } from '@/lib/shelf';

export const runtime = 'nodejs';
export const maxDuration = 120;

const DRAFT_MODEL = 'claude-opus-4-8';
const CANDIDATES_PER_ITEM = 5;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const planId = req.nextUrl.searchParams.get('planId');
  const sb = getSupabaseAdmin();
  if (planId) {
    const loaded = await loadPlan(planId);
    if (!loaded) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(loaded);
  }
  const studentId = req.nextUrl.searchParams.get('studentId');
  let q = sb.from('remediation_plans').select('*').order('created_at', { ascending: false }).limit(30);
  if (studentId) q = q.eq('airtable_student_id', studentId);
  const { data: plans, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: plans ?? [] });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const action = String(body.action ?? '');
  try {
    switch (action) {
      case 'draft': return await draft(body);
      case 'activate': return await activate(String(body.planId ?? ''));
      case 'archive': return await setPlanStatus(String(body.planId ?? ''), 'archived');
      case 'add-item': return await addItem(body);
      case 'update-item': return await updateItem(body);
      case 'remove-item': return await removeItem(String(body.itemId ?? ''));
      case 'shelve-item': return await shelveItem(String(body.itemId ?? ''));
      case 'skip-item': return await skipItem(String(body.itemId ?? ''));
      default: return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function draft(body: Record<string, unknown>) {
  const studentId = String(body.studentId ?? '').trim();
  const level = String(body.level ?? '').trim();
  const runIds = (Array.isArray(body.runIds) ? body.runIds : []).map((r) => String(r)).filter(Boolean);
  if (!/^rec[A-Za-z0-9]{14}$/.test(studentId)) return NextResponse.json({ error: 'studentId must be an Airtable record id' }, { status: 400 });
  if (!level) return NextResponse.json({ error: 'level required (bank level, e.g. AM / EM / JC2)' }, { status: 400 });
  if (!runIds.length) return NextResponse.json({ error: 'runIds required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: runs, error } = await sb.from('paper_marking_runs')
    .select('id, paper_name, student_name, result_json').in('id', runIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!runs?.length) return NextResponse.json({ error: 'No runs found' }, { status: 404 });

  const evidence: LossEvidence[] = runs.flatMap((r: { result_json: unknown }) => extractLossEvidence(r.result_json));
  if (!evidence.length) return NextResponse.json({ error: 'No lost marks found on those runs — nothing to plan' }, { status: 400 });

  const preClassified = new Map<string, LossClass>();
  for (const e of evidence) {
    const cls = classifyLossDeterministic(e);
    if (cls) preClassified.set(evidenceRef(e), cls);
  }
  const bankTopics = getTopicsForLevel(level).flatMap((c) => c.topics);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: buildDraftPrompt(evidence, preClassified, bankTopics) }],
  });
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const items = parsePlanDraft(text, evidence, preClassified, bankTopics);
  if (!items.length) return NextResponse.json({ error: 'Draft came back empty — try again' }, { status: 502 });

  // Bank candidates per item, up front, so the review screen shows real ammo
  // (or the gap) before Adrian activates. Items with no candidates fall back to
  // self-attest — still useful for checklist/first-move material Adrian attaches.
  for (const it of items) {
    if (it.bankTopic) {
      const { data: cands } = await sb.rpc('practice_candidates', {
        p_level: level, p_topic: it.bankTopic, p_tier: null, p_limit: CANDIDATES_PER_ITEM,
      });
      const qids = (cands ?? []).map((c: { id: string }) => c.id).filter(Boolean);
      if (qids.length) {
        (it as unknown as { material: Record<string, unknown> }).material = { bank_qids: qids, ...(it.reminder ? { reminder: it.reminder } : {}) };
        continue;
      }
    }
    (it as unknown as { material: Record<string, unknown> }).material = it.reminder ? { reminder: it.reminder } : {};
    it.clearRule = { kind: 'self_attest' };
  }

  const paperNames = runs.map((r: { paper_name: string | null }) => r.paper_name ?? '').filter(Boolean);
  const reportMd = buildReportMd(paperNames, evidence, items);
  const studentName = String(body.studentName ?? runs.find((r: { student_name: string | null }) => r.student_name)?.student_name ?? '');

  const { data: plan, error: pErr } = await sb.from('remediation_plans').insert({
    airtable_student_id: studentId, student_name: studentName, level,
    source_run_ids: runIds, status: 'draft', report_md: reportMd,
  }).select('*').single<PlanRow>();
  if (pErr || !plan) return NextResponse.json({ error: pErr?.message ?? 'insert failed' }, { status: 500 });

  const rows = items.map((it) => ({
    plan_id: plan.id, seq: it.seq, kind: it.kind, loss_class: it.lossClass,
    topic: it.topic, skill: it.skill, evidence: it.evidence,
    material: (it as unknown as { material: Record<string, unknown> }).material ?? {},
    clear_rule: it.clearRule, state: 'locked',
  }));
  const { data: inserted, error: iErr } = await sb.from('remediation_items').insert(rows).select('*');
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  await logJobRun('remediation-draft', true, `${studentName || studentId}: ${items.length} item(s) from ${runIds.length} run(s)`);
  return NextResponse.json({ plan, items: inserted });
}

async function activate(planId: string) {
  if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });
  const loaded = await loadPlan(planId);
  if (!loaded) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (loaded.plan.status !== 'draft') return NextResponse.json({ error: `Plan is ${loaded.plan.status}` }, { status: 409 });
  const sb = getSupabaseAdmin();
  // One active plan per student — a second Activate archives the previous one.
  await sb.from('remediation_plans')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('airtable_student_id', loaded.plan.airtable_student_id).eq('status', 'active');
  const relocked = relockItems(loaded.items);
  for (const it of relocked) {
    const before = loaded.items.find((x) => x.id === it.id);
    if (before && before.state !== it.state) {
      await sb.from('remediation_items').update({ state: it.state }).eq('id', it.id);
    }
  }
  const { data: plan } = await sb.from('remediation_plans')
    .update({ status: 'active', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', planId).select('*').single<PlanRow>();
  const open = relocked.find((it) => it.state === 'open');
  if (plan && open) await ensureAssignmentForItem(plan, open as ItemRow);
  return NextResponse.json({ plan });
}

async function setPlanStatus(planId: string, status: 'archived') {
  if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });
  const { data: plan, error } = await getSupabaseAdmin().from('remediation_plans')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', planId).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan });
}

async function addItem(body: Record<string, unknown>) {
  const planId = String(body.planId ?? '');
  const item = (body.item ?? {}) as Record<string, unknown>;
  const loaded = await loadPlan(planId);
  if (!loaded) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const skill = String(item.skill ?? '').trim().slice(0, 160);
  if (!skill) return NextResponse.json({ error: 'item.skill required' }, { status: 400 });
  const kind = ['probe', 'learn', 'drill', 'prove'].includes(String(item.kind)) ? String(item.kind) : 'learn';
  const lossClass = ['blank', 'procedure', 'discipline', 'concept'].includes(String(item.lossClass)) ? String(item.lossClass) : 'concept';
  // Number(item.seq) || fallback would treat an explicit seq 0 as unset —
  // seq 0 is exactly how a prepended "read this first" learn item sorts ahead
  // of a drafted plan's 1..N.
  const seqRaw = Number(item.seq);
  const seq = item.seq != null && Number.isFinite(seqRaw) ? seqRaw : (Math.max(0, ...loaded.items.map((i) => i.seq)) + 1);
  const clearRule = (item.clearRule as Record<string, unknown>)?.kind
    ? item.clearRule
    : kind === 'learn' ? { kind: 'self_attest' } : defaultClearRule(lossClass as LossClass);
  const { data: inserted, error } = await getSupabaseAdmin().from('remediation_items').insert({
    plan_id: planId, seq, kind, loss_class: lossClass,
    topic: String(item.topic ?? '').slice(0, 80), skill,
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    material: (item.material as Record<string, unknown>) ?? {},
    clear_rule: clearRule, state: 'locked',
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: inserted });
}

async function updateItem(body: Record<string, unknown>) {
  const itemId = String(body.itemId ?? '');
  const patch = (body.patch ?? {}) as Record<string, unknown>;
  const allowed: Record<string, unknown> = {};
  if (typeof patch.skill === 'string') allowed.skill = patch.skill.slice(0, 160);
  if (typeof patch.topic === 'string') allowed.topic = patch.topic.slice(0, 80);
  if (patch.material && typeof patch.material === 'object') allowed.material = patch.material;
  if (patch.clearRule && typeof patch.clearRule === 'object') allowed.clear_rule = patch.clearRule;
  if (Number.isFinite(Number(patch.seq))) allowed.seq = Number(patch.seq);
  if (['probe', 'learn', 'drill', 'prove'].includes(String(patch.kind))) allowed.kind = patch.kind;
  if (!Object.keys(allowed).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  const { data: item, error } = await getSupabaseAdmin().from('remediation_items')
    .update(allowed).eq('id', itemId).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item });
}

async function removeItem(itemId: string) {
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  const { error } = await getSupabaseAdmin().from('remediation_items').delete().eq('id', itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * 🧺 Prune a draft item WITHOUT losing the diagnosis: the item moves to the
 * student's shelf ("wave 2 waiting", IDEAS.md 2026-08-30) with its evidence
 * re-grabbed from the plan's own source runs — question prompt, part scores,
 * the annotated page — then leaves the plan. Remove stays the other choice for
 * items that were simply wrong.
 */
async function shelveItem(itemId: string) {
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: item } = await sb.from('remediation_items').select('*').eq('id', itemId).maybeSingle<ItemRow>();
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: plan } = await sb.from('remediation_plans').select('*').eq('id', item.plan_id).single<PlanRow>();
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

  // The evidence refs ("Q6(b)") point into the plan's source runs — walk those
  // runs and grab each ref's prompt/scores/annotated page. A ref no run can
  // answer is skipped rather than fatal: the shelf entry still carries the
  // skill and whatever evidence WAS found.
  const runIds = (plan.source_run_ids ?? []).filter(Boolean);
  const { data: runs } = runIds.length
    ? await sb.from('paper_marking_runs').select('id, paper_name, result_json').in('id', runIds)
    : { data: [] as Array<{ id: string; paper_name: string | null; result_json: unknown }> };

  const evidence: ShelfEvidence[] = [];
  let lost = 0;
  const matchedRuns = new Map<string, string>(); // id → paper_name
  for (const ref of item.evidence ?? []) {
    for (const run of runs ?? []) {
      const grabbed = extractQuestionEvidence(run.result_json, String(ref).replace(/^Q/i, ''));
      if (grabbed) {
        evidence.push(grabbed.evidence);
        lost += grabbed.lost;
        matchedRuns.set(run.id, run.paper_name ?? '');
        break;
      }
    }
  }

  const { data: shelfRow, error: insErr } = await sb.from('student_shelf').insert({
    airtable_student_id: plan.airtable_student_id,
    student_name: plan.student_name ?? '',
    topic: (item.topic || 'General').slice(0, 120),
    skill_label: (item.skill || item.topic || 'Deferred skill').slice(0, 200),
    evidence,
    source_run_id: [...matchedRuns.keys()][0] ?? null,
    paper_name: [...matchedRuns.values()].filter(Boolean).join(' · ').slice(0, 160),
    marks_lost: evidence.length ? lost : null,
    note: 'Shelved while pruning a game-plan draft.',
  }).select('*').single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const { error: delErr } = await sb.from('remediation_items').delete().eq('id', itemId);
  if (delErr) return NextResponse.json({ error: `shelved, but the item stayed on the plan: ${delErr.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, item: shelfRow });
}

async function skipItem(itemId: string) {
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  const { data: item, error } = await getSupabaseAdmin().from('remediation_items')
    .update({ state: 'skipped' }).eq('id', itemId).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item });
}
