/* eslint-disable @typescript-eslint/no-explicit-any */
// Cloud twins — the database half of the doors (5 Oct 2026). Every read and write a cloud
// session's twin needs, done HERE with the service keys, so the keys never leave Vercel.
// The rules are in lib/twin-gates.ts (pure); the briefs in lib/twin-briefs.ts.
//
//   mathQueue / scienceQueue   → the next seeds, each as a full packet (seed, key, solution,
//                                 sub-skill, earlier twins + near neighbours, the author brief)
//   submitMath / submitScience → re-fetch the seed, re-run every gate, render the figure
//                                 through the bot's figure library, insert EXACTLY like
//                                 scripts/twins/twin.mjs publish / sci-twin.mjs publish
//
// The selection is the scripts' own: maths = twin.mjs queue (sub-skills short of the stage —
// 3 verified twins, later 5 — counted by the maths project's math_twin_units(),
// the stuck report's sub-skills first, most-drawn first, one per sub-skill per round);
// science = sci-twin.mjs gap/queue: the science project's science_twin_units() (3 verified twins
// per (pool, sub-skill) at the seed's level, open practice topics first, fewest twins first, the
// six pools taking turns) — the ONE gap the Fly lane and this door both read (5 Oct 2026, Adrian:
// "we need twins questions of all subskills like math").
import { getSupabaseAdmin } from './supabase';
import { getScienceClient } from './science-bank';
import { loadTeachingKnowledge } from './teaching-knowledge';
import { botInternalSecret } from './bot-secret';
import { SCIENCE_PRACTICE_OPEN_TOPICS, SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS } from './portal-beta';
import {
  TWINS_PER_SKILL, TWIN_STAGES, SCI_PER_SKILL, haveFromUnits, mathGapSummary, type MathTwinUnit, TWIN_SCHOOL, TWIN_EXAM_TYPE, orderMathQueue,
  mathQuestionText, structureOf, sumMarks, flatParts, gateMathTwin, mathVerdictOk, mathVerdictFailures, mathBlindAgrees,
  gateScienceTwin, scienceVerdictOk, scienceVerdictFailures, sciQuestionText, keyOf, closest, flatFigureSpec, LETTERS,
  levelFromWork, sciTwinItem, scienceQueueFromUnits, type SciUnit,
  type MathPlan, type CorpusRow, type SubmitBody, type SciKey, type MathVerdict, type SciVerdict, type TwinQueueRow, type MathPart,
} from './twin-gates';
import {
  mathAuthorBrief, mathSolverBrief, mathModeratorBrief, mathModels, scienceAuthorBrief, scienceSolveBrief, scienceCheckBrief, type SciPlan, type MathSeed,
} from './twin-briefs';
import { hasPartMarks } from './part-syllabus';

const MATH_FIG_BUCKET = 'practice-figures';
const SCI_FIG_BUCKET = 'question_images';
const MATH_PROMPT = 'twin-v1-cloud';
const SCI_PROMPT = 'sci-twin-1-cloud';

