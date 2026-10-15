// The self-check loop's I/O (lib/humanities-selfcheck.ts says what each step is and why). One call of
// runSelfcheck() advances every step a little; /api/cron/humanities-selfcheck calls it every two hours.
// All reads go on the plan queue (plan_reads). Server-only.
import { getSupabaseAdmin } from './supabase';
import { enqueuePlanRead } from './plan-reads';
import { allSets, questionById, SUBJECT_NAME, type HumanitiesSubject } from './humanities-questions';
import { contextForRun, type OwnQuestion } from './humanities-own';
import { buildHumanitiesPayload, humanitiesPrompt, type HumanitiesPayload } from './humanities-prompt';
import { parseReadReply } from './humanities-settle';
import { checkHumanitiesRead, HUMANITIES_PLAN_MODEL } from './humanities-settle-run';
import { HUMANITIES_PREVIEW_IDENTITIES } from './portal-beta';
import { sendTelegram } from './telegram';
import { SKILL_LABEL } from '@/app/app/humanities/skills';
import {
  auditPrompt, parseAudit, typesToLearn, draftPrompt, parseDraft, scoreTest, spreadSample,
  SELFCHECK_DAILY_CAP, TEST_SEEDED, TEST_MISSED, type MissRow, type TestCase,
} from './humanities-selfcheck';

const AUDIT_KIND = 'humanities-audit';
const DRAFT_KIND = 'humanities-rule-draft';
const TEST_KIND = 'humanities-rule-test';

// ── live rules, read at hand-in ─────────────────────────────────────────────────────────────────────
let cache: { at: number; rules: Map<string, string[]> } | null = null;

/** The live learned rules per question type (cached a few minutes). */
export async function liveLearnedRules(): Promise<Map<string, string[]>> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.rules;
  const { data } = await getSupabaseAdmin().from('humanities_rule_patches').select('skill, rule').eq('status', 'live').order('decided_at');
  const rules = new Map<string, string[]>();
  for (const r of data ?? []) if (r.rule) rules.set(r.skill, [...(rules.get(r.skill) ?? []), r.rule]);
  cache = { at: Date.now(), rules };
  return rules;
}

/** The payload with extra rules added where its kind keeps them. */
export function withRules(p: HumanitiesPayload, extra: string[]): HumanitiesPayload {
  if (!extra.length) return p;
  return p.points ? { ...p, points: { ...p.points, rules: [...p.points.rules, ...extra] } } : { ...p, rules: [...(p.rules ?? []), ...extra] };
}

const standardText = (p: HumanitiesPayload): string => p.points
  ? p.points.list.map(x => `- [${x.id}] ${x.text}${x.develop ? ` (developed by: ${x.develop})` : ''}`).join('\n') + (p.points.develop ? '' : '\n(No second mark for development in this question.)')
  : (p.scheme?.levels ?? []).map(l => `Level ${l.level}: ${l.does}`).join('\n');
const materialText = (p: HumanitiesPayload): string => (p.sources ?? []).map(s => `${s.id}${s.provenance ? ` (${s.provenance})` : ''}\n${s.text}`).join('\n\n');
const levelOf = (reply: string | null, payload: HumanitiesPayload): number | null => {
  const v = checkHumanitiesRead(payload, parseReadReply(reply));
  return v.read ? v.read.level : null;
};

