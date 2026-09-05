// /api/admin/find-review — the nightly Find-a-question review's two doors
// (SPEC-PORTAL-V2 §4; the plan-billed session is scripts/find-review).
//
//   GET  ?date=YYYY-MM-DD (SGT day, default yesterday)
//        → { date, from, to, rows:[…], counts }  every portal_generation_log row
//          of that day with the student's own question text (seed_text), the
//          question that reached them (text, topics, sub-skill, marks), the
//          tier, the candidate pool with the rule's verdicts, the Practice row
//          it became, and any stored review.
//   POST { date, verdicts:[{id, verdict:'similar'|'same-chapter'|'off', why}], note? }
//        → { ok, updated, counts, digest, telegram }  stores each verdict in
//          portal_generation_log.review, then Telegrams ONE digest (ops topic)
//          built from every review stored for that day — counts + the misses.
//
// Admin-authed (Bearer ADMIN_PASSWORD — the Mac worker holds it, same posture
// as sheet-jobs); the health check probes the 401. The job_runs stamp is the
// worker's last step (POST /api/job-log 'find-review'), not this route's.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { sgtDaysAgoISO } from '@/lib/sgt';
import {
  parseReviewBody, reviewCounts, reviewDigest, isReviewDate, isReviewVerdict, REVIEWED_BY,
  type ReviewDayRow, type ReviewEntry, type StoredReview,
} from '@/lib/find-review';
import { isFindTier, previewOf, primaryFiling, candidateTopic, type FindTier } from '@/lib/portal-find';
import { loadFilings } from '@/lib/find-assign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LedgerRow = {
  id: string;
  airtable_student_id: string;
  kind: string;
  qb_hit: boolean;
  generated: boolean;
  question_id: string | null;
  created_at: string;
  seed_text: string | null;
  level: string | null;
  tier: string | null;
  assignment_id: string | null;
  parent_log_id: string | null;
  candidates: unknown;
  review: StoredReview | null;
};