// ── shared ──────────────────────────────────────────────────────────────────────────
async function pageAll(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<any[]> {
  const out: any[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await build(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type FigureResult = { ok: true; family: string; spec: Record<string, unknown>; png: Buffer } | { ok: false; reason: string };

/** The bot's figure library (lib/figures via POST /api/figure-render). Typed specs only. */
export async function renderFigure(spec: Record<string, unknown> | null): Promise<FigureResult> {
  const flat = flatFigureSpec(spec);
  if (!flat || typeof flat.family !== 'string') return { ok: false, reason: 'figure_spec needs a "family"' };
  const base = (process.env.BOT_BASE_URL || '').trim().replace(/\/$/, '');
  const secret = botInternalSecret();
  if (!base || !secret) return { ok: false, reason: 'figure service not configured (BOT_BASE_URL)' };
  try {
    const r = await fetch(`${base}/api/figure-render`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify({ spec: flat }), signal: AbortSignal.timeout(30_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { ok: false, reason: `figure: ${j.reason ?? `HTTP ${r.status}`}` };
    return { ok: true, family: j.family, spec: j.spec ?? flat, png: Buffer.from(String(j.png), 'base64') };
  } catch (e) {
    return { ok: false, reason: `figure service unreachable: ${(e as Error).message}` };
  }
}

/** The figure library's family list or one family's spec language (passed through from the bot). */
export async function figureDoc(family: string | null): Promise<{ status: number; body: unknown }> {
  const base = (process.env.BOT_BASE_URL || '').trim().replace(/\/$/, '');
  const secret = botInternalSecret();
  if (!base || !secret) return { status: 503, body: { error: 'figure service not configured' } };
  const r = await fetch(`${base}/api/figure-render${family ? `?doc=${encodeURIComponent(family)}` : ''}`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) });
  return { status: r.status, body: await r.json().catch(() => ({ error: `HTTP ${r.status}` })) };
}

// ── maths ───────────────────────────────────────────────────────────────────────────
const FAMILY: Record<string, string[]> = { AM: ['AM', 'S3_AM'], S3_AM: ['AM', 'S3_AM'], EM: ['EM', 'S3_EM'], S3_EM: ['EM', 'S3_EM'] };
export const familyOf = (level: string) => FAMILY[level] ?? [level];
export const MATH_LEVELS = ['EM', 'AM', 'S3_EM', 'S3_AM', 'S1', 'S2', 'JC1', 'JC2'];

/** THE maths gap: math_twin_units over the level's family (migrations/math_twin_units.sql) —
 *  the same function twin.mjs (the Fly lane) and the dashboard read, so the numbers agree. */
export async function mathUnits(level: string, per: number = TWINS_PER_SKILL): Promise<MathTwinUnit[]> {
  const { data, error } = await getSupabaseAdmin().rpc('math_twin_units', { p_levels: familyOf(level), p_per_skill: per });
  if (error) throw new Error(`math_twin_units: ${error.message}`);
  return ((data ?? []) as any[]).map((u) => ({ ...u, subgroup_id: Number(u.subgroup_id) }));
}

async function stuckFocus(): Promise<Set<number>> {
  try {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data } = await getSupabaseAdmin().from('stuck_reports').select('twin_focus').eq('dry', false).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
    return new Set((((data?.[0] as any)?.twin_focus) ?? []).map((f: any) => f.subgroupId).filter((x: unknown) => Number.isInteger(x)));
  } catch { return new Set(); }
}

async function mathSeedAndPlan(id: string) {
  const sb = getSupabaseAdmin();
  const { data: src, error } = await sb.from('questions').select('id, level, school, year, paper, question_number, question_text, parts, answer, solution, total_marks, topics, difficulty, has_image, figure_url, image_url, deleted_at, ai_generated, twin_of').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  // A question with a part marked out of syllabus is never the model for a twin (lib/part-syllabus.ts).
  if (!src || src.deleted_at || hasPartMarks(src.parts)) return null;
  const { data: filing } = await sb.from('question_subgroups').select('subgroup_id, is_primary, subgroups(id, name, topic, description)').eq('question_id', id);
  const subgroups = (filing ?? []).map((f: any) => ({ id: Number(f.subgroup_id), is_primary: !!f.is_primary, name: f.subgroups?.name ?? null, description: f.subgroups?.description ?? null }));
  const marks = Number(src.total_marks) || sumMarks(src as any);
  const plan: MathPlan = {
    source: id, level: src.level, marks, difficulty: src.difficulty ?? 'Standard', topics: src.topics ?? [], subgroups,
    structure: structureOf(src.parts as MathPart[]), has_figure: !!(src.has_image || src.figure_url || (src.image_url && src.image_url !== '[]')),
  };
  return { src: src as any, plan };
}

async function neighbours(levels: string[], text: string, limit = 60): Promise<(CorpusRow & { twin_of: string | null; ai: boolean })[]> {
  const { data, error } = await getSupabaseAdmin().rpc('twin_neighbours', { p_levels: levels, p_text: text.slice(0, 4000), p_limit: limit });
  if (error) throw new Error(`twin_neighbours: ${error.message}`);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, ref: r.twin_of ? `our twin ${String(r.id).slice(0, 8)}` : `${r.school ?? ''} ${r.year ?? ''}`.trim(),
    text: mathQuestionText(r), twin_of: r.twin_of ?? null, ai: !!r.ai_generated,
  })).filter((r) => r.text.length > 20);
}