// ── 1. CHECK ───────────────────────────────────────────────────────────────────────────────────────
async function queueAudits(): Promise<number> {
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const today = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await sb.from('humanities_audits').select('id', { count: 'exact', head: true }).gte('created_at', today);
  const room = SELFCHECK_DAILY_CAP - (count ?? 0);
  if (room <= 0) return 0;
  const { data: runs } = await sb.from('humanities_runs')
    .select('id, airtable_student_id, subject, skill, question_id, own_question, answer_text, level_lo, level_hi, levels_max, report')
    .eq('source', 'app').in('status', ['marked', 'held']).gte('created_at', since).order('created_at', { ascending: true }).limit(200);
  const { data: done } = await sb.from('humanities_audits').select('run_id').in('run_id', (runs ?? []).map(r => r.id));
  const seen = new Set((done ?? []).map(d => d.run_id));
  let queued = 0;
  for (const r of runs ?? []) {
    if (queued >= room) break;
    // The demo and preview accounts are left out (SELFCHECK_INCLUDE_PREVIEW=1 lets a test run check them).
    const preview = HUMANITIES_PREVIEW_IDENTITIES.includes(String(r.airtable_student_id)) && process.env.SELFCHECK_INCLUDE_PREVIEW !== '1';
    if (seen.has(r.id) || preview || r.level_lo == null || r.level_hi == null) continue;
    const ctx = contextForRun({ question_id: r.question_id, own_question: r.own_question as OwnQuestion | null }, questionById);
    if (!ctx) continue;
    const payload = buildHumanitiesPayload(ctx, String(r.answer_text ?? ''));
    const max = payload.points?.max ?? r.levels_max ?? 4;
    const prompt = auditPrompt({
      subject: SUBJECT_NAME[r.subject as HumanitiesSubject] ?? 'Humanities', question: payload.question,
      material: materialText(payload), standard: standardText(payload), answer: payload.answer,
      delivered: { lo: r.level_lo, hi: r.level_hi, max, lift: (r.report as { lift?: string } | null)?.lift ?? null, points: !!payload.points },
    });
    const { data: row } = await sb.from('humanities_audits').insert({ run_id: r.id, skill: r.skill, delivered_lo: r.level_lo, delivered_hi: r.level_hi }).select('id').single();
    if (!row) continue;
    const readId = await enqueuePlanRead({ kind: AUDIT_KIND, identity: String(r.airtable_student_id), ref: row.id, prompt, model: 'opus', meta: { runId: r.id, max } });
    await sb.from('humanities_audits').update(readId ? { plan_read_id: readId } : { status: 'failed', why: 'the plan queue did not take it' }).eq('id', row.id);
    if (readId) queued++;
  }
  return queued;
}

async function settleAudits(): Promise<number> {
  const sb = getSupabaseAdmin();
  const { data: open } = await sb.from('humanities_audits').select('id, plan_read_id, delivered_lo, delivered_hi').eq('status', 'queued').not('plan_read_id', 'is', null).limit(100);
  if (!open?.length) return 0;
  const { data: reads } = await sb.from('plan_reads').select('id, status, reply, meta').in('id', open.map(o => o.plan_read_id));
  const byId = new Map((reads ?? []).map(r => [r.id, r]));
  let n = 0;
  for (const a of open) {
    const r = byId.get(a.plan_read_id);
    if (!r || r.status === 'queued' || r.status === 'claimed') continue;
    const max = Number((r.meta as { max?: number } | null)?.max ?? 4);
    const res = r.status === 'replied' ? parseAudit(r.reply, { lo: a.delivered_lo, hi: a.delivered_hi, max }) : null;
    await sb.from('humanities_audits').update(res
      ? { status: 'done', audit_level: res.level, verdict: res.verdict, why: res.why, missed_rule: res.missedRule, done_at: new Date().toISOString() }
      : { status: 'failed', why: r.status === 'replied' ? 'the reply was not readable' : 'the read failed', done_at: new Date().toISOString() }).eq('id', a.id);
    n++;
  }
  return n;
}

// ── 2. LEARN ───────────────────────────────────────────────────────────────────────────────────────
async function draftRules(): Promise<number> {
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: misses } = await sb.from('humanities_audits').select('skill, verdict, missed_rule, created_at, run_id, why, audit_level, delivered_lo, delivered_hi')
    .eq('status', 'done').neq('verdict', 'agree').gte('created_at', since);
  const { data: patches } = await sb.from('humanities_rule_patches').select('skill, status, decided_at, evidence');
  // A type is busy while a rule is being drafted or tested; misses already used by a decided rule are not reused.
  const busy = new Set((patches ?? []).filter(p => p.status === 'drafting' || p.status === 'testing').map(p => p.skill));
  const used = new Set((patches ?? []).flatMap(p => ((p.evidence as { runIds?: string[] } | null)?.runIds ?? [])));
  const fresh = (misses ?? []).filter(m => !used.has(m.run_id)) as (MissRow & { why: string; audit_level: number; delivered_lo: number; delivered_hi: number })[];
  const toLearn = typesToLearn(fresh, Date.now(), busy);
  let n = 0;
  for (const [skill, list] of toLearn) {
    const take = list.slice(-8) as typeof fresh;
    const { data: runs } = await sb.from('humanities_runs').select('id, subject, question_id, own_question').in('id', take.map(t => t.run_id));
    const byRun = new Map((runs ?? []).map(r => [r.id, r]));
    const first = byRun.get(take[0].run_id);
    const ctx0 = first ? contextForRun({ question_id: first.question_id, own_question: first.own_question as OwnQuestion | null }, questionById) : null;
    const current = ctx0 ? (buildHumanitiesPayload(ctx0, '').rules ?? []).concat((await liveLearnedRules()).get(skill) ?? []) : [];
    const prompt = draftPrompt({
      subject: SUBJECT_NAME[(first?.subject ?? 'social-studies') as HumanitiesSubject] ?? 'Humanities',
      typeLabel: SKILL_LABEL[skill] ?? skill, current,
      misses: take.map(t => {
        const r = byRun.get(t.run_id);
        const c = r ? contextForRun({ question_id: r.question_id, own_question: r.own_question as OwnQuestion | null }, questionById) : null;
        return { question: c?.question.question ?? '', gave: t.delivered_lo === t.delivered_hi ? `${t.delivered_lo}` : `${t.delivered_lo}–${t.delivered_hi}`, should: String(t.audit_level), why: t.why ?? '', missedRule: t.missed_rule ?? '' };
      }),
    });
    const { data: row } = await sb.from('humanities_rule_patches').insert({ skill, status: 'drafting', evidence: { runIds: take.map(t => t.run_id) } }).select('id').single();
    if (!row) continue;
    const readId = await enqueuePlanRead({ kind: DRAFT_KIND, identity: 'selfcheck', ref: row.id, prompt, model: 'opus' });
    if (!readId) await sb.from('humanities_rule_patches').update({ status: 'rejected', decided_at: new Date().toISOString(), test: { error: 'the plan queue did not take the draft' } }).eq('id', row.id);
    else await sb.from('humanities_rule_patches').update({ test: { draftRead: readId } }).eq('id', row.id);
    n++;
  }
  return n;
}