/** The SGT day's UTC bounds. */
function dayBounds(date: string): { from: string; to: string } {
  const from = new Date(`${date}T00:00:00+08:00`);
  const to = new Date(from.getTime() + 24 * 3600_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function dayRows(date: string): Promise<LedgerRow[]> {
  const { from, to } = dayBounds(date);
  const { data, error } = await getSupabaseAdmin()
    .from('portal_generation_log')
    .select('*')
    .gte('created_at', from)
    .lt('created_at', to)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new Error(`ledger read failed: ${error.message}`);
  return (data ?? []) as LedgerRow[];
}

type QuestionShape = { id: string; text: string; topics: string[]; topic: string | null; subgroup: string | null; marks: number | null; level: string | null };

/** Names + questions + assignments for a day's rows, in three parallel reads. */
async function joins(rows: LedgerRow[]) {
  const sb = getSupabaseAdmin();
  const identities = [...new Set(rows.map((r) => r.airtable_student_id))];
  const recIds = identities.filter((i) => /^rec/.test(i));
  const acctIds = identities.filter((i) => i.startsWith('acct:')).map((i) => i.slice(5));
  const qids = [...new Set(rows.map((r) => r.question_id).filter((q): q is string => !!q))];
  const aids = [...new Set(rows.map((r) => r.assignment_id).filter((a): a is string => !!a))];

  const [byRec, byAcct, questions, filings, assignments] = await Promise.all([
    recIds.length
      ? sb.from('portal_accounts').select('airtable_student_id, display_name').in('airtable_student_id', recIds)
      : Promise.resolve({ data: [] as { airtable_student_id: string; display_name: string | null }[] }),
    acctIds.length
      ? sb.from('portal_accounts').select('id, display_name').in('id', acctIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    qids.length
      ? sb.from('questions').select('id, question_text, parts, topics, level, total_marks').in('id', qids)
      : Promise.resolve({ data: [] as { id: string; question_text: string | null; parts: unknown; topics: string[] | null; level: string | null; total_marks: number | null }[] }),
    loadFilings(sb, qids),
    aids.length
      ? sb.from('portal_assignments').select('id, status, score, out_of').in('id', aids)
      : Promise.resolve({ data: [] as { id: string; status: string; score: number | null; out_of: number | null }[] }),
  ]);

  const names = new Map<string, string | null>();
  for (const a of (byRec.data ?? []) as { airtable_student_id: string; display_name: string | null }[]) names.set(a.airtable_student_id, a.display_name);
  for (const a of (byAcct.data ?? []) as { id: string; display_name: string | null }[]) names.set(`acct:${a.id}`, a.display_name);

  const qs = new Map<string, QuestionShape>();
  for (const q of (questions.data ?? []) as { id: string; question_text: string | null; parts: unknown; topics: string[] | null; level: string | null; total_marks: number | null }[]) {
    const f = filings.get(q.id);
    const topics = Array.isArray(q.topics) ? q.topics.filter((t): t is string => typeof t === 'string') : [];
    const c = { filings: f?.filings ?? [], topics };
    qs.set(q.id, {
      id: q.id,
      text: previewOf(q, 1200),
      topics,
      topic: candidateTopic(c),
      subgroup: primaryFiling(c)?.name ?? null,
      marks: q.total_marks ?? null,
      level: q.level,
    });
  }
  const as = new Map<string, { id: string; status: string; score: number | null; out_of: number | null }>();
  for (const a of (assignments.data ?? []) as { id: string; status: string; score: number | null; out_of: number | null }[]) as.set(a.id, a);
  return { names, qs, as };
}

function tierOf(r: LedgerRow): FindTier | null {
  return isFindTier(r.tier) ? r.tier : null;
}

function toDayRow(r: LedgerRow, names: Map<string, string | null>, qs: Map<string, QuestionShape>): ReviewDayRow {
  const q = r.question_id ? qs.get(r.question_id) ?? null : null;
  return {
    id: r.id,
    student: names.get(r.airtable_student_id) ?? null,
    tier: tierOf(r),
    miss: tierOf(r) === null && !r.generated,
    topic: q?.topic ?? null,
    subgroup: q?.subgroup ?? null,
  };
}

function storedVerdicts(rows: LedgerRow[]): ReviewEntry[] {
  const out: ReviewEntry[] = [];
  for (const r of rows) {
    const v = r.review;
    if (v && isReviewVerdict(v.verdict) && typeof v.why === 'string') out.push({ id: r.id, verdict: v.verdict, why: v.why });
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dateParam = new URL(req.url).searchParams.get('date');
  const date = dateParam ?? sgtDaysAgoISO(1);
  if (!isReviewDate(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  try {
    const rows = await dayRows(date);
    const { names, qs, as } = await joins(rows);
    const shaped = rows.map((r) => {
      const day = toDayRow(r, names, qs);
      return {
        id: r.id,
        createdAt: r.created_at,
        student: { id: r.airtable_student_id, name: day.student },
        kind: r.kind,
        level: r.level,
        seedText: r.seed_text,
        qbHit: r.qb_hit,
        generated: r.generated,
        tier: day.tier,
        miss: day.miss,
        questionId: r.question_id,
        question: r.question_id ? qs.get(r.question_id) ?? null : null,
        candidates: r.candidates,
        assignment: r.assignment_id ? as.get(r.assignment_id) ?? null : null,
        parentLogId: r.parent_log_id,
        review: r.review,
      };
    });
    const counts = reviewCounts(rows.map((r) => toDayRow(r, names, qs)), storedVerdicts(rows));
    return NextResponse.json({ date, ...dayBounds(date), rows: shaped, counts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = parseReviewBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { date, verdicts, note } = parsed;
  const sb = getSupabaseAdmin();
  const reviewedAt = new Date().toISOString();

  let updated = 0;
  for (const v of verdicts) {
    const review: StoredReview = { id: v.id, verdict: v.verdict, why: v.why, reviewed_at: reviewedAt, by: REVIEWED_BY };
    const { data, error } = await sb
      .from('portal_generation_log')
      .update({ review })
      .eq('id', v.id)
      .select('id');
    if (error) return NextResponse.json({ error: `review write failed: ${error.message}`, updated }, { status: 500 });
    if (data?.length) updated++;
  }

  // The digest is built from EVERY review stored for the day, so a review
  // posted in two halves still reads as one.
  try {
    const rows = await dayRows(date);
    const { names, qs } = await joins(rows);
    const day = rows.map((r) => toDayRow(r, names, qs));
    const all = storedVerdicts(rows);
    const counts = reviewCounts(day, all);
    const digest = reviewDigest(date, day, all) + (note ? `\n📝 ${note.replace(/&/g, '&amp;').replace(/</g, '&lt;')}` : '');
    let telegram = false;
    try { telegram = await sendTelegram(digest, 'ops'); } catch { /* the digest is a courtesy; the review is stored */ }
    return NextResponse.json({ ok: true, updated, counts, digest, telegram });
  } catch (e) {
    return NextResponse.json({ ok: true, updated, error: `stored, but the digest failed: ${(e as Error).message}` });
  }
}