async function mathPacket(row: TwinQueueRow & { need: number; have: number; focus: boolean }) {
  const sp = await mathSeedAndPlan(row.source_id);
  if (!sp) return null;
  const { src, plan } = sp;
  const srcText = mathQuestionText(src);
  const tk = await loadTeachingKnowledge(getSupabaseAdmin(), { level: src.level, topics: src.topics ?? [], context: srcText.slice(0, 1500), methods: 4, pitfalls: 4, formulae: 0 });
  const knowledge = [
    ...tk.methods.map((m) => ({ kind: 'method', title: m.question_type, body: `${m.method}${m.watch_out ? ` Watch out: ${m.watch_out}` : ''}` })),
    ...tk.pitfalls.map((p) => ({ kind: 'pitfall', title: p.context, body: `wrong move: ${p.wrong_move}. ${p.why_wrong ?? ''} ${p.corrective_cue ? `Cue: ${p.corrective_cue}` : ''}` })),
  ];
  // the twins this sub-skill already has (originality against our own), then the nearest bank rows
  const sb = getSupabaseAdmin();
  let sgTwins: { ref: string; text: string }[] = [];
  const primary = plan.subgroups.find((s) => s.is_primary) ?? plan.subgroups[0];
  if (primary) {
    const { data: f } = await sb.from('question_subgroups').select('question_id').eq('subgroup_id', primary.id).eq('source', 'twin').limit(10);
    const ids = (f ?? []).map((r: any) => r.question_id);
    if (ids.length) {
      const { data: t } = await sb.from('questions').select('id, question_text, parts').in('id', ids).is('deleted_at', null);
      sgTwins = (t ?? []).map((r: any) => ({ ref: `our twin ${String(r.id).slice(0, 8)}`, text: mathQuestionText(r) }));
    }
  }
  const near = (await neighbours(familyOf(src.level), srcText, 12)).filter((r) => r.id !== src.id).slice(0, 4);
  const avoid = [...sgTwins, ...near.map((r) => ({ ref: r.ai ? 'an earlier generated question' : 'a school question', text: r.text }))];
  const seed: MathSeed = { id: src.id, level: src.level, question_text: src.question_text, parts: src.parts, answer: src.answer, solution: src.solution, total_marks: plan.marks };
  return {
    bank: 'maths' as const,
    seed_id: src.id, level: src.level, topic: row.topic ?? (src.topics ?? [])[0] ?? null,
    subskill: primary ? { id: primary.id, name: primary.name, description: primary.description ?? null } : null,
    subskill_has: row.have, subskill_wants: row.need, stuck_focus: row.focus,
    seed: { question_text: src.question_text, parts: src.parts, answer: src.answer, solution: src.solution, total_marks: plan.marks, difficulty: plan.difficulty, topics: plan.topics, has_figure: plan.has_figure, figure_url: typeof src.figure_url === 'string' && /^https?:/.test(src.figure_url) ? src.figure_url : null },
    structure: plan.structure,
    earlier_twins: sgTwins,
    near_neighbours: near.map((r) => ({ text: r.text.slice(0, 1200) })),
    models: mathModels(src.level),
    author_brief: mathAuthorBrief(seed, plan, knowledge, avoid),
  };
}

export async function mathQueue(level: string, n: number, opts: { focusOnly?: boolean; skip?: string[]; per?: number } = {}) {
  const sb = getSupabaseAdmin();
  const lv = familyOf(level);
  const per = opts.per ?? TWINS_PER_SKILL;
  const units = await mathUnits(level, per);
  const have = haveFromUnits(units);
  const rows = await pageAll((a, b) => sb.from('twin_queue').select('source_id, level, subgroup_id, subgroup, topic, draws_90d, total_marks, has_image')
    .in('level', lv).gt('text_len', 40).eq('has_any_twin', false).not('subgroup_id', 'is', null).order('draws_90d', { ascending: false }).order('source_id').range(a, b));
  const focus = await stuckFocus();
  const skip = new Set(opts.skip ?? []);
  const { picked } = orderMathQueue(rows.filter((r) => !skip.has(String(r.source_id))).map((r) => ({ ...r, subgroup_id: Number(r.subgroup_id), draws_90d: Number(r.draws_90d) || 0 })), have, { per, focus, level, limit: n, focusOnly: opts.focusOnly });
  const gap = mathGapSummary(units, per);
  const items = (await Promise.all(picked.map((r) => mathPacket(r).catch((e) => ({ error: (e as Error).message, seed_id: r.source_id }))))).filter(Boolean);
  // subskills_short / twins_to_write = the whole family's gap at `per` (math_twin_units — what
  // twin.mjs queue prints too), not just this window; blocked = short sub-skills with too few seeds left
  return { bank: 'maths', level, family: lv, per_skill: per, stages: TWIN_STAGES, subskills_short: gap.short, twins_to_write: gap.to_write, gap, items };
}

/** A LIVE twin of this seed (a retired one — maths deleted_at, science practice_hidden — does not block). */
async function existingTwin(client: any, seedId: string, item: string, bank: 'maths' | 'science'): Promise<string | null> {
  let q = client.from('questions').select('id').or(`twin_of.eq.${seedId},gen_meta->>twin_item.eq.${item}`);
  q = bank === 'maths' ? q.is('deleted_at', null) : q.eq('practice_hidden', false);
  const { data } = await q.limit(1);
  return (data?.[0]?.id as string) ?? null;
}

export type SubmitOutcome =
  | { ok: true; dry: boolean; id?: string; bank: 'maths' | 'science'; gates: unknown; figure?: { family: string } | null; solve_brief?: string; check_brief?: string }
  | { ok: false; status: number; gate: string; problems: string[]; gates?: unknown };

function fail(gate: string, problems: string[], status = 422, gates?: unknown): SubmitOutcome {
  return { ok: false, status, gate, problems, gates };
}

