// 🧩 Weekly stretch set — the reads and writes (SPEC-STRETCH-SET.md). The
// judgement calls live in lib/stretch-set.ts (pure, tested).
//
// Every bank question comes through the SAME serving doors the practice flow
// uses: practice_next (one topic, a tier) or practice_pool (is this id servable
// to this student?), then lib/part-syllabus studentRow. So the set can never
// hold a deleted / flag-buried / unverified-AI / off-syllabus question, and the
// Challenge pilot rows reach a student only once Adrian has approved them
// (approval sets verified = true).
//
// Supabase data transfer (the org is near its quota): the set is built ONCE per
// student-week and stored; every read selects small columns; question text is
// fetched only for the 3 ids on screen.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PortalAccount } from '@/lib/portal-auth';
import { portalIdentity } from '@/lib/portal-auth';
import { rpcAudience, studentMathLevels } from '@/lib/practice';
import { bankScope } from '@/lib/qb-levels';
import { practiceQLevels } from '@/lib/serve-gate';
import { studentRow } from '@/lib/part-syllabus';
import { sgtTodayISO } from '@/lib/sgt';
import { loadStudent, loggedLessons } from '@/lib/next-lesson-store';
import { questionMarkdown, questionStructured, totalMarksOf, type BankQuestion } from '@/lib/bank-question-markdown';
import {
  COSTUME_KIND, RECENT_DAYS, answerText, estimateSlotFor, kindLabel, olderTopics, pickSpotForSet, recentTopics, seededIndex,
  slotResult, topErrorKinds, topicHistory, weekStartISO,
  type AttemptLite, type SlotResponse, type SlotResult, type SpotUnitLite, type StretchGap, type StretchItem, type StretchSlot, type TopicEvent,
} from '@/lib/stretch-set';

export const STRETCH_TABLE = 'stretch_sets';
const ROW_COLUMNS = 'id, airtable_student_id, week_start, level, items, gaps, responses, built_by, built_at';

export interface StretchRow {
  id: string;
  airtable_student_id: string;
  week_start: string;
  level: string;
  items: StretchItem[];
  gaps: StretchGap[];
  responses: Record<string, SlotResponse>;
  built_by: string;
  built_at: string;
}

/** portal_accounts columns the builder needs (no heavy ones). */
export const ACCOUNT_COLUMNS = 'id, airtable_student_id, email, display_name, level, subjects, telegram_chat_id, prefs, created_at, last_seen_at, deactivated_at, is_ip';

/** The level a student's set is built at: A Math before E Math (an A Math student sits both; A Math stretches more). */
const LEVEL_PREFERENCE = ['AM', 'S3_AM', 'EM', 'S3_EM', 'JC2', 'JC1', 'S2', 'S1'];
export function setLevelFor(account: PortalAccount): string | null {
  const keys = studentMathLevels(account).map(l => l.key);
  return LEVEL_PREFERENCE.find(k => keys.includes(k)) ?? keys[0] ?? null;
}

export function thisWeek(today = sgtTodayISO()): string { return weekStartISO(today); }

export async function loadSet(sb: SupabaseClient, identity: string, week: string): Promise<StretchRow | null> {
  const { data, error } = await sb.from(STRETCH_TABLE).select(ROW_COLUMNS).eq('airtable_student_id', identity).eq('week_start', week).maybeSingle();
  if (error) throw new Error(`stretch_sets read failed: ${error.message}`);
  return (data as StretchRow | null) ?? null;
}

// ── what the student has met ─────────────────────────────────────────────────

type MistakeLite = { topic: string | null; error_kind: string | null; state: string; seen_count: number | null; created_at: string; last_seen_at: string | null };

