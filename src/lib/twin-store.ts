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
// The selection is the scripts' own: maths = twin.mjs queue (sub-skills short of 5 twins,
// the stuck report's sub-skills first, most-drawn first, one per sub-skill per round);
// science = sci-twin.mjs gap/queue (open topics short of 30 servable Challenge MCQs, biggest
// gap first, Challenge seeds before Exam, text-only before figured, one sub-skill a round).
import { getSupabaseAdmin } from './supabase';
import { getScienceClient } from './science-bank';
import { loadTeachingKnowledge } from './teaching-knowledge';
import { botInternalSecret } from './bot-secret';
import { SCIENCE_PRACTICE_OPEN_TOPICS, SCIENCE_PRACTICE_COMBINED_OPEN_TOPICS } from './portal-beta';
import {
  TWINS_PER_SKILL, SCI_TARGET, TWIN_SCHOOL, TWIN_EXAM_TYPE, orderMathQueue, spreadBySubgroup, interleaveTopics,
  mathQuestionText, structureOf, sumMarks, flatParts, gateMathTwin, mathVerdictOk, mathVerdictFailures, mathBlindAgrees,
  gateScienceTwin, scienceVerdictOk, scienceVerdictFailures, sciQuestionText, keyOf, closest, flatFigureSpec, LETTERS,
  type MathPlan, type CorpusRow, type SubmitBody, type SciKey, type MathVerdict, type SciVerdict, type TwinQueueRow, type MathPart,
} from './twin-gates';
import {
  mathAuthorBrief, mathSolverBrief, mathModeratorBrief, mathModels, scienceAuthorBrief, scienceSolveBrief, scienceCheckBrief, type SciPlan, type MathSeed,
} from './twin-briefs';

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