export async function submitMath(body: SubmitBody): Promise<SubmitOutcome> {
  const q = body.math!;
  const sp = await mathSeedAndPlan(body.seed_id);
  if (!sp) return fail('seed', ['no live question with that seed_id in the maths bank'], 404);
  const { src, plan } = sp;
  if (src.ai_generated || src.twin_of || src.school === TWIN_SCHOOL) return fail('seed', ['the seed must be a school question, not one of ours'], 400);
  const item = `twin-${plan.source}`;
  const sb = getSupabaseAdmin();
  const dup = await existingTwin(sb, plan.source, item, 'maths');
  if (dup) return fail('duplicate', [`this seed already has a twin (${dup}) — take the next seed from the queue`], 409);
  // need: the sub-skill must still be short of its target (two sessions never overshoot)
  const primary = plan.subgroups.find((s) => s.is_primary) ?? plan.subgroups[0];
  if (!primary) return fail('need', ['the seed has no sub-skill filing — twins are written per sub-skill'], 400);
  // (the overshoot guard is the LAST stage: a queue asked with per_skill=5 may fill past 3)
  const top = TWIN_STAGES[TWIN_STAGES.length - 1];
  const have = haveFromUnits(await mathUnits(plan.level, top));
  const has = plan.subgroups.reduce((m, s) => Math.max(m, have.get(s.id) ?? 0), 0);
  if (has >= top) return fail('need', [`sub-skill "${primary.name}" already has ${has} twins (target ${top}) — take the next seed`], 409);
  // automatic gates (the corpus = the 60 bank rows nearest the TWIN's own text, twins included)
  const twinText = mathQuestionText(q);
  const corpus = await neighbours(familyOf(plan.level), twinText, 60);
  const gates = gateMathTwin(q, { plan, srcText: mathQuestionText(src), corpus });
  if (!gates.pass) return fail('automatic', gates.problems, 422, gates);
  // the figure — drawn by the library or not at all
  let fig: Extract<FigureResult, { ok: true }> | null = null;
  if (q.needs_figure) {
    if (!body.figure_spec) return fail('figure', ['needs_figure is true but no figure_spec was sent (a typed spec for the figure library)'], 422, gates);
    const r = await renderFigure(body.figure_spec);
    if (!r.ok) return fail('figure', [r.reason], 422, gates);
    fig = r;
  } else if (body.figure_spec) return fail('figure', ['a figure_spec was sent but needs_figure is false'], 422, gates);
  if (body.dry) {
    return { ok: true, dry: true, bank: 'maths', gates, figure: fig ? { family: fig.family } : null, solve_brief: mathSolverBrief(plan.level, plan.marks, q), check_brief: mathModeratorBrief(plan, q, src) };
  }
  // blind + moderator, re-checked here
  const verdict = body.gate.checker as MathVerdict;
  const blindAnswers = (typeof body.gate.blind_answer === 'object' && body.gate.blind_answer) ? body.gate.blind_answer as Record<string, unknown> : { single: body.gate.blind_answer };
  const vf = mathVerdictFailures(verdict);
  if (!mathVerdictOk(verdict)) return fail('checker', vf, 422, gates);
  const ba = mathBlindAgrees(flatParts(q.parts), q.answer, blindAnswers, verdict);
  if (!ba.ok) return fail('blind', ba.problems, 422, gates);
  // insert, exactly as twin.mjs publish
  let figureUrl: string | null = null;
  if (fig) {
    const path = `twins/${plan.source}.png`;
    const { error } = await sb.storage.from(MATH_FIG_BUCKET).upload(path, fig.png, { contentType: 'image/png', upsert: true });
    if (error) return fail('figure', [`figure upload: ${error.message}`], 500, gates);
    figureUrl = `${(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '')}/storage/v1/object/public/${MATH_FIG_BUCKET}/${path}`;
  }
  const bankParts = (parts: MathPart[] | undefined | null): any[] => (parts ?? []).map((p) => {
    const row: any = { label: String(p.label ?? '').trim().replace(/^\(|\)$/g, ''), text: String(p.text ?? '').trim(), marks: Number(p.marks) || 0 };
    if (p.answer != null && String(p.answer).trim()) row.answer = String(p.answer).trim();
    if (p.subparts?.length) row.subparts = bankParts(p.subparts);
    return row;
  });
  const models = mathModels(plan.level);
  const now = new Date().toISOString();
  const row = {
    question_text: String(q.stem ?? '').trim(),
    answer: q.answer != null && String(q.answer).trim() ? String(q.answer).trim() : null,
    parts: bankParts(q.parts), total_marks: plan.marks, topics: plan.topics, level: plan.level,
    school: TWIN_SCHOOL, year: new Date().getFullYear(), exam_type: TWIN_EXAM_TYPE, paper: null, question_number: null,
    difficulty: plan.difficulty ?? 'Standard', has_image: !!figureUrl, figure_url: figureUrl, image_url: null, images: [], image_size: 'md',
    verified: true, ai_generated: true, twin_of: plan.source, solution: q.solution ?? null, solution_source: 'opus_session', deleted_at: null,
    gen_meta: {
      kind: 'twin', twin_of: plan.source, twin_item: item, prompt_version: MATH_PROMPT, written_by: 'cloud-session',
      source_ref: { school: src.school, year: src.year, paper: src.paper ?? null, question_number: src.question_number ?? null },
      author_model: `${models.author} (cloud Claude Code agent)`, blind_model: `${models.blind} (cloud Claude Code agent)`, moderate_model: `${models.moderate} (cloud Claude Code agent)`,
      gates: { novelty: gates.novelty, number_swap: gates.novelty.number_swap, structure: true, blind_agree: verdict.all_agree, moderator_score: verdict.score, figure_verify: fig ? true : null, rounds: 1, server_checked: true },
      figure: fig ? { family: fig.family, spec: fig.spec, description: q.figure_description ?? null } : null,
      blind_answers: blindAnswers,
      verdict: { key_verdict: verdict.key_verdict ?? null, why: verdict.why ?? null, fixes: verdict.fixes ?? [] },
      method_note: q.method_note ?? null, originality_note: q.originality_note ?? null, notes: body.gate.notes,
      subgroups: plan.subgroups.map((s) => s.id), generated_at: now, verified_at: now, verified_by: 'checks',
    },
  };
  const { data: ins, error } = await sb.from('questions').insert(row).select('id').single();
  if (error) return fail('insert', [error.message], 500, gates);
  const qid = (ins as any).id as string;
  const filing = plan.subgroups.map((s) => ({ question_id: qid, subgroup_id: s.id, is_primary: !!s.is_primary, confidence: 1, source: 'twin', reason: `twin of ${plan.source}` }));
  if (filing.length) {
    const { error: fe } = await sb.from('question_subgroups').upsert(filing, { onConflict: 'question_id,subgroup_id,source' });
    if (fe) console.warn('[twins-cloud] filing warning:', fe.message);
  }
  return { ok: true, dry: false, id: qid, bank: 'maths', gates, figure: fig ? { family: fig.family } : null };
}

