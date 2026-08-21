import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday, daysAgo, EDIT_WINDOW_DAYS } from '@/lib/schedule-helpers';
import { unmarkedLessonsFilterFormula } from '@/lib/unmarked-lessons';
import { resolveActiveExamType, checkExamInfoStatus, seasonSatisfyingTypes, ExamType, ExamRecord } from '@/lib/exam-season';
import { getSupabaseAdmin, getSecretKey } from '@/lib/supabase';
import { extractFlagged } from '@/lib/mark-triage';

export const runtime = 'nodejs';

// SGT = UTC+8
function sgtDateStr(): string {
  const sgt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${sgt.getUTCFullYear()}-${String(sgt.getUTCMonth() + 1).padStart(2, '0')}-${String(sgt.getUTCDate()).padStart(2, '0')}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getMondayStr(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function buildWeekLabel(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00Z');
  const sunday = new Date(mondayStr + 'T00:00:00Z');
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const monDay = monday.getUTCDate();
  const sunDay = sunday.getUTCDate();
  const month = sunday.toLocaleDateString('en-SG', { month: 'short', timeZone: 'UTC' });
  return `${monDay}–${sunDay} ${month}`;
}

// ── Fail-soft extra stats ─────────────────────────────────────────────────────
// Each returns null on ANY failure (bot down, table hiccup, bad env) so one
// broken sub-fetch can never take out the whole stats payload — the hub simply
// hides that card.

/**
 * Papers uploaded to /admin/mark-paper but never (successfully) marked —
 * rows the save-paper phase left with `total_max` null. A row under 4 minutes
 * old may have its original marking still running server-side (same window the
 * mark-paper history list uses before offering ▶ Mark), reported separately as
 * `possiblyMarking`.
 */
async function fetchPendingPapers(): Promise<{ count: number; possiblyMarking: number } | null> {
  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return null;
  try {
    const r = await fetch(`${botBase}/api/mark-paper`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'stats' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const runs: any[] = Array.isArray(data?.runs) ? data.runs : [];
    // total_max == null (loose — covers undefined) is the pending signal,
    // exactly the check the mark-paper history rows key off.
    const pending = runs.filter(run => run?.total_max == null);
    const cutoff = Date.now() - 4 * 60 * 1000;
    const possiblyMarking = pending.filter(run => {
      const t = new Date(run?.created_at ?? '').getTime();
      return Number.isFinite(t) && t > cutoff;
    }).length;
    return { count: pending.length, possiblyMarking };
  } catch {
    return null;
  }
}

/**
 * Marked scripts waiting on Adrian at /admin/mark/triage: flagged questions he
 * hasn't resolved, plus whole scripts that are clean and just need releasing.
 * Reads Supabase directly (the runs table), not the bot.
 */
async function fetchTriage(): Promise<{ flagged: number; readyToRelease: number } | null> {
  if (!getSecretKey()) return null;
  try {
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from('paper_marking_runs')
      .select('result_json')
      .is('released_at', null)
      .gte('created_at', since);
    if (error) return null;

    let flagged = 0;
    let readyToRelease = 0;
    for (const row of data ?? []) {
      // Queued-but-unmarked runs have no results[] — not reviewable, and counting
      // them as "ready" would invite releasing an empty script.
      if (!Array.isArray((row.result_json as { results?: unknown })?.results)) continue;
      const n = extractFlagged(row.result_json).flagged.length;
      flagged += n;
      if (n === 0) readyToRelease++;
    }
    return { flagged, readyToRelease };
  } catch {
    return null;
  }
}

/** Past lessons with no attendance status — see lib/unmarked-lessons.ts. */
async function fetchUnmarkedLessons(todayISO: string): Promise<number | null> {
  try {
    const formula = encodeURIComponent(unmarkedLessonsFilterFormula(todayISO));
    const data = await airtableRequestAll('Lessons', `?filterByFormula=${formula}&fields[]=Date`);
    return data.records.length;
  } catch {
    return null;
  }
}

/**
 * Lessons still waiting for their end-of-day write-up — the /admin/log queue
 * (Adrian asked for it on the hub, 2026-08-22). Mirrors log-queue's filter
 * exactly: in the edit window, Scheduled/Completed, Progress Logged unticked.
 * Same clock as that route (localToday/daysAgo) so the count matches the page.
 */
async function fetchLessonsToLog(): Promise<number | null> {
  try {
    const today = localToday();
    const cutoff = daysAgo(EDIT_WINDOW_DAYS);
    const tomorrow = addDays(today, 1); // exclusive upper bound (Airtable date gotcha)
    const formula = encodeURIComponent(
      `AND({Date}>='${cutoff}',{Date}<'${tomorrow}',` +
      `OR({Status}='Scheduled',{Status}='Completed'),NOT({Progress Logged}))`
    );
    const data = await airtableRequestAll('Lessons', `?filterByFormula=${formula}&fields[]=Student`);
    return data.records.filter(r => (r.fields['Student'] ?? []).length > 0).length;
  } catch {
    return null;
  }
}

/**
 * Active students missing exam info for the ACTIVE exam season, or null when
 * no season is active. Override read exactly as /api/admin/exam-season reads
 * it; "missing" is checkExamInfoStatus (the schedule/progress ⚠ criteria —
 * no record, or a record lacking Exam Date or Tested Topics, with No Exam
 * suppressing the warning).
 */
async function fetchExamGaps(): Promise<{ examType: ExamType; count: number } | null> {
  try {
    const settings = await airtableRequest(
      'Settings',
      `?filterByFormula=${encodeURIComponent(`{Setting Name}='exam_season_override'`)}&maxRecords=1`
    );
    let forceOn: ExamType | null = null;
    try {
      const v = JSON.parse(settings.records?.[0]?.fields?.['Value'] || '{}');
      if (['WA1', 'WA2', 'WA3', 'EOY'].includes(v.forceOn)) forceOn = v.forceOn as ExamType;
    } catch {}
    const activeType = resolveActiveExamType(forceOn);
    if (!activeType) return null;

    const [studentsData, examsData] = await Promise.all([
      airtableRequestAll('Students', `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student Name`),
      // Linked-record filters are unreliable (ARRAYJOIN returns display names,
      // not IDs) — fetch this exam type's records and match Student in JS.
      // Prelim/Promo satisfy the season (Sec4/JC2 Prelims, JC1 Promo) — same
      // OR-include as the schedule route, else complete students count as gaps.
      airtableRequestAll('Exams', `?filterByFormula=${encodeURIComponent(`OR(${seasonSatisfyingTypes(activeType).map(t => `{Exam Type}='${t}'`).join(',')})`)}&fields[]=Student&fields[]=Exam Type&fields[]=Exam Date&fields[]=Tested Topics&fields[]=No Exam`),
    ]);

    const examsByStudent: Record<string, ExamRecord[]> = {};
    for (const r of examsData.records ?? []) {
      const sid = r.fields['Student']?.[0];
      if (!sid) continue;
      (examsByStudent[sid] ||= []).push({
        id: r.id,
        examType: r.fields['Exam Type'] ?? '',
        examDate: r.fields['Exam Date'] ?? null,
        testedTopics: r.fields['Tested Topics'] ?? null,
        noExam: r.fields['No Exam'] ?? false,
      });
    }
    const count = (studentsData.records ?? []).filter(
      (s: any) => !checkExamInfoStatus(examsByStudent[s.id] ?? [], activeType).complete
    ).length;
    return { examType: activeType, count };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = sgtDateStr();
  const monday = getMondayStr(today);
  const nextMonday = addDays(monday, 7); // exclusive upper bound for week range
  const sunday = addDays(monday, 6);

  const todayFilter = encodeURIComponent(
    `AND(IS_SAME({Date},'${today}','day'),{Status}='Scheduled')`
  );
  // Exclusive upper bound: {Date}<nextMonday avoids Airtable midnight coercion dropping Sunday
  const weekFilter = encodeURIComponent(
    `AND({Date}>='${monday}',{Date}<'${nextMonday}',{Status}='Scheduled')`
  );
  const invoiceFilter = encodeURIComponent(
    `AND({Is Paid}=FALSE(),{Status}='Sent')`
  );
  const absentFilter = encodeURIComponent(`{Status}='Absent'`);

  const [todayLessons, weekLessons, invoices, absentLessons, pendingPapers, unmarkedLessons, examGaps, triage, lessonsToLog] = await Promise.all([
    airtableRequestAll('Lessons', `?filterByFormula=${todayFilter}&fields[]=Topics+Covered`),
    airtableRequestAll('Lessons', `?filterByFormula=${weekFilter}&fields[]=Date`),
    airtableRequestAll('Invoices', `?filterByFormula=${invoiceFilter}&fields[]=Final+Amount`),
    airtableRequestAll('Lessons', `?filterByFormula=${absentFilter}&fields[]=Rescheduled+Lesson+ID`),
    // New stats are individually fail-soft (null on failure, never throw).
    fetchPendingPapers(),
    fetchUnmarkedLessons(today),
    fetchExamGaps(),
    fetchTriage(),
    fetchLessonsToLog(),
  ]);

  const todayTotal = todayLessons.records.length;
  const todayLogged = todayLessons.records.filter(
    r => (r.fields['Topics Covered'] ?? '').trim().length > 0
  ).length;

  const invoiceCount = invoices.records.length;
  const totalOwed = invoices.records.reduce(
    (sum, r) => sum + (r.fields['Final Amount'] ?? 0), 0
  );

  // Makeups owed: absent lessons with no linked rescheduled/makeup lesson
  const makeupCount = absentLessons.records.filter(r => {
    const linked = r.fields['Rescheduled Lesson ID'];
    return !linked || linked.length === 0;
  }).length;

  return NextResponse.json(
    {
      today: { total: todayTotal, logged: todayLogged },
      invoices: { count: invoiceCount, totalOwed },
      makeups: { count: makeupCount },
      thisWeek: { count: weekLessons.records.length, weekLabel: buildWeekLabel(monday) },
      // Additive fields (2026-08) — each null when its sub-fetch failed
      // (examGaps is also null outside an exam season).
      pendingPapers,
      unmarkedLessons,
      examGaps,
      triage,
      lessonsToLog,
    },
    {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
      },
    }
  );
}