async function gatherHistory(sb: SupabaseClient, account: PortalAccount, identity: string) {
  const events: TopicEvent[] = [];
  const notes: string[] = [];

  // Lessons (Airtable, tuition students only): the best record of what was taught when.
  if (identity.startsWith('rec')) {
    try {
      const student = await loadStudent(identity);
      if (student) for (const l of await loggedLessons(student)) for (const t of l.topics) events.push({ topic: t, date: l.date, source: 'lesson' });
    } catch (e) { notes.push(`lesson log not read (${(e as Error).message.slice(0, 80)})`); }
  }

  // Notebook mistakes: topics with lost marks, and the kinds of mistake.
  const { data: mRows } = await sb.from('notebook_mistakes')
    .select('topic, error_kind, state, seen_count, created_at, last_seen_at')
    .eq('airtable_student_id', identity).is('removed_at', null)
    .order('last_seen_at', { ascending: false, nullsFirst: false }).limit(300);
  const mistakes = (mRows ?? []) as MistakeLite[];
  for (const m of mistakes) {
    if (!m.topic) continue;
    const open = m.state !== 'fixed';
    events.push({ topic: m.topic, date: m.created_at, source: 'mistake', open, weight: m.seen_count ?? 1 });
    if (m.last_seen_at) events.push({ topic: m.topic, date: m.last_seen_at, source: 'mistake', open: false, weight: 0 });
  }

  // Practice attempts (last ~6 months): ids to skip + the topics they were on.
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const { data: aRows } = await sb.from('student_attempts')
    .select('question_id, attempted_at')
    .or(`user_id.eq.${account.id},airtable_student_id.eq."${identity}"`)
    .not('question_id', 'is', null).gte('attempted_at', since)
    .order('attempted_at', { ascending: false }).limit(400);
  const attempts = (aRows ?? []) as { question_id: string; attempted_at: string }[];
  const attempted = [...new Set(attempts.map(a => a.question_id))];
  const lastBy = new Map<string, string>();
  for (const a of attempts) if (!lastBy.has(a.question_id)) lastBy.set(a.question_id, a.attempted_at);
  for (let i = 0; i < attempted.length; i += 150) {
    const { data: qRows } = await sb.from('questions').select('id, topics').in('id', attempted.slice(i, i + 150));
    for (const q of (qRows ?? []) as { id: string; topics: unknown }[]) {
      const date = lastBy.get(q.id);
      if (!date || !Array.isArray(q.topics)) continue;
      for (const t of q.topics) if (typeof t === 'string') events.push({ topic: t, date, source: 'attempt' });
    }
  }
  return { events, mistakes, attempted, notes };
}

// ── drawing questions through the serving doors ──────────────────────────────

export type Ctx = { sb: SupabaseClient; levelKey: string; account: PortalAccount; exclude: string[] };

export async function nextOnTopic(ctx: Ctx, topic: string, tier: string | null): Promise<string | null> {
  const scope = bankScope(ctx.levelKey);
  for (let guard = 0; guard < 3; guard++) {
    const { data, error } = await ctx.sb.rpc('practice_next', {
      p_level: scope.level, p_qlevel: scope.qlevel, p_topic: topic, p_exclude: ctx.exclude, p_tier: tier, p_subgroup: null,
      ...rpcAudience({ kind: 'student', account: ctx.account }),
    });
    if (error) throw new Error(`practice_next: ${error.message}`);
    const raw = (data?.[0] ?? null) as ({ id: string } & Record<string, unknown>) | null;
    if (!raw) return null;
    ctx.exclude.push(raw.id);
    if (studentRow(raw)) return raw.id;
  }
  return null;
}

/** Of these ids, the ones practice_pool would serve this student, with their topic. */
async function servable(ctx: Ctx, ids: string[]): Promise<{ id: string; topic: string }[]> {
  if (!ids.length) return [];
  const scope = bankScope(ctx.levelKey);
  const aud = rpcAudience({ kind: 'student', account: ctx.account });
  const out: { id: string; topic: string }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await ctx.sb.rpc('practice_pool', { p_level: scope.level, p_topic: null, p_is_ip: aud.p_is_ip, p_admin: false, p_ip_content: aud.p_ip_content })
      .select('topic, question_id').in('question_id', ids.slice(i, i + 150));
    if (error) throw new Error(`practice_pool: ${error.message}`);
    for (const r of (data ?? []) as { topic: string; question_id: string }[]) out.push({ id: r.question_id, topic: r.topic });
  }
  return out;
}