// ── science ─────────────────────────────────────────────────────────────────────────
const SCI: Record<SciKey, { bank: string; subject: string; cs: string }> = {
  PHY: { bank: 'PHYS', subject: 'physics', cs: 'CS_PHYS' },
  CHEM: { bank: 'CHEM', subject: 'chemistry', cs: 'CS_CHEM' },
  BIO: { bank: 'BIO', subject: 'biology', cs: 'CS_BIO' },
};
const poolName = (key: SciKey, combined: boolean) => (combined ? `CS_${key}` : key);
export function parsePool(p: unknown): { key: SciKey; combined: boolean } | null {
  const m = /^(CS_)?(PHY|CHEM|BIO)$/.exec(String(p ?? ''));
  return m ? { key: m[2] as SciKey, combined: !!m[1] } : null;
}
export type OpenPool = { key: SciKey; combined: boolean; pool: string; topic: string };
export function openTopics(): OpenPool[] {
  const out: OpenPool[] = [];
  for (const [combined, list] of [[false, SCIENCE_PRACTICE_OPEN_TOPICS], [true, SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS]] as const) {
    for (const [key, topics] of Object.entries(list)) for (const topic of topics) out.push({ key: key as SciKey, combined, pool: poolName(key as SciKey, combined), topic });
  }
  return out;
}

/** The open practice topics as {pool: [topic…]} — science_twin_units puts them first. */
export function openTopicsJson(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of openTopics()) (out[p.pool] ||= []).push(p.topic);
  return out;
}
/** Every (pool, sub-skill) with its twins, need and seeds, in the gap's order (science_twin_units, science project). */
export async function scienceUnits(): Promise<SciUnit[]> {
  const { data, error } = await getScienceClient().rpc('science_twin_units', { open_topics: openTopicsJson(), per_skill: SCI_PER_SKILL });
  if (error) throw new Error(`science_twin_units: ${error.message}`);
  return ((data ?? []) as SciUnit[]).map((u) => ({ ...u, subgroup_id: Number(u.subgroup_id) }));
}
/** The gap in numbers, per pool and in total (the admin tab and the queue's header). */
export function scienceGapSummary(units: SciUnit[]) {
  const pools = new Map<string, { pool: string; subskills: number; covered: number; short: number; no_seed: number; need: number; open_need: number }>();
  for (const u of units) {
    const g = pools.get(u.pool) ?? { pool: u.pool, subskills: 0, covered: 0, short: 0, no_seed: 0, need: 0, open_need: 0 };
    g.subskills++;
    if (u.need === 0) g.covered++; else if (!u.seed_count) g.no_seed++; else g.short++;
    if (u.seed_count) { g.need += u.need; if (u.is_open) g.open_need += u.need; }
    pools.set(u.pool, g);
  }
  const list = [...pools.values()];
  const total = list.reduce((a, g) => ({ subskills: a.subskills + g.subskills, covered: a.covered + g.covered, short: a.short + g.short, no_seed: a.no_seed + g.no_seed, need: a.need + g.need, open_need: a.open_need + g.open_need }), { subskills: 0, covered: 0, short: 0, no_seed: 0, need: 0, open_need: 0 });
  return { per_skill: SCI_PER_SKILL, pools: list, total };
}
export async function scienceGap() {
  return scienceGapSummary(await scienceUnits());
}

type SciSeedRow = { source_id: string; pool: string; topic: string; subgroup_id: number; subgroup: string; is_open: boolean; twins: number; need: number };