// ── 3. TEST ────────────────────────────────────────────────────────────────────────────────────────
interface CaseSpec { key: string; kind: 'seeded' | 'missed'; truth: number; payload: HumanitiesPayload }

/** Every case a rule could be tested on: the type's seeded answers, then the missed students' answers. */
async function allCases(skill: string, runIds: string[]): Promise<CaseSpec[]> {
  const seeded: CaseSpec[] = [];
  for (const set of allSets()) for (const q of set.questions) {
    if (q.skill !== skill || !q.seeded?.length) continue;
    const ctx = questionById(q.id);
    if (!ctx) continue;
    q.seeded.forEach((s, i) => seeded.push({ key: `s:${q.id}:${i}`, kind: 'seeded', truth: s.level, payload: buildHumanitiesPayload(ctx, s.text) }));
  }
  const out: CaseSpec[] = [...seeded];
  const sb = getSupabaseAdmin();
  const { data: audits } = await sb.from('humanities_audits').select('run_id, audit_level').in('run_id', runIds);
  const { data: runs } = await sb.from('humanities_runs').select('id, question_id, own_question, answer_text').in('id', runIds);
  const truth = new Map((audits ?? []).map(a => [a.run_id, a.audit_level as number]));
  for (const r of (runs ?? []).slice(0, TEST_MISSED)) {
    const ctx = contextForRun({ question_id: r.question_id, own_question: r.own_question as OwnQuestion | null }, questionById);
    if (ctx && truth.has(r.id)) out.push({ key: `m:${r.id}`, kind: 'missed', truth: truth.get(r.id)!, payload: buildHumanitiesPayload(ctx, String(r.answer_text ?? '')) });
  }
  return out;
}

/** The test set: a spread of seeded answers, and the missed answers. */
async function testCases(skill: string, runIds: string[]): Promise<CaseSpec[]> {
  const all = await allCases(skill, runIds);
  const seeded = all.filter(c => c.kind === 'seeded').sort(() => 0.5 - Math.random());
  return [...spreadSample(seeded, TEST_SEEDED), ...all.filter(c => c.kind === 'missed')];
}

