// GET  /api/portal/notebook — the student's error notebook, lazily synced from
//   their released marked papers (no cron: opening the page IS the sync, and
//   it backfills history on first open).
// POST /api/portal/notebook — record one re-attempt on an entry:
//   {entryId, action:'attempt', answer, confident}   auto-check vs the variant answer
//   {entryId, action:'confirm', correct, confident}  student-judged verdict
//
// Access model: notebook_entries has RLS enabled with NO policies — students
// never read it directly. Every query goes through the service client scoped
// by the session's airtable_student_id (the /app/marking pattern: the
// ownership filter IS the access control, and must never come from the client).
//
// Confidence (`confident`) is captured at the moment of answering, before any
// verdict is shown — confident-and-wrong is the misconception signal the whole
// notebook exists to catch, and it cannot be reconstructed after the reveal.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import {
  buildEntriesFromPapers, checkTypedAnswer, applyVerdict, entryKey, sgtToday,
} from '@/lib/notebook';
import { computeMastery } from '@/lib/mastery';
import { fullPortalVisible } from '@/lib/portal-beta';

export const dynamic = 'force-dynamic';

// Same window as /app/marking — the notebook is born from the same papers.
const MAX_RUNS = 40;
const RUN_COLUMNS =
  'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, pdf_url, released_at, result_json';
const MAX_ATTEMPTS_KEPT = 50;
const MAX_ANSWER_LEN = 300;

interface EntryRow {
  id: string;
  airtable_student_id: string;
  variant_qb_id: string | null;
  run_id: string;
  question_number: string;
  paper_name: string | null;
  paper_date: string | null;
  topic: string | null;
  awarded: number;
  max_marks: number;
  comment: string | null;
  slips: unknown;
  question_prompt: string | null;
  variant_question: string | null;
  variant_answer: string | null;
  variant_note: string | null;
  variant_origin: string | null;
  status: 'live' | 'archived';
  streak: number;
  next_due: string | null;
  attempts: unknown;
  archived_at: string | null;
}

type Attempt = {
  at: string;
  confident: boolean;
  answer: string | null;
  verdict: 'correct' | 'wrong';
  auto: boolean;
};

async function sessionStudentId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // portal_accounts RLS: a student can read their own row only.
  const { data } = await supabase
    .from('portal_accounts')
    .select('airtable_student_id')
    .eq('id', user.id)
    .single();
  return data?.airtable_student_id ?? null;
}

// The variant answer is deliberately NOT in the GET payload — the reveal
// happens in the POST response, after the attempt is committed.
// The reveal teaches, not just tells: when the twin came from the bank, fetch
// its full worked solution to show alongside the answer. Best-effort — a
// missing/failed lookup degrades to the answer-only reveal, never blocks it.
async function workedSolution(
  svc: ReturnType<typeof createServiceClient>,
  entry: EntryRow,
): Promise<string | null> {
  if (!entry.variant_qb_id) return null;
  try {
    const { data } = await svc
      .from('questions')
      .select('solution')
      .eq('id', entry.variant_qb_id)
      .single();
    const sol = typeof data?.solution === 'string' ? data.solution.trim() : '';
    return sol || null;
  } catch {
    return null;
  }
}

function toClient(e: EntryRow) {
  const attempts = (Array.isArray(e.attempts) ? e.attempts : []) as Attempt[];
  const last = attempts.length ? attempts[attempts.length - 1] : null;
  return {
    id: e.id,
    questionNumber: e.question_number,
    paperName: e.paper_name,
    paperDate: e.paper_date,
    topic: e.topic,
    awarded: e.awarded,
    maxMarks: e.max_marks,
    comment: e.comment,
    slips: Array.isArray(e.slips) ? (e.slips as string[]) : [],
    prompt: e.question_prompt,
    variantQuestion: e.variant_question,
    variantOrigin: e.variant_origin,
    hasVariantAnswer: !!e.variant_answer,
    status: e.status,
    streak: e.streak,
    nextDue: e.next_due,
    attemptCount: attempts.length,
    lastVerdict: last?.verdict ?? null,
    archivedAt: e.archived_at,
  };
}