async function sciSeedAndPlan(id: string, topicHint: string | null, poolHint: string | null, subgroupHint: number | null = null) {
  const sb = getScienceClient();
  const { data: src, error } = await sb.from('questions').select('id, level, subject, school, year, exam_type, paper, question_number, question_text, answer, solution, topics, skill, has_image, image_url, difficulty, ai_generated, twin_of').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!src) return null;
  const key = (Object.keys(SCI) as SciKey[]).find((k) => SCI[k].subject === src.subject);
  if (!key) return null;
  const combined = String(src.level).startsWith('CS_');
  const pp = parsePool(poolHint) ?? { key, combined };
  const open = openTopics().filter((o) => o.key === pp.key && o.combined === pp.combined).map((o) => o.topic);
  const topic = (topicHint && (src.topics ?? []).includes(topicHint) ? topicHint : null) ?? (src.topics ?? []).find((t: string) => open.includes(t)) ?? (src.topics ?? [])[0];
  const { data: pd } = await sb.from('practice_difficulty').select('level, source, reason').eq('question_id', id).maybeSingle();
  // the unit's sub-skill (the queue hands it out) is THE sub-skill the twin serves; else the seed's own filing
  const { data: f0 } = await sb.from('question_subgroups').select('subgroup_id, is_primary').eq('question_id', id);
  const f = subgroupHint && (f0 ?? []).some((r: any) => Number(r.subgroup_id) === subgroupHint) ? [{ subgroup_id: subgroupHint, is_primary: true }] : (f0 ?? []);
  const sgIds = f.map((r: any) => Number(r.subgroup_id));
  const { data: sgs } = sgIds.length ? await sb.from('subgroups').select('id, name, description').in('id', sgIds) : { data: [] as any[] };
  const subgroups = (sgs ?? []).map((s: any) => ({ id: Number(s.id), name: s.name ?? null, description: s.description ?? null, is_primary: !!(f ?? []).find((r: any) => Number(r.subgroup_id) === Number(s.id))?.is_primary }));
  const plan: SciPlan & { pool: string; bank_level: string; subject: string; open: boolean } = {
    key: pp.key, combined: pp.combined, topic, skill: src.skill ?? null, subgroups,
    // the level the twin is written at: the seed's own (results or the estimate); none → the checker's work score sets it
    seed_level: ['results', 'estimate'].includes((pd as any)?.source) ? (pd as any).level : null, seed_reason: (pd as any)?.reason ?? null,
    seed_has_image: !!src.has_image, pool: poolName(pp.key, pp.combined), bank_level: pp.combined ? SCI[pp.key].cs : SCI[pp.key].bank, subject: src.subject, open: open.includes(topic),
  };
  return { src: src as any, plan, sgIds };
}

async function sciCorpus(subject: string, topic: string, excludeId: string): Promise<(CorpusRow & { ours: boolean })[]> {
  const sb = getScienceClient();
  const rows = await pageAll((a, b) => sb.from('questions').select('id, level, school, year, question_text').eq('subject', subject).contains('topics', [topic]).neq('id', excludeId).order('id').range(a, b));
  return rows.map((r) => ({ id: r.id, ref: r.school === TWIN_SCHOOL ? `our twin ${String(r.id).slice(0, 8)}` : `${r.level} ${r.school ?? ''} ${r.year ?? ''}`.trim(), text: String(r.question_text ?? ''), ours: r.school === TWIN_SCHOOL }));
}

async function sciPacket(row: SciSeedRow) {
  const sp = await sciSeedAndPlan(row.source_id, row.topic, row.pool, row.subgroup_id);
  if (!sp) return null;
  const { src, plan, sgIds } = sp;
  const sb = getScienceClient();
  let siblings: { question_text: string | null }[] = [];
  if (sgIds.length) {
    const { data: fs } = await sb.from('question_subgroups').select('question_id').in('subgroup_id', sgIds).neq('question_id', src.id).limit(40);
    const sids = (fs ?? []).map((r: any) => r.question_id);
    if (sids.length) {
      const { data: sr } = await sb.from('questions').select('id, question_text, school').in('id', sids).eq('level', SCI[plan.key].bank).neq('school', TWIN_SCHOOL).limit(40);
      siblings = ((sr ?? []) as any[]).slice(0, 3);
    }
  }
  const corpus = await sciCorpus(plan.subject, plan.topic, src.id);
  const ours = corpus.filter((r) => r.ours);
  const avoid = [
    ...closest(String(src.question_text ?? ''), ours, 4).map((r) => ({ ref: 'our earlier twin', text: r.text })),
    ...closest(String(src.question_text ?? ''), corpus.filter((r) => !r.ours), 3).map((r) => ({ ref: 'a bank question', text: r.text })),
  ];
  const primary = plan.subgroups.find((s) => (s as any).is_primary) ?? plan.subgroups[0];
  return {
    bank: 'science' as const,
    seed_id: src.id, pool: plan.pool, topic: plan.topic, subgroup_id: row.subgroup_id, level: plan.seed_level ?? 'from the checker\'s work score', subskill_twins: row.twins, subskill_need: row.need,
    subskill: primary ? { id: primary.id, name: primary.name, description: primary.description ?? null } : (plan.skill ? { id: null, name: plan.skill, description: null } : null),
    seed: { question_text: src.question_text, answer: keyOf(src.answer) ?? src.answer, solution: src.solution, level: plan.seed_level, has_figure: !!src.has_image },
    earlier_twins: avoid.filter((a) => a.ref === 'our earlier twin'),
    near_neighbours: avoid.filter((a) => a.ref !== 'our earlier twin').map((a) => ({ text: a.text.slice(0, 1200) })),
    models: { author: 'opus', blind: 'opus', checker: 'opus' },
    author_brief: scienceAuthorBrief(src, plan, siblings, avoid),
  };
}