async function twinCounts(level: string): Promise<{ sgOf: Map<string, number>; have: Map<number, number> }> {
  const sb = getSupabaseAdmin();
  const lv = familyOf(level);
  const rows = await pageAll((a, b) => sb.from('twin_queue').select('source_id, subgroup_id').in('level', lv).order('source_id').range(a, b));
  const sgOf = new Map<string, number>(rows.filter((r) => r.subgroup_id != null).map((r) => [r.source_id, Number(r.subgroup_id)]));
  const twins = await pageAll((a, b) => sb.from('questions').select('twin_of').in('level', lv).not('twin_of', 'is', null).is('deleted_at', null).order('id').range(a, b));
  const have = new Map<number, number>();
  for (const t of twins) { const sg = sgOf.get(t.twin_of); if (sg != null) have.set(sg, (have.get(sg) ?? 0) + 1); }
  return { sgOf, have };
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
  if (!src || src.deleted_at) return null;
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

export async function mathQueue(level: string, n: number, opts: { focusOnly?: boolean; skip?: string[] } = {}) {
  const sb = getSupabaseAdmin();
  const lv = familyOf(level);
  const { have } = await twinCounts(level);
  const rows = await pageAll((a, b) => sb.from('twin_queue').select('source_id, level, subgroup_id, subgroup, topic, draws_90d, total_marks, has_image')
    .in('level', lv).gt('text_len', 40).eq('has_any_twin', false).not('subgroup_id', 'is', null).order('draws_90d', { ascending: false }).order('source_id').range(a, b));
  const focus = await stuckFocus();
  const skip = new Set(opts.skip ?? []);
  const { picked, subskills, toWrite } = orderMathQueue(rows.filter((r) => !skip.has(String(r.source_id))).map((r) => ({ ...r, subgroup_id: Number(r.subgroup_id), draws_90d: Number(r.draws_90d) || 0 })), have, { per: TWINS_PER_SKILL, focus, level, limit: n, focusOnly: opts.focusOnly });
  const items = (await Promise.all(picked.map((r) => mathPacket(r).catch((e) => ({ error: (e as Error).message, seed_id: r.source_id }))))).filter(Boolean);
  return { bank: 'maths', level, family: lv, subskills_short: subskills, twins_to_write: toWrite, per_skill: TWINS_PER_SKILL, items };
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
  const { have } = await twinCounts(plan.level);
  const has = plan.subgroups.reduce((m, s) => Math.max(m, have.get(s.id) ?? 0), 0);
  if (has >= TWINS_PER_SKILL) return fail('need', [`sub-skill "${primary.name}" already has ${has} twins (target ${TWINS_PER_SKILL}) — take the next seed`], 409);
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
const poolLevels = (key: SciKey, combined: boolean) => (combined ? [SCI[key].cs, `${SCI[key].cs}_NA`] : [SCI[key].bank]);
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

/** sci-twin.mjs eligible(): the student-side serving filters (checked rows only). */
function eligible(q: any, subject: string) {
  return q.eq('subject', subject)
    .or('quarantined.is.null,quarantined.eq.false')
    .or('ai_generated.is.null,ai_generated.eq.false,verified.eq.true')
    .or('has_image.is.null,has_image.eq.false,image_watermark_status.eq.clean')
    .or('solution.neq.,answer.neq.')
    .or('not_in_syllabus.is.null,not_in_syllabus.eq.false')
    .not('school', 'ilike', 'gce')
    .eq('practice_hidden', false)
    .not('question_text', 'is', null)
    .neq('question_text', '')
    .not('practice_checked_at', 'is', null)
    .filter('answer', 'match', '^\\s*([A-Da-d]\\s*$|[*][*][(]?[A-D][)]?[*][*])');
}

async function challengeCount(p: { key: SciKey; combined: boolean; topic: string }): Promise<number> {
  const s = SCI[p.key];
  const { count, error } = await eligible(getScienceClient().from('questions').select('id, practice_difficulty!inner(level, source)', { count: 'exact', head: true }), s.subject)
    .in('level', poolLevels(p.key, p.combined)).contains('topics', [p.topic])
    .eq('practice_difficulty.level', 'challenge').in('practice_difficulty.source', ['results', 'estimate', 'twin']);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function scienceGap() {
  const pools = openTopics();
  const out = await Promise.all(pools.map(async (p) => { const n = await challengeCount(p); return { ...p, challenge: n, gap: Math.max(0, SCI_TARGET - n) }; }));
  return out;
}

type SciSeedRow = { source_id: string; pool: string; key: SciKey; combined: boolean; topic: string; bank_level: string; subgroup_id: number | null; has_image: boolean; seed_level: 'challenge' | 'exam'; skill: string | null; gap: number };

async function seedsFor(p: OpenPool & { gap: number }): Promise<SciSeedRow[]> {
  const s = SCI[p.key];
  const sb = getScienceClient();
  const rows = await pageAll((a, b) => eligible(sb.from('questions').select('id, level, school, has_image, skill, question_text, practice_difficulty!inner(level, source)'), s.subject)
    .in('level', poolLevels(p.key, p.combined)).contains('topics', [p.topic])
    .in('practice_difficulty.level', ['challenge', 'exam']).in('practice_difficulty.source', ['results', 'estimate'])
    .neq('school', TWIN_SCHOOL).order('id').range(a, b));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const twinned = new Set<string>(); const filing = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: t } = await sb.from('questions').select('twin_of').in('twin_of', chunk);
    for (const r of (t ?? []) as any[]) twinned.add(r.twin_of);
    const { data: f } = await sb.from('question_subgroups').select('question_id, subgroup_id, is_primary').in('question_id', chunk);
    for (const r of (f ?? []) as any[]) if (r.is_primary || !filing.has(r.question_id)) filing.set(r.question_id, Number(r.subgroup_id));
  }
  const lvl = (r: any): 'challenge' | 'exam' => ((r.practice_difficulty?.level ?? r.practice_difficulty?.[0]?.level) === 'challenge' ? 'challenge' : 'exam');
  const list: SciSeedRow[] = rows
    .filter((r) => !twinned.has(r.id) && String(r.question_text ?? '').length > 40)
    .map((r) => ({ source_id: r.id, pool: p.pool, key: p.key, combined: p.combined, topic: p.topic, bank_level: r.level, subgroup_id: filing.get(r.id) ?? null, has_image: !!r.has_image, seed_level: lvl(r), skill: r.skill ?? null, gap: p.gap }))
    .sort((a, b) => (a.seed_level === b.seed_level ? 0 : a.seed_level === 'challenge' ? -1 : 1) || (Number(a.has_image) - Number(b.has_image)) || a.source_id.localeCompare(b.source_id));
  return spreadBySubgroup(list).slice(0, p.gap);
}

async function sciSeedAndPlan(id: string, topicHint: string | null, poolHint: string | null) {
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
  const { data: f } = await sb.from('question_subgroups').select('subgroup_id, is_primary').eq('question_id', id);
  const sgIds = (f ?? []).map((r: any) => Number(r.subgroup_id));
  const { data: sgs } = sgIds.length ? await sb.from('subgroups').select('id, name, description').in('id', sgIds) : { data: [] as any[] };
  const subgroups = (sgs ?? []).map((s: any) => ({ id: Number(s.id), name: s.name ?? null, description: s.description ?? null, is_primary: !!(f ?? []).find((r: any) => Number(r.subgroup_id) === Number(s.id))?.is_primary }));
  const plan: SciPlan & { pool: string; bank_level: string; subject: string; open: boolean } = {
    key: pp.key, combined: pp.combined, topic, skill: src.skill ?? null, subgroups, seed_level: (pd as any)?.level ?? null, seed_reason: (pd as any)?.reason ?? null,
    seed_has_image: !!src.has_image, pool: poolName(pp.key, pp.combined), bank_level: src.level, subject: src.subject, open: open.includes(topic),
  };
  return { src: src as any, plan, sgIds };
}

async function sciCorpus(subject: string, topic: string, excludeId: string): Promise<(CorpusRow & { ours: boolean })[]> {
  const sb = getScienceClient();
  const rows = await pageAll((a, b) => sb.from('questions').select('id, level, school, year, question_text').eq('subject', subject).contains('topics', [topic]).neq('id', excludeId).order('id').range(a, b));
  return rows.map((r) => ({ id: r.id, ref: r.school === TWIN_SCHOOL ? `our twin ${String(r.id).slice(0, 8)}` : `${r.level} ${r.school ?? ''} ${r.year ?? ''}`.trim(), text: String(r.question_text ?? ''), ours: r.school === TWIN_SCHOOL }));
}

async function sciPacket(row: SciSeedRow) {
  const sp = await sciSeedAndPlan(row.source_id, row.topic, row.pool);
  if (!sp) return null;
  const { src, plan, sgIds } = sp;
  const sb = getScienceClient();
  let siblings: { question_text: string | null }[] = [];
  if (sgIds.length) {
    const { data: fs } = await sb.from('question_subgroups').select('question_id').in('subgroup_id', sgIds).neq('question_id', src.id).limit(40);
    const sids = (fs ?? []).map((r: any) => r.question_id);
    if (sids.length) {
      const { data: sr } = await sb.from('questions').select('id, question_text, school, practice_difficulty(level)').in('id', sids).in('level', poolLevels(plan.key, plan.combined)).limit(40);
      siblings = ((sr ?? []) as any[]).filter((r) => r.school !== TWIN_SCHOOL && (r.practice_difficulty?.level === 'challenge' || r.practice_difficulty?.[0]?.level === 'challenge')).slice(0, 3);
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
    seed_id: src.id, pool: plan.pool, topic: plan.topic, topic_gap: row.gap,
    subskill: primary ? { id: primary.id, name: primary.name, description: primary.description ?? null } : (plan.skill ? { id: null, name: plan.skill, description: null } : null),
    seed: { question_text: src.question_text, answer: keyOf(src.answer) ?? src.answer, solution: src.solution, level: plan.seed_level, has_figure: !!src.has_image },
    earlier_twins: avoid.filter((a) => a.ref === 'our earlier twin'),
    near_neighbours: avoid.filter((a) => a.ref !== 'our earlier twin').map((a) => ({ text: a.text.slice(0, 1200) })),
    models: { author: 'opus', blind: 'opus', checker: 'opus' },
    author_brief: scienceAuthorBrief(src, plan, siblings, avoid),
  };
}

export async function scienceQueue(n: number, opts: { pool?: string | null; textOnly?: boolean } = {}) {
  const gaps = (await scienceGap()).filter((g) => g.gap > 0 && (!opts.pool || g.pool === opts.pool)).sort((a, b) => b.gap - a.gap);
  const lists: SciSeedRow[][] = [];
  for (const g of gaps) {
    let s = await seedsFor(g);
    if (opts.textOnly) s = s.filter((x) => !x.has_image);
    lists.push(s);
    // enough to interleave (one topic per seed where the gaps allow); a lambda need not walk every topic
    if (lists.filter((l) => l.length).length >= n && lists.reduce((a, l) => a + l.length, 0) >= n) break;
  }
  const picked = interleaveTopics(lists, n);
  const items = (await Promise.all(picked.map((r) => sciPacket(r).catch((e) => ({ error: (e as Error).message, seed_id: r.source_id }))))).filter(Boolean);
  return { bank: 'science', target: SCI_TARGET, gaps: gaps.map((g) => ({ pool: g.pool, topic: g.topic, challenge: g.challenge, gap: g.gap })), total_gap: gaps.reduce((a, g) => a + g.gap, 0), items };
}

export async function submitScience(body: SubmitBody, hints: { topic?: string | null; pool?: string | null } = {}): Promise<SubmitOutcome> {
  const q = { ...body.sci! };
  if (q.answer) q.answer = String(q.answer).trim().toUpperCase();
  const sp = await sciSeedAndPlan(body.seed_id, hints.topic ?? null, hints.pool ?? null);
  if (!sp) return fail('seed', ['no question with that seed_id in the science bank'], 404);
  const { src, plan } = sp;
  // (11k science rows from real papers carry ai_generated=true for their written solutions — not ours)
  if (src.twin_of || src.school === TWIN_SCHOOL || src.exam_type === TWIN_EXAM_TYPE) return fail('seed', ['the seed must be a school question, not one of ours'], 400);
  if (!plan.open) return fail('seed', [`topic "${plan.topic}" is not an open practice topic in ${plan.pool} — twins are written only for open topics`], 400);
  const item = `sci-twin-${src.id}`;
  const sb = getScienceClient();
  const dup = await existingTwin(sb, src.id, item, 'science');
  if (dup) return fail('duplicate', [`this seed already has a twin (${dup}) — take the next seed from the queue`], 409);
  const n = await challengeCount({ key: plan.key, combined: plan.combined, topic: plan.topic });
  if (n >= SCI_TARGET) return fail('need', [`${plan.pool} · ${plan.topic} already has ${n} servable Challenge MCQs (target ${SCI_TARGET}) — take the next seed`], 409);
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
  const imagePath = fig ? `twins/${src.id}.png` : null;
  if (fig && imagePath) {
    const { error } = await sb.storage.from(SCI_FIG_BUCKET).upload(imagePath, fig.png, { contentType: 'image/png', upsert: true });
    if (error) return fail('figure', [`figure upload: ${error.message}`], 500, gates);
  }
  const now = new Date().toISOString();
  const row = {
    level: plan.bank_level, subject: plan.subject, school: TWIN_SCHOOL, year: new Date().getFullYear(), exam_type: TWIN_EXAM_TYPE,
    paper: null, question_number: null,
    question_text: sciQuestionText(q), parts: null, answer: q.answer, solution: q.solution, solution_source: 'opus_session',
    topics: [plan.topic], skill: plan.skill ?? null, difficulty: 'Challenging', total_marks: 1,
    has_image: !!imagePath, image_url: imagePath, images: [], image_size: 'md',
    // a drawn figure still waits for the science figure check (bot figfit, FIGFIT_BANK=science) to stamp 'clean'
    image_watermark_status: null,
    verified: true, ai_generated: true, twin_of: src.id, source_question_id: null,
    quarantined: false, not_in_syllabus: false, practice_hidden: false,
    practice_checked_at: now, practice_check_note: 'twin: every check passed (gates, blind solve, checker) — cloud session',
    gen_meta: {
      kind: 'science-twin', twin_item: item, twin_of: src.id, prompt_version: SCI_PROMPT, written_by: 'cloud-session', pool: plan.pool, level_written: 'challenge',
      source_ref: { school: src.school, year: src.year, paper: src.paper ?? null, question_number: src.question_number ?? null },
      models: { author: 'opus (cloud Claude Code agent)', blind: 'opus (fresh cloud agent)', checker: 'opus (fresh cloud agent)' },
      gates: { novelty: gates.novelty, rounds: 1, server_checked: true },
      blind: { answer: String(letter).trim().toUpperCase(), confidence: (blind as any).confidence ?? null, other_defensible: (blind as any).other_defensible ?? [] },
      verdict: { work_score: verdict.work_score, score: verdict.score, why: verdict.why ?? null },
      distractors: q.distractors ?? null, why_challenge: q.why_challenge ?? null, originality_note: q.originality_note ?? null, notes: body.gate.notes,
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
    question_id: qid, level: 'challenge', source: 'twin', attempts: 0, wrong: 0, wrong_share: null,
    work_score: verdict.work_score, test_solve: null, reason: `Our own Challenge question; ${String(q.why_challenge ?? verdict.why ?? '').slice(0, 200)}`,
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
