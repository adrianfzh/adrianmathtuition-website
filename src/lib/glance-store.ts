// Reads the facts the admin dashboard shows (lib/glance.ts turns them into
// tiles). Server-only. Counts and a few short columns — never whole rows.
// Every read is fail-soft: one source down gives that tile "No reading", the
// rest of the board still paints.

import { getSupabaseAdmin } from '@/lib/supabase';
import { airtableRequestAll } from '@/lib/airtable';
import { latestJobRuns, type JobRunRow } from '@/lib/job-log';
import { JOB_RHYTHMS, staleJobs } from '@/lib/job-health';
import { markingQueueState, type QueueRunRow } from '@/lib/marking-queue-state';
import { extractFlagged } from '@/lib/mark-triage';
import { lessonsBetween } from '@/lib/next-lesson-store';
import { getSlotAccounts, getSlotUsage } from '@/lib/slot-accounts-store';
import { slotAccountRows } from '@/lib/slot-accounts';
import { summariseTabViews, tabStudents7d, type ActivityEvent } from '@/lib/portal-activity';
import { TAB_VIEW_KIND } from '@/lib/portal-tabs';
import { costEntries, type CostRunRow } from '@/lib/costs';
import { addDaysISO, sgtDayStartISO, sgtTodayISO, sgtDaysAgoISO } from '@/lib/sgt';
import { localToday, daysAgo, EDIT_WINDOW_DAYS } from '@/lib/schedule-helpers';
import { isScience, type StuckSubject } from '@/lib/stuck-topics';
import { TWINS_PER_SKILL, mathGapSummary, type MathTwinUnit } from '@/lib/twin-gates';
import { perDay, sumPerDay, type GlanceFacts, type JobLine, type LessonLink } from '@/lib/glance';
import { countHandins, countPractice, type HandinRow, type PracticeRow } from '@/lib/dash-counts';

const BOT_HEALTH_URL = 'https://adrianmath-telegram-math-bot.fly.dev/health';
/** The levels the twins lanes write for (as scripts/ops-status.mjs counts them). */
const TWIN_LEVELS = ['S1', 'S2'];
const TREND_DAYS = 7;
/** How many of the things themselves a tile's list carries (the page shows fewer and says "+N more"). */
const LIST_ROWS = 8;
/** The worker's self-fix stamps (docs/OPS.md §The worker's self-fixes). */
const SELF_FIX_JOBS = ['worker-recover', 'login-pool', 'disk-clean'];

type Sb = ReturnType<typeof getSupabaseAdmin>;

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch (e) { console.error('[glance]', (e as Error).message); return null; }
}

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: n, error } = await q;
  if (error) throw new Error(error.message);
  return n ?? 0;
}

/** Every row of a PostgREST select, past the 1000-row cap. */
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function lastJob(sb: Sb, job: string): Promise<(JobLine & { meta?: Record<string, unknown> | null }) | null> {
  const { data } = await sb.from('job_runs').select('ok, ran_at, summary, meta').eq('job', job).order('ran_at', { ascending: false }).limit(1);
  const r = data?.[0] as { ok: boolean; ran_at: string; summary: string | null; meta: Record<string, unknown> | null } | undefined;
  return r ? { ok: r.ok, at: r.ran_at, summary: r.summary, meta: r.meta } : null;
}

// ── Needs you ───────────────────────────────────────────────────────────────

async function papersToCheck(sb: Sb) {
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data, error } = await sb.from('paper_marking_runs').select('id, student_name, paper_name, result_json')
    .is('released_at', null).is('archived_at', null).gte('created_at', since).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  let papers = 0, parts = 0;
  const list: { id: string; student: string | null; paper: string | null; parts: number }[] = [];
  for (const row of data ?? []) {
    if (!Array.isArray((row.result_json as { results?: unknown })?.results)) continue;
    const n = extractFlagged(row.result_json).flagged.length;
    if (!n) continue;
    papers += 1; parts += n;
    if (list.length < LIST_ROWS) list.push({ id: row.id as string, student: (row.student_name as string | null) ?? null, paper: (row.paper_name as string | null) ?? null, parts: n });
  }
  return { papers, parts, list };
}