export async function scienceQueue(n: number, opts: { pool?: string | null; textOnly?: boolean } = {}) {
  const units = await scienceUnits();
  const picked = scienceQueueFromUnits(units, n, opts.pool ?? null);
  const items = (await Promise.all(picked.map((r) => sciPacket(r).catch((e) => ({ error: (e as Error).message, seed_id: r.source_id }))))).filter(Boolean);
  const gap = scienceGapSummary(units);
  return { bank: 'science', per_skill: SCI_PER_SKILL, gap: gap.total, pools: gap.pools, items };
}

export async function submitScience(body: SubmitBody, hints: { topic?: string | null; pool?: string | null; subgroup_id?: number | null } = {}): Promise<SubmitOutcome> {
  const q = { ...body.sci! };
  if (q.answer) q.answer = String(q.answer).trim().toUpperCase();
  const sp = await sciSeedAndPlan(body.seed_id, hints.topic ?? null, hints.pool ?? null, hints.subgroup_id ?? null);
  if (!sp) return fail('seed', ['no question with that seed_id in the science bank'], 404);
  const { src, plan } = sp;
  // (11k science rows from real papers carry ai_generated=true for their written solutions — not ours)
  if (src.twin_of || src.school === TWIN_SCHOOL || src.exam_type === TWIN_EXAM_TYPE) return fail('seed', ['the seed must be a school question, not one of ours'], 400);
  const primary = plan.subgroups[0];
  if (!primary) return fail('seed', ['the seed is not filed under a sub-skill — take a seed from the queue'], 400);
  const item = sciTwinItem(plan.pool, src.id);
  const sb = getScienceClient();
  const dup = await existingTwin(sb, src.id, item, 'science');
  if (dup) return fail('duplicate', [`this seed already has a twin (${dup}) — take the next seed from the queue`], 409);
  const unit = (await scienceUnits()).find((u) => u.pool === plan.pool && u.subgroup_id === primary.id);
  if (!unit) return fail('seed', [`sub-skill ${primary.id} is not a ${plan.pool} sub-skill (a Combined pool takes only the topics the Combined bank has)`], 400);
  if (unit.need <= 0) return fail('need', [`${plan.pool} · ${unit.topic} › ${unit.subgroup} already has ${unit.twins} twins (target ${SCI_PER_SKILL}) — take the next seed`], 409);
  const corpus = await sciCorpus(plan.subject, plan.topic, src.id);
  const gates = gateScienceTwin(q, { srcText: String(src.question_text ?? ''), corpus, key: plan.key });
  if (!gates.pass) return fail('automatic', gates.problems, 422, gates);
  let fig: Extract<FigureResult, { ok: true }> | null = null;
  if (q.needs_figure === true) {
    if (!body.figure_spec) return fail('figure', ['needs_figure is true but no figure_spec was sent (a typed spec for the figure library)'], 422, gates);
    const r = await renderFigure(body.figure_spec);
    if (!r.ok) return fail('figure', [r.reason], 422, gates);
    fig = r;
  } else if (body.figure_spec) return fail('figure', ['a figure_spec was sent but needs_figure is false'], 422, gates);
  if (body.dry) {
    const near = gates.novelty.nearest_id ? corpus.find((r) => r.id === gates.novelty.nearest_id) : null;
    return { ok: true, dry: true, bank: 'science', gates, figure: fig ? { family: fig.family } : null, solve_brief: scienceSolveBrief(plan, q), check_brief: scienceCheckBrief(plan, q, src, near ? { text: near.text, jaccard: gates.novelty.nearest_jaccard } : null) };
  }
  const blind = body.gate.blind ?? {};
  const letter = typeof body.gate.blind_answer === 'string' ? body.gate.blind_answer : (blind as any).answer;
  const verdict = body.gate.checker as SciVerdict;
  if (!scienceVerdictOk(verdict, letter, q.answer)) return fail(String(letter ?? '').trim().toUpperCase() === q.answer ? 'checker' : 'blind', scienceVerdictFailures(verdict, letter, q.answer), 422, gates);
  // insert, exactly as sci-twin.mjs publish
  const imagePath = fig ? `twins/${item}.png` : null;
  const level = (plan.seed_level as 'core' | 'exam' | 'challenge' | null) ?? levelFromWork(verdict.work_score);
  const label = { core: 'Core', exam: 'Exam', challenge: 'Challenge' }[level];
  if (fig && imagePath) {
    const { error } = await sb.storage.from(SCI_FIG_BUCKET).upload(imagePath, fig.png, { contentType: 'image/png', upsert: true });
    if (error) return fail('figure', [`figure upload: ${error.message}`], 500, gates);
  }
  const now = new Date().toISOString();
  const row = {
    level: plan.bank_level, subject: plan.subject, school: TWIN_SCHOOL, year: new Date().getFullYear(), exam_type: TWIN_EXAM_TYPE,
    paper: null, question_number: null,
    question_text: sciQuestionText(q), parts: null, answer: q.answer, solution: q.solution, solution_source: 'opus_session',
    topics: [plan.topic], skill: plan.skill ?? null, difficulty: level === 'challenge' ? 'Challenging' : 'Standard', total_marks: 1,
    has_image: !!imagePath, image_url: imagePath, images: [], image_size: 'md',
    // a drawn figure still waits for the science figure check (bot figfit, FIGFIT_BANK=science) to stamp 'clean'
    image_watermark_status: null,
    verified: true, ai_generated: true, twin_of: src.id, source_question_id: null,
    quarantined: false, not_in_syllabus: false, practice_hidden: false,
    practice_checked_at: now, practice_check_note: 'twin: every check passed (gates, blind solve, checker) — cloud session',
    gen_meta: {
      kind: 'science-twin', twin_item: item, twin_of: src.id, prompt_version: SCI_PROMPT, written_by: 'cloud-session', pool: plan.pool, level_written: level, subskill: primary.id,
      source_ref: { school: src.school, year: src.year, paper: src.paper ?? null, question_number: src.question_number ?? null },
      models: { author: 'opus (cloud Claude Code agent)', blind: 'opus (fresh cloud agent)', checker: 'opus (fresh cloud agent)' },
      gates: { novelty: gates.novelty, rounds: 1, server_checked: true },
      blind: { answer: String(letter).trim().toUpperCase(), confidence: (blind as any).confidence ?? null, other_defensible: (blind as any).other_defensible ?? [] },
      verdict: { work_score: verdict.work_score, score: verdict.score, why: verdict.why ?? null },
      distractors: q.distractors ?? null, why_level: q.why_level ?? q.why_challenge ?? null, originality_note: q.originality_note ?? null, notes: body.gate.notes,
      figure: fig ? { family: fig.family, spec: fig.spec } : null,
      subgroups: plan.subgroups.map((s) => s.id), generated_at: now, verified_by: 'checks',
    },
  };
  const { data: ins, error } = await sb.from('questions').insert(row).select('id').single();
  if (error) return fail('insert', [error.message], 500, gates);
  const qid = (ins as any).id as string;
  const filing = plan.subgroups.map((s) => ({ question_id: qid, subgroup_id: s.id, is_primary: !!(s as any).is_primary, confidence: 1, source: 'twin', reason: `science twin of ${src.id}` }));
  if (filing.length) { const { error: fe } = await sb.from('question_subgroups').upsert(filing, { onConflict: 'question_id,subgroup_id' }); if (fe) console.warn('[twins-cloud] filing warning:', fe.message); }
  const { error: pdErr } = await sb.from('practice_difficulty').upsert({
    question_id: qid, level, source: 'twin', attempts: 0, wrong: 0, wrong_share: null,
    work_score: verdict.work_score, test_solve: null, reason: `Our own ${label} question; ${String(q.why_level ?? q.why_challenge ?? verdict.why ?? '').slice(0, 200)}`,
    detail: { twin_of: src.id, checker_score: verdict.score }, updated_at: now,
  }, { onConflict: 'question_id' });
  if (pdErr) return fail('insert', [`practice_difficulty: ${pdErr.message} (the row ${qid} was inserted — retire it or retry)`], 500, gates);
  return { ok: true, dry: false, id: qid, bank: 'science', gates, figure: fig ? { family: fig.family } : null };
}

// ── retire (the end-to-end test's clean-up; also handy for a session's own mistake) ─────
/** Retire a twin THIS door inserted (gen_meta.written_by = 'cloud-session'): maths → deleted_at; science → practice_hidden + verified=false. */
export async function retireCloudTwin(bank: 'maths' | 'science', id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const client: any = bank === 'maths' ? getSupabaseAdmin() : getScienceClient();
  const { data } = await client.from('questions').select('id, gen_meta').eq('id', id).maybeSingle();
  if (!data) return { ok: false, error: 'no such question' };
  if (data.gen_meta?.written_by !== 'cloud-session') return { ok: false, error: 'only a twin a cloud session inserted can be retired through this door' };
  const patch = bank === 'maths'
    ? { deleted_at: new Date().toISOString(), verified: false }
    : { practice_hidden: true, practice_hidden_reason: `retired by cloud session: ${reason}`.slice(0, 200), verified: false };
  const { error } = await client.from('questions').update(patch).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export { LETTERS };