/** The part-marks door for a chosen id (lib/part-syllabus) — one small read. */
async function partsOk(sb: SupabaseClient, id: string): Promise<boolean> {
  const { data } = await sb.from('questions').select('id, parts, total_marks').eq('id', id).maybeSingle();
  return !!data && !!studentRow(data);
}

async function pickFrom(ctx: Ctx, candidates: { id: string; topic: string }[], topicOrder: string[], seed: string): Promise<{ id: string; topic: string } | null> {
  const fresh = candidates.filter(c => !ctx.exclude.includes(c.id));
  const rank = (t: string) => { const i = topicOrder.indexOf(t); return i < 0 ? topicOrder.length : i; };
  const sorted = [...fresh].sort((a, b) => rank(a.topic) - rank(b.topic) || a.id.localeCompare(b.id));
  // Same best rank → a seeded choice, so two students on one topic do not get one question.
  const best = sorted.length ? rank(sorted[0].topic) : 0;
  const top = sorted.filter(c => rank(c.topic) === best);
  const ordered = [...top.slice(seededIndex(seed, top.length)), ...top.slice(0, seededIndex(seed, top.length)), ...sorted.filter(c => rank(c.topic) !== best)];
  for (const c of ordered.slice(0, 6)) {
    if (await partsOk(ctx.sb, c.id)) { ctx.exclude.push(c.id); return c; }
    ctx.exclude.push(c.id);
  }
  return null;
}

// ── build ───────────────────────────────────────────────────────────────────

export interface BuildOutcome { row: StretchRow; built: boolean }

/**
 * This week's set for the student: the stored one, or a new one built now.
 * `rebuild` (Adrian's preview only) replaces a set the student has not touched.
 */