// ── Today ───────────────────────────────────────────────────────────────────

async function lessonsToday(): Promise<LessonLink[]> {
  const today = sgtTodayISO();
  const lessons = await lessonsBetween(today, addDaysISO(today, 1), ['Scheduled', 'Completed']);
  if (!lessons.length) return [];
  const ids = [...new Set(lessons.map((l) => l.studentId))];
  const formula = `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
  const { records } = await airtableRequestAll('Students', `?filterByFormula=${encodeURIComponent(formula)}&fields%5B%5D=Student%20Name`);
  const nameOf = new Map((records as { id: string; fields: Record<string, unknown> }[]).map((r) => [r.id, String(r.fields['Student Name'] ?? '').trim()]));
  return lessons
    .map((l) => ({ lessonId: l.id, studentId: l.studentId, name: nameOf.get(l.studentId) || 'A student', time: l.time, href: `/admin/students/${l.studentId}/next` }))
    .sort((a, b) => slotOrder(a.time) - slotOrder(b.time) || a.name.localeCompare(b.name));
}

/** The Slots table's Time options, in the order of the day; anything else last. */
const SLOT_TIMES = ['9-11am', '11am-1pm', '1-3pm', '3-5pm', '5-7pm', '7-9pm'];
function slotOrder(t: string | null): number {
  const i = SLOT_TIMES.indexOf(String(t || ''));
  return i < 0 ? 99 : i;
}

/** Mirrors /api/admin-stats lessonsToLog (the /admin/log queue): same window, same clock. */
async function lessonsToLog(): Promise<{ total: number; days: { date: string; n: number }[] }> {
  const today = localToday();
  const formula = `AND({Date}>='${daysAgo(EDIT_WINDOW_DAYS)}',{Date}<'${addDaysISO(today, 1)}',OR({Status}='Scheduled',{Status}='Completed'),NOT({Progress Logged}))`;
  const data = await airtableRequestAll('Lessons', `?filterByFormula=${encodeURIComponent(formula)}&fields%5B%5D=Student&fields%5B%5D=Date`);
  const rows = (data.records as { fields: Record<string, unknown> }[]).filter((r) => ((r.fields['Student'] as unknown[]) ?? []).length > 0);
  const byDay = new Map<string, number>();
  for (const r of rows) { const d = String(r.fields['Date'] ?? '').slice(0, 10); if (d) byDay.set(d, (byDay.get(d) ?? 0) + 1); }
  return { total: rows.length, days: [...byDay].map(([date, n]) => ({ date, n })).sort((a, b) => b.date.localeCompare(a.date)) };
}

// ── The machine ─────────────────────────────────────────────────────────────

async function queue(sb: Sb) {
  const cols = 'id, created_at, paper_name, student_name, queue_status, total_max, released_at, archived_at, num_photos, queue:result_json->queue';
  const [inFlight, flagged] = await Promise.all([
    sb.from('paper_marking_runs').select(cols).is('total_max', null).order('created_at', { ascending: true }).limit(50),
    sb.from('paper_marking_runs').select(cols).eq('queue_status', 'queued').limit(50),
  ]);
  if (inFlight.error) throw new Error(inFlight.error.message);
  const byId = new Map<string, QueueRunRow>();
  for (const r of [...(inFlight.data || []), ...(flagged.data || [])] as unknown as QueueRunRow[]) byId.set(r.id, r);
  const s = markingQueueState([...byId.values()]);
  const marking = s.rows.filter((r) => r.phase !== 'unclaimed').length;
  const list = s.rows.slice(0, LIST_ROWS).map((r) => ({ student: r.student, paper: r.paper, phase: r.phase, waitingMinutes: r.waitingMinutes, pagesDone: r.pagesDone, pagesTotal: r.pagesTotal }));
  return { waiting: s.rows.length - marking, marking, oldestMinutes: s.oldestMinutes, list };
}

async function extraction(sb: Sb, midnight: string, now: number) {
  const src = () => sb.from('paper_library').select('id', { count: 'exact', head: true }).eq('kind', 'source');
  const weekAgo = sgtDayStartISO(sgtDaysAgoISO(TREND_DAYS - 1));
  const [waiting, working, held, doneToday, done24h, week, claimed] = await Promise.all([
    count(src().eq('status', 'queued')),
    count(src().eq('status', 'claimed')),
    count(src().eq('status', 'held')),
    count(src().eq('status', 'done').gte('finished_at', midnight)),
    count(src().eq('status', 'done').gte('finished_at', new Date(now - 86400_000).toISOString())),
    all<{ finished_at: string }>((a, b) => sb.from('paper_library').select('finished_at').eq('kind', 'source').eq('status', 'done').gte('finished_at', weekAgo).range(a, b), 5000),
    sb.from('paper_library').select('source_file').eq('kind', 'source').eq('status', 'claimed').order('claimed_at', { ascending: false }).limit(LIST_ROWS),
  ]);
  const workingOn = ((claimed.data ?? []) as { source_file: string | null }[]).map((r) => r.source_file || '').filter(Boolean);
  return { waiting, working, held, doneToday, done24h, perDay: perDay(week.map((r) => r.finished_at), TREND_DAYS, now), workingOn };
}

let twinsLeftCache: { at: number; left: Record<string, number | null> } | null = null;
async function twinsLeftNow(sb: Sb): Promise<Record<string, number | null>> {
  if (twinsLeftCache && Date.now() - twinsLeftCache.at < 3600_000) return twinsLeftCache.left;
  // THE gap — math_twin_units, the function twin.mjs (the Fly lane) and the cloud door read
  const left: Record<string, number | null> = {};
  for (const lv of TWIN_LEVELS) {
    const { data, error } = await sb.rpc('math_twin_units', { p_levels: [lv], p_per_skill: TWINS_PER_SKILL });
    left[lv] = error ? null : mathGapSummary((data ?? []) as MathTwinUnit[], TWINS_PER_SKILL).to_write;
  }
  twinsLeftCache = { at: Date.now(), left };
  return left;
}

async function twins(sb: Sb, midnight: string, now: number) {
  const weekAgo = sgtDayStartISO(sgtDaysAgoISO(TREND_DAYS - 1));
  const [week, left] = await Promise.all([
    all<{ created_at: string }>((a, b) => sb.from('questions').select('created_at').eq('school', 'AdrianMath').eq('exam_type', 'Twin').gte('created_at', weekAgo).range(a, b), 5000),
    safe(() => twinsLeftNow(sb)),
  ]);
  return { today: week.filter((r) => r.created_at >= midnight).length, perDay: perDay(week.map((r) => r.created_at), TREND_DAYS, now), left };
}

async function jobs(sb: Sb) {
  const latest = await latestJobRuns(3000);
  // Weekly/monthly jobs can fall outside the scan behind the every-10-minute ones — read those one by one.
  const seen = new Set(latest.map((r) => r.job));
  const missing = [...Object.keys(JOB_RHYTHMS), ...SELF_FIX_JOBS].filter((j) => !seen.has(j));
  const extra = await Promise.all(missing.map(async (j) => {
    const r = await lastJob(sb, j);
    return r ? ({ job: j, ran_at: r.at, ok: r.ok, summary: r.summary } as JobRunRow) : null;
  }));
  const rows = [...latest, ...extra.filter((r): r is JobRunRow => !!r)];
  const stale = staleJobs(rows, new Date());
  const failed = stale.filter((s) => s.reason.startsWith('last run FAILED'));
  const failing = failed.map((s) => s.job);
  const failingWhy = Object.fromEntries(failed.map((s) => [s.job, s.reason]));
  const late = stale.filter((s) => !s.reason.startsWith('last run FAILED'));
  const fixes = rows.filter((r) => SELF_FIX_JOBS.includes(r.job)).sort((a, b) => b.ran_at.localeCompare(a.ran_at));
  const lastSelfFix = fixes[0] ? { job: fixes[0].job, at: fixes[0].ran_at, summary: fixes[0].summary } : null;
  const total = rows.filter((r) => JOB_RHYTHMS[r.job]).length;
  return { total, late, failing, failingWhy, lastSelfFix };
}

async function logins() {
  const [map, usage] = await Promise.all([getSlotAccounts(), getSlotUsage().catch(() => ({}))]);
  return slotAccountRows(map, usage).map((r, i) => ({
    name: `login ${i + 1}`, on: r.on, fiveHour: r.usage?.five_hour ?? null, sevenDay: r.usage?.seven_day ?? null, at: r.usage?.at ?? null,
  }));
}

async function botUp() {
  // 8 s and one retry (7 Oct 2026): at 3 s the tile said "Bot down" for half an hour while the
  // bot answered every job — this read runs beside ~20 others in one cold function, from the
  // US to Singapore; the health check gives the same page 15 s and saw it up.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(BOT_HEALTH_URL, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (!r.ok) continue;
      const d = await r.json().catch(() => ({})) as { uptime?: number };
      return { up: true, uptimeSec: typeof d.uptime === 'number' ? d.uptime : null };
    } catch { /* timed out or refused — once more */ }
  }
  return { up: false, uptimeSec: null };
}

// ── This week ───────────────────────────────────────────────────────────────

async function stuck(sb: Sb) {
  // the newest real report; a dry run only when there is no real one yet
  const { data, error } = await sb.from('stuck_reports').select('created_at, dry, picture').order('created_at', { ascending: false }).limit(6);
  if (error) throw new Error(error.message);
  type R = { created_at: string; dry: boolean; picture: { students?: { area: string; names: string[]; groupLabel: string }[]; gaps?: { subject: string; area: string; groupLabel: string }[] } | null };
  const rows = (data ?? []) as R[];
  const r = rows.find((x) => !x.dry) ?? rows[0];
  if (!r) return null;
  const scienceGaps = (r.picture?.gaps ?? []).filter((g) => isScience(g.subject as StuckSubject)).map((g) => g.area);
  return { at: r.created_at, students: (r.picture?.students ?? []).map((s) => ({ area: s.area, names: s.names ?? [], groupLabel: s.groupLabel })), scienceGaps: [...new Set(scienceGaps)] };
}

async function cost(sb: Sb, now: number) {
  const month = sgtTodayISO().slice(0, 7);
  const since = new Date(Math.min(now - TREND_DAYS * 86400_000, Date.parse(`${month}-01T00:00:00+08:00`))).toISOString();
  const COLS = 'id, created_at, num_photos, cost_usd, total_max, result_json->queue, result_json->portal_submission, result_json->telegram_handin, result_json->usage, result_json->vision_usage';
  const { data, error } = await sb.from('paper_marking_runs').select(COLS).gte('created_at', since).not('total_max', 'is', null).limit(800);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    ...r,
    result_json: { queue: r.queue ?? null, portal_submission: r.portal_submission ?? undefined, telegram_handin: r.telegram_handin ?? undefined, usage: r.usage ?? null, vision_usage: r.vision_usage ?? null },
  })) as unknown as CostRunRow[];
  const entries = costEntries(rows);
  const weekFrom = new Date(now - TREND_DAYS * 86400_000).toISOString();
  const week = entries.filter((e) => e.at >= weekFrom);
  const weekCost = week.reduce((a, e) => a + e.cost, 0);
  const mtd = entries.filter((e) => e.day.startsWith(month)).reduce((a, e) => a + e.cost, 0);
  return {
    perPaper7d: week.length ? Math.round((weekCost / week.length) * 100) / 100 : null,
    papers7d: week.length,
    monthToDate: Math.round(mtd * 100) / 100,
    month: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-SG', { month: 'short', timeZone: 'UTC' }),
    perDay: sumPerDay(entries.map((e) => ({ at: e.at, value: e.cost })), TREND_DAYS, now),
  };
}

// ── All of it ───────────────────────────────────────────────────────────────

// Which app tabs students opened this week (6 Oct 2026, 'tab:view' rows from components/TabBeacon.tsx).
async function tabsWeek(sb: Sb, now: number) {
  const since = new Date(now - 7 * 86400_000).toISOString();
  const rows = await all<ActivityEvent>((a, b) => sb.from('portal_event_log').select('identity, kind, created_at, detail').eq('kind', TAB_VIEW_KIND).gte('created_at', since).order('created_at').range(a, b), 20_000);
  const at = new Date(now);
  return {
    students: tabStudents7d(rows, at),
    top: summariseTabViews(rows, at).slice(0, 5).map((t) => ({ label: t.label, students: t.students7d, opens: t.opens7d })),
  };
}

/**
 * Papers real students handed in, per Singapore day (lib/dash-counts.ts has the rule).
 * The second read finds the rows that REPLACE an earlier one (a re-mark, the same paper
 * sent again): the earlier row carries `superseded_by` = the newer row's id.
 */
async function handedIn(sb: Sb, weekAgo: string, now: number) {
  const [rows, replaced] = await Promise.all([
    all<HandinRow>((a, b) => sb.from('paper_marking_runs').select('id, created_at, student_id, paper_name').gte('created_at', weekAgo).order('created_at', { ascending: false }).range(a, b), 3000),
    all<{ superseded_by: string | null }>((a, b) => sb.from('paper_marking_runs').select('superseded_by').not('superseded_by', 'is', null).gte('created_at', new Date(now - 90 * 86400_000).toISOString()).range(a, b), 3000),
  ]);
  const c = countHandins(rows, replaced.map((r) => r.superseded_by).filter((x): x is string => !!x), TREND_DAYS, now);
  return { today: c.today, perDay: c.perDay };
}

/**
 * Practice questions real students answered, per Singapore day: maths practice
 * (`student_attempts`), English practice and the H2 tools. One row = one question.
 */
async function practiceDone(sb: Sb, weekAgo: string, now: number) {
  const [maths, english, h2] = await Promise.all([
    all<{ airtable_student_id: string | null; attempted_at: string }>((a, b) => sb.from('student_attempts').select('airtable_student_id, attempted_at').gte('attempted_at', weekAgo).range(a, b), 5000),
    all<{ identity: string | null; created_at: string }>((a, b) => sb.from('english_practice_attempts').select('identity, created_at').gte('created_at', weekAgo).range(a, b), 5000),
    all<{ identity: string | null; created_at: string }>((a, b) => sb.from('h2_tool_attempts').select('identity, created_at').gte('created_at', weekAgo).range(a, b), 5000),
  ]);
  const rows: PracticeRow[] = [
    ...maths.map((r) => ({ at: r.attempted_at, who: r.airtable_student_id })),
    ...[...english, ...h2].map((r) => ({ at: r.created_at, who: r.identity })),
  ];
  const c = countPractice(rows, TREND_DAYS, now);
  return { students: c.studentsToday, questions: c.today, perDay: c.perDay };
}

export async function loadGlanceFacts(now = Date.now()): Promise<GlanceFacts> {
  const sb = getSupabaseAdmin();
  const midnight = sgtDayStartISO(now);
  const weekAgo = sgtDayStartISO(sgtDaysAgoISO(TREND_DAYS - 1, now));
  const job = (j: string) => safe(() => lastJob(sb, j));

  const [
    questionProposals, rulesProposed, shipsFailed, toCheck, extractionFlagged, failedHandins, suggestionsNew,
    shipsList, flaggedList, proposalLevels,
    lessons, toLog, marked, practice, handed,
    q, ext, tw, jb, lg, disk, bot, fileBackup, backupCheck, leakTest,
    st, cs, tb,
  ] = await Promise.all([
    safe(() => count(sb.from('authored_question_proposals').select('id', { count: 'exact', head: true }).eq('status', 'pending'))),
    safe(() => count(sb.from('extraction_rules').select('id', { count: 'exact', head: true }).eq('status', 'proposed'))),
    safe(() => count(sb.from('proposal_requests').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('requested_at', new Date(now - 7 * 86400_000).toISOString()))),
    safe(() => papersToCheck(sb)),
    safe(() => count(sb.from('paper_library').select('id', { count: 'exact', head: true }).eq('kind', 'source').in('status', ['flagged', 'failed']))),
    safe(() => count(sb.from('portal_event_log').select('id', { count: 'exact', head: true }).eq('kind', 'submit:failed').gte('created_at', new Date(now - 86400_000).toISOString()))),
    safe(() => count(sb.from('portal_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'new'))),
    safe(async () => {
      const { data, error } = await sb.from('proposal_requests').select('slug, action, result, requested_at').eq('status', 'failed')
        .gte('requested_at', new Date(now - 7 * 86400_000).toISOString()).order('requested_at', { ascending: false }).limit(LIST_ROWS);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ slug: String(r.slug), action: String(r.action), result: (r.result as string | null) ?? null, at: String(r.requested_at) }));
    }),
    safe(async () => {
      const { data, error } = await sb.from('paper_library').select('source_file, status, notes').eq('kind', 'source').in('status', ['flagged', 'failed'])
        .order('status', { ascending: true }).order('finished_at', { ascending: false, nullsFirst: false }).limit(LIST_ROWS);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ file: String(r.source_file || 'a paper'), status: String(r.status), note: (r.notes as string | null) ?? null }));
    }),
    safe(async () => {
      const rows = await all<{ level: string | null }>((a, b) => sb.from('authored_question_proposals').select('level').eq('status', 'pending').range(a, b), 5000);
      const by = new Map<string, number>();
      for (const r of rows) by.set(r.level || 'No level', (by.get(r.level || 'No level') ?? 0) + 1);
      return [...by].map(([level, n]) => ({ level, n })).sort((a, b) => b.n - a.n);
    }),
    safe(() => lessonsToday()),
    safe(() => lessonsToLog()),
    safe(async () => {
      const rows = await all<{ id: string; released_at: string; student_name: string | null; paper_name: string | null }>((a, b) => sb.from('paper_marking_runs').select('id, released_at, student_name, paper_name').gte('released_at', weekAgo).order('released_at', { ascending: false }).range(a, b), 3000);
      const at = rows.map((r) => r.released_at);
      const today = rows.filter((r) => r.released_at >= midnight);
      return { today: today.length, perDay: perDay(at, TREND_DAYS, now), list: today.slice(0, LIST_ROWS).map((r) => ({ id: r.id, student: r.student_name, paper: r.paper_name })) };
    }),
    safe(() => practiceDone(sb, weekAgo, now)),
    safe(() => handedIn(sb, weekAgo, now)),
    safe(() => queue(sb)),
    safe(() => extraction(sb, midnight, now)),
    safe(() => twins(sb, midnight, now)),
    safe(() => jobs(sb)),
    safe(() => logins()),
    safe(async () => {
      const r = await lastJob(sb, 'disk-check');
      const pct = Number((r?.meta as { pct?: unknown } | null)?.pct);
      return r && Number.isFinite(pct) ? { pct, at: r.at } : null;
    }),
    botUp(),
    job('file-backup'), job('backup-check'), job('leak-test'),
    safe(() => stuck(sb)),
    safe(() => cost(sb, now)),
    safe(() => tabsWeek(sb, now)),
  ]);

  const line = (j: (JobLine & { meta?: unknown }) | null): JobLine | null => (j ? { ok: j.ok, at: j.at, summary: j.summary } : null);
  return {
    questionProposals, rulesProposed, shipsFailed, papersToCheck: toCheck, extractionFlagged, failedHandins, suggestionsNew,
    shipsFailedList: shipsList, extractionFlaggedList: flaggedList, questionProposalsByLevel: proposalLevels,
    lessonsToday: lessons, lessonsToLog: toLog?.total ?? null, lessonsToLogDays: toLog?.days ?? null, marked, practice, handedIn: handed,
    queue: q, extraction: ext, twins: tw, jobs: jb, logins: lg, disk,
    deploys: {
      website: process.env.VERCEL_GIT_COMMIT_SHA ? { sha: process.env.VERCEL_GIT_COMMIT_SHA, message: (process.env.VERCEL_GIT_COMMIT_MESSAGE || '').split('\n')[0].slice(0, 80) || null } : null,
      bot,
    },
    backups: { fileBackup: line(fileBackup), backupCheck: line(backupCheck), leakTest: line(leakTest) },
    stuck: st, cost: cs, tabs: tb,
  };
}