export async function GET() {
  const sid = await sessionStudentId();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Beta gate mirrors the page: while the notebook is hidden, its data is too.
  // AFTER the auth check — the health-check probe reads anonymous 401 as healthy.
  if (!(await fullPortalVisible())) {
    return NextResponse.json({ error: 'Not available yet' }, { status: 403 });
  }

  const svc = createServiceClient();
  const today = sgtToday();

  const { data: runs, error: runsErr } = await svc
    .from('paper_marking_runs')
    .select(RUN_COLUMNS)
    .eq('student_id', sid)
    .not('released_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(MAX_RUNS);
  if (runsErr) return NextResponse.json({ error: 'Could not load papers' }, { status: 500 });

  const { data: existing, error: exErr } = await svc
    .from('notebook_entries')
    .select('*')
    .eq('airtable_student_id', sid);
  if (exErr) return NextResponse.json({ error: 'Could not load notebook' }, { status: 500 });

  const existingKeys = new Set(
    (existing ?? []).map(e => entryKey(e.run_id, e.question_number)),
  );
  const { papers } = buildStudentMarking((runs ?? []) as MarkingRunRow[]);
  const inserts = buildEntriesFromPapers(sid, papers, existingKeys, today);

  let rows = (existing ?? []) as EntryRow[];
  if (inserts.length) {
    // ignoreDuplicates makes a concurrent double-open race-safe (unique key
    // on student+run+question) — re-select rather than merging by hand.
    await svc.from('notebook_entries').upsert(inserts, {
      onConflict: 'airtable_student_id,run_id,question_number',
      ignoreDuplicates: true,
    });
    const { data: fresh } = await svc
      .from('notebook_entries')
      .select('*')
      .eq('airtable_student_id', sid);
    rows = (fresh ?? rows) as EntryRow[];
  }

  const live = rows
    .filter(e => e.status === 'live')
    .sort((a, b) =>
      String(a.next_due ?? '9999').localeCompare(String(b.next_due ?? '9999')) ||
      String(b.paper_date ?? '').localeCompare(String(a.paper_date ?? '')))
    .map(toClient);
  const archived = rows
    .filter(e => e.status === 'archived')
    .sort((a, b) => String(b.archived_at ?? '').localeCompare(String(a.archived_at ?? '')))
    .map(toClient);

  // The re-mark loop closes here: every recorded re-attempt (live OR archived
  // entry) feeds the same per-topic estimate the marked papers feed, so a win
  // in the notebook moves the topic's score the moment the page reloads.
  const mastery = computeMastery(
    papers,
    rows.map(e => ({ topic: e.topic, attempts: e.attempts })),
  );

  return NextResponse.json({
    today,
    dueCount: live.filter(e => e.nextDue !== null && e.nextDue <= today).length,
    live,
    archived,
    mastery,
  });
}

export async function POST(req: NextRequest) {
  const sid = await sessionStudentId();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await fullPortalVisible())) {
    return NextResponse.json({ error: 'Not available yet' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  const entryId = typeof body.entryId === 'string' ? body.entryId : '';
  const action = body.action === 'attempt' || body.action === 'confirm' ? body.action : null;
  const confident = body.confident;
  if (!entryId || !action) {
    return NextResponse.json({ error: 'entryId and action required' }, { status: 400 });
  }
  // Confidence is not optional — the tap is part of the answer.
  if (typeof confident !== 'boolean') {
    return NextResponse.json({ error: 'confident (boolean) required' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: entry } = await svc
    .from('notebook_entries')
    .select('*')
    .eq('id', entryId)
    .eq('airtable_student_id', sid) // ownership — see header
    .single<EntryRow>();
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (entry.status === 'archived') {
    return NextResponse.json({ error: 'Already conquered' }, { status: 409 });
  }

  const answer =
    typeof body.answer === 'string' ? body.answer.slice(0, MAX_ANSWER_LEN) : '';

  let verdict: 'correct' | 'wrong';
  let auto: boolean;
  if (action === 'attempt') {
    if (!entry.variant_answer) {
      return NextResponse.json(
        { error: 'This one has no checkable answer — use confirm' }, { status: 400 });
    }
    if (!answer.trim()) {
      return NextResponse.json({ error: 'answer required' }, { status: 400 });
    }
    const checked = checkTypedAnswer(answer, entry.variant_answer);
    if (checked === 'unclear') {
      // Not recorded: the student now sees the answer and judges — the
      // follow-up confirm call is what commits the attempt.
      return NextResponse.json({
        verdict: 'unclear',
        official: entry.variant_answer,
        officialSolution: await workedSolution(svc, entry),
        note: entry.variant_note,
      });
    }
    verdict = checked;
    auto = true;
  } else {
    if (typeof body.correct !== 'boolean') {
      return NextResponse.json({ error: 'correct (boolean) required' }, { status: 400 });
    }
    verdict = body.correct ? 'correct' : 'wrong';
    auto = false;
  }

  const today = sgtToday();
  const sched = applyVerdict(entry, verdict, today);
  const prior = (Array.isArray(entry.attempts) ? entry.attempts : []) as Attempt[];
  const attempts = [
    ...prior,
    { at: new Date().toISOString(), confident, answer: answer.trim() || null, verdict, auto },
  ].slice(-MAX_ATTEMPTS_KEPT);

  const { data: updated, error: upErr } = await svc
    .from('notebook_entries')
    .update({
      attempts,
      streak: sched.streak,
      status: sched.status,
      next_due: sched.next_due,
      archived_at: sched.status === 'archived' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entry.id)
    .eq('airtable_student_id', sid)
    .select()
    .single<EntryRow>();
  if (upErr || !updated) {
    return NextResponse.json({ error: 'Could not save attempt' }, { status: 500 });
  }

  return NextResponse.json({
    verdict,
    official: entry.variant_answer,
    officialSolution: await workedSolution(svc, entry),
    note: entry.variant_note,
    conquered: updated.status === 'archived',
    entry: toClient(updated),
  });
}