export async function loadOrBuildSet(
  sb: SupabaseClient, account: PortalAccount,
  opts: { builtBy: 'student' | 'admin'; rebuild?: boolean; today?: string } = { builtBy: 'student' },
): Promise<BuildOutcome | null> {
  const identity = portalIdentity(account);
  const today = opts.today ?? sgtTodayISO();
  const week = weekStartISO(today);
  const existing = await loadSet(sb, identity, week);
  if (existing && !(opts.rebuild && Object.keys(existing.responses ?? {}).length === 0)) return { row: existing, built: false };

  const levelKey = setLevelFor(account);
  if (!levelKey) return null;
  const scope = bankScope(levelKey);
  const seed = `${identity}|${week}`;
  const { data: tRows, error: tErr } = await sb.rpc('practice_topics', { p_level: scope.level, p_qlevel: scope.qlevel, ...rpcAudience({ kind: 'student', account }) });
  if (tErr) throw new Error(`practice_topics: ${tErr.message}`);
  const bankTopics = ((tRows ?? []) as { topic: string }[]).map(r => r.topic).filter(Boolean);

  const { events, mistakes, attempted, notes } = await gatherHistory(sb, account, identity);
  const hist = topicHistory(events, bankTopics);
  const recent = recentTopics(hist, today);
  const older = olderTopics(hist, today);
  const met = hist.map(h => h.topic);

  // Never repeat an item from the student's last 8 sets.
  const { data: prev } = await sb.from(STRETCH_TABLE).select('week_start, items').eq('airtable_student_id', identity).neq('week_start', week)
    .order('week_start', { ascending: false }).limit(8);
  const usedQ = new Set<string>(); const usedU = new Set<string>();
  for (const p of (prev ?? []) as { items: StretchItem[] }[]) for (const it of p.items ?? []) { if (it.questionId) usedQ.add(it.questionId); if (it.unitId) usedU.add(it.unitId); }

  const ctx: Ctx = { sb, levelKey, account, exclude: [...new Set([...attempted, ...usedQ])] };
  const items: StretchItem[] = [];
  const gaps: StretchGap[] = notes.map(n => ({ slot: 'older' as StretchSlot, note: n }));
  const taken = new Set<string>();
  const qLevels = [...new Set([...practiceQLevels(scope.level), ...(scope.qlevel ? [scope.qlevel] : [])])];
  const randomTopics = [...bankTopics].sort((a, b) => seededIndex(`${seed}|${a}`, 1000) - seededIndex(`${seed}|${b}`, 1000));

  // 1 · costume — an approved new-costume question on a recent topic, else a fresh recent-topic question.
  {
    const { data: cRows } = await sb.from('questions').select('id')
      .eq('ai_generated', true).eq('verified', true).is('deleted_at', null)
      .eq('gen_meta->>kind', COSTUME_KIND).in('level', qLevels).limit(300);
    const cands = await servable(ctx, ((cRows ?? []) as { id: string }[]).map(r => r.id));
    const order = recent.length ? recent : met;
    const hit = await pickFrom(ctx, cands.filter(c => order.includes(c.topic)), order, `${seed}|costume`);
    if (hit) {
      items.push({ slot: 'costume', source: 'costume', questionId: hit.id, topic: hit.topic, why: `New-costume question on ${hit.topic} (${recent.includes(hit.topic) ? 'met in the last 3 weeks' : 'met before'})` });
      taken.add(hit.topic);
    } else {
      let got: { id: string; topic: string } | null = null;
      for (const t of (recent.length ? recent : randomTopics).slice(0, 4)) { const id = await nextOnTopic(ctx, t, null); if (id) { got = { id, topic: t }; break; } }
      if (got) {
        items.push({ slot: 'costume', source: recent.length ? 'recent' : 'any-topic', questionId: got.id, topic: got.topic, why: recent.length ? `No approved new-costume question yet on a recent topic — a fresh question on ${got.topic} (met in the last 3 weeks)` : `No topic met in the last 3 weeks on record — a fresh question on ${got.topic}` });
        taken.add(got.topic);
      }
      gaps.push({ slot: 'costume', note: cands.length ? `approved new-costume questions exist (${cands.length}) but none on this student's recent topics` : 'no approved new-costume questions at this level yet' });
      if (!recent.length) gaps.push({ slot: 'costume', note: `no topic met in the last ${RECENT_DAYS} days on record` });
    }
  }

  // 3 · older (picked before the stretch slot so the stretch avoids its topic).
  let olderItem: StretchItem | null = null;
  {
    const order = older.map(h => h.topic).filter(t => !taken.has(t));
    let got: { id: string; topic: string; mistake: boolean } | null = null;
    for (const t of order.slice(0, 4)) {
      const id = await nextOnTopic(ctx, t, null);
      if (id) { got = { id, topic: t, mistake: (older.find(h => h.topic === t)?.openMistakes ?? 0) + (older.find(h => h.topic === t)?.mistakes ?? 0) > 0 }; break; }
    }
    if (got) {
      const h = older.find(x => x.topic === got!.topic)!;
      olderItem = { slot: 'older', source: got.mistake ? 'older-mistake' : 'older', questionId: got.id, topic: got.topic, why: `${got.topic}: first met ${h.first}, last met ${h.last}${got.mistake ? `, marks lost there (${h.mistakes})` : ''}` };
    } else {
      gaps.push({ slot: 'older', note: older.length ? 'older topics found but no unseen question on them' : 'no topic met 3+ weeks ago on record' });
      for (const t of randomTopics.filter(x => !taken.has(x) && !recent.includes(x)).slice(0, 4)) {
        const id = await nextOnTopic(ctx, t, null);
        if (id) { olderItem = { slot: 'older', source: 'any-topic', questionId: id, topic: t, why: `No older topic on record — a mixed question on ${t}` }; break; }
      }
    }
    if (olderItem?.topic) taken.add(olderItem.topic);
  }

  // 2 · stretch — an approved Challenge question (real or the approved pilot rows), else Advanced.
  {
    const { data: chRows } = await sb.from('questions').select('id')
      .eq('difficulty', 'Challenging').is('deleted_at', null).in('level', qLevels).limit(500);
    const cands = await servable(ctx, ((chRows ?? []) as { id: string }[]).map(r => r.id));
    const order = [...met.filter(t => !taken.has(t)), ...met.filter(t => taken.has(t))];
    const hit = await pickFrom(ctx, cands, order, `${seed}|stretch`);
    if (hit) {
      items.push({ slot: 'stretch', source: 'challenge', questionId: hit.id, topic: hit.topic, remind: true, why: `Challenge question on ${hit.topic}${met.includes(hit.topic) ? '' : ' (a topic not on record for this student)'}` });
    } else {
      let got: { id: string; topic: string } | null = null;
      for (const t of [...order, ...randomTopics.filter(x => !met.includes(x))].slice(0, 5)) { const id = await nextOnTopic(ctx, t, 'Advanced'); if (id) { got = { id, topic: t }; break; } }
      if (got) items.push({ slot: 'stretch', source: 'advanced', questionId: got.id, topic: got.topic, remind: true, why: `No unseen approved Challenge question — an Advanced one on ${got.topic}` });
      gaps.push({ slot: 'stretch', note: cands.length ? `all ${cands.length} approved Challenge questions at this level already seen` : 'no approved Challenge questions at this level' });
    }
  }
  if (olderItem) items.push(olderItem);

  // 4 · spot the mistake — an approved card, the student's own frequent kind first.
  {
    const { data: uRows } = await sb.from('learning_units')
      .select('id, subject, topic, error_kind:payload->>error_kind, origin:payload->>origin')
      .eq('kind', 'autopsy').eq('status', 'approved').limit(500);
    const kinds = topErrorKinds(mistakes);
    const pick = pickSpotForSet(levelKey, (uRows ?? []) as SpotUnitLite[], { kinds, metTopics: met, used: usedU, seed: `${seed}|spot` });
    if (pick) {
      items.push({ slot: 'spot', source: pick.kindMatch ? 'spot-kind' : 'spot', unitId: pick.unit.id, topic: pick.unit.topic, why: pick.kindMatch ? `Same kind as this student's own mistakes (${kindLabel(pick.unit.error_kind)}) · ${pick.unit.topic}` : `Spot card on ${pick.unit.topic}${kinds.length ? ` — none approved yet for their kind (${kindLabel(kinds[0])})` : ''}` });
      if (!pick.kindMatch && kinds.length) gaps.push({ slot: 'spot', note: `no approved card of this student's most frequent kind (${kindLabel(kinds[0])})` });
    } else {
      gaps.push({ slot: 'spot', note: 'no approved spot-the-mistake card at this level yet' });
    }
  }

  // 5 · estimate first — rotates over the question slots.
  const est = estimateSlotFor(week, items.map(i => i.slot));
  for (const it of items) if (it.slot === est) it.estimate = true;

  const row = {
    airtable_student_id: identity, week_start: week, level: levelKey, items, gaps,
    responses: {}, built_by: opts.builtBy, built_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const { data: saved, error } = await sb.from(STRETCH_TABLE).upsert(row, { onConflict: 'airtable_student_id,week_start' }).select(ROW_COLUMNS).single();
  if (error) throw new Error(`stretch_sets write failed: ${error.message}`);
  return { row: saved as StretchRow, built: true };
}

// ── read back for the page ───────────────────────────────────────────────────

export interface ViewItem extends StretchItem {
  question?: Record<string, unknown> | null;
  unit?: { payload: unknown } | null;
  result: SlotResult;
  response: SlotResponse;
}

/** The set as the page shows it: question rows for the ids on screen, the spot card, and results so far. */
export async function viewSet(sb: SupabaseClient, account: PortalAccount, row: StretchRow): Promise<ViewItem[]> {
  const identity = portalIdentity(account);
  const qIds = row.items.map(i => i.questionId).filter((x): x is string => !!x);
  const uIds = row.items.map(i => i.unitId).filter((x): x is string => !!x);
  const [qs, us, att] = await Promise.all([
    qIds.length ? sb.from('questions').select('id, question_text, parts, total_marks, figure_url, image_url, images, answer').in('id', qIds) : Promise.resolve({ data: [] }),
    uIds.length ? sb.from('learning_units').select('id, status, payload').in('id', uIds).eq('status', 'approved') : Promise.resolve({ data: [] }),
    qIds.length ? sb.from('student_attempts')
      .select('question_id, attempted_at, marking_verdict, score:marking_json->>score, out_of:marking_json->>outOf, revealed:marking_json->ladder->>revealed')
      .or(`user_id.eq.${account.id},airtable_student_id.eq."${identity}"`).in('question_id', qIds).gte('attempted_at', row.built_at)
      : Promise.resolve({ data: [] }),
  ]);
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
  const attempts: AttemptLite[] = ((att.data ?? []) as Record<string, unknown>[]).map(a => ({
    questionId: String(a.question_id), attemptedAt: String(a.attempted_at), verdict: (a.marking_verdict as string) ?? null,
    score: num(a.score), outOf: num(a.out_of), helpSteps: num(a.revealed) ?? 0,
  }));
  const qById = new Map(((qs.data ?? []) as Record<string, unknown>[]).map(q => [String(q.id), q]));
  const uById = new Map(((us.data ?? []) as { id: string; payload: unknown }[]).map(u => [u.id, u]));
  return row.items.map(it => ({
    ...it,
    question: it.questionId ? (qById.has(it.questionId) ? studentRow(qById.get(it.questionId)!) : null) : undefined,
    unit: it.unitId ? (uById.get(it.unitId) ? { payload: uById.get(it.unitId)!.payload } : null) : undefined,
    result: slotResult(it.questionId, attempts),
    response: row.responses?.[it.slot] ?? {},
  }));
}

export async function saveResponse(sb: SupabaseClient, row: StretchRow, slot: StretchSlot, next: SlotResponse): Promise<void> {
  const responses = { ...(row.responses ?? {}), [slot]: next };
  const { error } = await sb.from(STRETCH_TABLE).update({ responses, updated_at: new Date().toISOString() }).eq('id', row.id).eq('airtable_student_id', row.airtable_student_id);
  if (error) throw new Error(`stretch_sets update failed: ${error.message}`);
}

/** Admin: every set built this week (small columns) — the gaps list on /admin/stretch. */
export async function weekSets(sb: SupabaseClient, week: string): Promise<Pick<StretchRow, 'airtable_student_id' | 'level' | 'items' | 'gaps' | 'responses' | 'built_by' | 'built_at'>[]> {
  const { data, error } = await sb.from(STRETCH_TABLE).select('airtable_student_id, level, items, gaps, responses, built_by, built_at').eq('week_start', week).limit(500);
  if (error) throw new Error(`stretch_sets read failed: ${error.message}`);
  return (data ?? []) as Pick<StretchRow, 'airtable_student_id' | 'level' | 'items' | 'gaps' | 'responses' | 'built_by' | 'built_at'>[];
}

// ── what reaches the screen ──────────────────────────────────────────────────

export interface ScreenItem {
  slot: StretchSlot;
  source: string;
  topic: string | null;
  /** Adrian's preview only. */
  why?: string;
  estimate: boolean;
  remind: boolean;
  questionId: string | null;
  markdown: string | null;
  marks: number | null;
  /** The bank answer — only once the student has tried it (or in Adrian's preview). */
  answer: string | null;
  unitPayload: unknown | null;
  result: SlotResult;
  response: SlotResponse;
  /** The item can no longer be served (removed / changed since the set was built). */
  missing: boolean;
}

export function toScreen(view: ViewItem[], preview: boolean): ScreenItem[] {
  return view.map(v => {
    const q = v.question ?? null;
    const markdown = q ? questionMarkdown(q as BankQuestion) : null;
    const marks = q ? ((q.total_marks as number | null) ?? totalMarksOf(questionStructured(q as BankQuestion).parts)) : null;
    return {
      slot: v.slot, source: v.source, topic: v.topic, ...(preview ? { why: v.why } : {}),
      estimate: !!v.estimate, remind: !!v.remind,
      questionId: v.questionId ?? null, markdown, marks,
      answer: q && (preview || v.result.tried) ? answerText(q) || null : null,
      unitPayload: v.unit?.payload ?? null,
      result: v.result, response: v.response,
      missing: v.questionId ? !q : v.unitId ? !v.unit : true,
    };
  });
}