async function startTests(): Promise<number> {
  const sb = getSupabaseAdmin();
  const { data: drafting } = await sb.from('humanities_rule_patches').select('id, skill, evidence, test').eq('status', 'drafting');
  let n = 0;
  for (const p of drafting ?? []) {
    const readId = (p.test as { draftRead?: string } | null)?.draftRead;
    if (!readId) continue;
    const { data: read } = await sb.from('plan_reads').select('status, reply').eq('id', readId).maybeSingle();
    if (!read || read.status === 'queued' || read.status === 'claimed') continue;
    const rule = read.status === 'replied' ? parseDraft(read.reply) : null;
    if (!rule) {
      await sb.from('humanities_rule_patches').update({ status: 'rejected', decided_at: new Date().toISOString(), test: { ...(p.test as object), error: 'no general rule found in the misses' } }).eq('id', p.id);
      continue;
    }
    const live = (await liveLearnedRules()).get(p.skill) ?? [];
    const cases = await testCases(p.skill, (p.evidence as { runIds?: string[] } | null)?.runIds ?? []);
    const queued: { key: string; kind: string; truth: number; base: string | null; patched: string | null }[] = [];
    for (const c of cases) {
      const base = withRules(c.payload, live), patched = withRules(c.payload, [...live, rule]);
      const [b, q] = await Promise.all([
        enqueuePlanRead({ kind: TEST_KIND, identity: 'selfcheck', ref: `${p.id}:${c.key}:base`, prompt: humanitiesPrompt(base, 1), model: HUMANITIES_PLAN_MODEL }),
        enqueuePlanRead({ kind: TEST_KIND, identity: 'selfcheck', ref: `${p.id}:${c.key}:patched`, prompt: humanitiesPrompt(patched, 1), model: HUMANITIES_PLAN_MODEL }),
      ]);
      queued.push({ key: c.key, kind: c.kind, truth: c.truth, base: b, patched: q });
    }
    await sb.from('humanities_rule_patches').update({ rule, status: 'testing', test: { draftRead: readId, cases: queued } }).eq('id', p.id);
    n++;
  }
  return n;
}

// ── 4. DECIDE ──────────────────────────────────────────────────────────────────────────────────────
async function decideTests(): Promise<string[]> {
  const sb = getSupabaseAdmin();
  const { data: testing } = await sb.from('humanities_rule_patches').select('id, skill, rule, evidence, test, created_at').eq('status', 'testing');
  const lines: string[] = [];
  for (const p of testing ?? []) {
    const t = p.test as { cases?: { key: string; kind: 'seeded' | 'missed'; truth: number; base: string | null; patched: string | null }[] };
    const cases = t.cases ?? [];
    const ids = cases.flatMap(c => [c.base, c.patched]).filter(Boolean) as string[];
    const { data: reads } = await sb.from('plan_reads').select('id, status, reply').in('id', ids);
    const byId = new Map((reads ?? []).map(r => [r.id, r]));
    const waiting = ids.some(id => { const r = byId.get(id); return !r || r.status === 'queued' || r.status === 'claimed'; });
    const stale = Date.now() - Date.parse(p.created_at) > 2 * 86_400_000;
    if (waiting && !stale) continue;
    // Rebuild each case's payload to check its reads exactly as the live settle does.
    const specs = new Map((await allCases(p.skill, (p.evidence as { runIds?: string[] } | null)?.runIds ?? [])).map(c => [c.key, c]));
    const scored: TestCase[] = cases.map(c => {
      const spec = specs.get(c.key);
      const lv = (id: string | null) => { const r = id ? byId.get(id) : null; return r?.status === 'replied' && spec ? levelOf(r.reply, spec.payload) : null; };
      return { key: c.key, kind: c.kind, truth: c.truth, base: lv(c.base), patched: lv(c.patched) };
    });
    const score = scoreTest(scored);
    await sb.from('humanities_rule_patches').update({ status: score.live ? 'live' : 'rejected', decided_at: new Date().toISOString(), test: { ...t, score, scored } }).eq('id', p.id);
    cache = null;
    const label = SKILL_LABEL[p.skill] ?? p.skill;
    lines.push(score.live
      ? `📜 Humanities marker learned a rule for "${label}" (live for new answers):\n"${p.rule}"\nTest: practice answers ${score.seededPatched}/${score.seededN} right (was ${score.seededBase}), students' missed answers ${score.missedPatched}/${score.missedN} (was ${score.missedBase}). Turn it off on /admin/humanities-marker.`
      : `📜 Humanities marker tried a rule for "${label}" and dropped it — the test did not show it helps (practice ${score.seededPatched}/${score.seededN} vs ${score.seededBase}; missed ${score.missedPatched}/${score.missedN} vs ${score.missedBase}).`);
  }
  return lines;
}

/** The steps one by one, for a test run from a script. */
export const selfcheckSteps = { queueAudits, settleAudits, draftRules, startTests, decideTests };

export interface SelfcheckRun { audited: number; settled: number; drafted: number; tested: number; decided: number }

export async function runSelfcheck(): Promise<SelfcheckRun> {
  const settled = await settleAudits();
  const decidedLines = await decideTests();
  const tested = await startTests();
  const drafted = await draftRules();
  const audited = await queueAudits();
  // Only a rule going live is news; a dropped one is on the page.
  for (const l of decidedLines.filter(x => x.includes('learned a rule'))) await sendTelegram(l, 'marking').catch(() => {});
  return { audited, settled, drafted, tested, decided: decidedLines.length };
}
