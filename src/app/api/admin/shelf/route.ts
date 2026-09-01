// /api/admin/shelf — 🧺 the student shelf: topics deliberately deferred from a
// teaching round ("wave 2 waiting"), each carrying the evidence needed to pick
// the next wave without re-diagnosing anything (IDEAS.md design agreed
// 2026-08-30; SPEC-TEACHING-CYCLE step 4).
//
//   GET  ?studentId=recXXX  → { shelf: { waiting, started, done } }   one student
//   GET                     → { shelf: { … } }                        across students
//   POST { studentId, topic, skill_label, evidence?, … }              shelve directly
//   POST { fromRun: { runId, questionNumber }, topic?, skill_label? } shelve off a
//        marked run — the server grabs that question's prompt, part scores and
//        annotated page URL from the run's own result_json (the 🧺 buttons in
//        /admin/mark/triage and /admin/papers send this shape)
//   PATCH { id, action: 'start' | 'done' | 'reopen' }                 status moves
//   PATCH { id, action: 'edit', skill_label }                         rename the skill
//   DELETE ?id=                                                      remove outright
//
// Admin-only, service-role (RLS on, zero policies): the shelf is Adrian's
// planning surface and is never visible to a student. Shape/state logic lives
// in lib/shelf.ts (pure, tested) — never inline here.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  parseEvidence, groupShelf, applyShelfAction, extractQuestionEvidence,
  defaultSkillLabel, type ShelfEvidence,
} from '@/lib/shelf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const studentId = req.nextUrl.searchParams.get('studentId');
  const sb = getSupabaseAdmin();
  let q = sb.from('student_shelf').select('*')
    .order('created_at', { ascending: false })
    .limit(studentId ? 100 : 120);
  if (studentId) q = q.eq('airtable_student_id', studentId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shelf: groupShelf(data ?? []) });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const fromRun = body.fromRun as { runId?: unknown; questionNumber?: unknown } | undefined;
  if (fromRun && typeof fromRun === 'object') return shelveFromRun(fromRun, body);

  // ── direct creation: the caller supplies everything, evidence validated ────
  const studentId = String(body.studentId ?? '').trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(studentId)) {
    return NextResponse.json({ error: 'studentId must be an Airtable record id' }, { status: 400 });
  }
  const topic = String(body.topic ?? '').trim().slice(0, 120);
  if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 });
  const skill_label = String(body.skill_label ?? '').trim().slice(0, 200);
  if (!skill_label) return NextResponse.json({ error: 'skill_label is required' }, { status: 400 });

  const parsed = parseEvidence(body.evidence);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  return insertEntry({
    airtable_student_id: studentId,
    student_name: String(body.studentName ?? '').slice(0, 120),
    topic,
    skill_label,
    evidence: parsed.evidence,
    source_run_id: UUID_RE.test(String(body.sourceRunId ?? '')) ? String(body.sourceRunId) : null,
    paper_name: String(body.paperName ?? '').slice(0, 160),
    marks_lost: Number.isFinite(Number(body.marksLost)) ? Math.round(Number(body.marksLost)) : null,
    note: body.note ? String(body.note).slice(0, 600) : null,
  });
}

/** The 🧺 button's door: evidence auto-grabbed from the run's result_json. */
async function shelveFromRun(fromRun: { runId?: unknown; questionNumber?: unknown }, body: Record<string, unknown>) {
  const runId = String(fromRun.runId ?? '');
  const questionNumber = String(fromRun.questionNumber ?? '').trim();
  if (!UUID_RE.test(runId)) return NextResponse.json({ error: 'fromRun.runId must be a run id' }, { status: 400 });
  if (!questionNumber) return NextResponse.json({ error: 'fromRun.questionNumber is required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: run, error } = await sb.from('paper_marking_runs')
    .select('id, paper_name, student_id, student_name, result_json')
    .eq('id', runId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
  if (!run.student_id) {
    return NextResponse.json({ error: 'this run has no student tagged — tag it first, then shelve' }, { status: 400 });
  }

  const grabbed = extractQuestionEvidence(run.result_json, questionNumber);
  if (!grabbed) return NextResponse.json({ error: `Q${questionNumber} is not in this run's marking` }, { status: 404 });

  // Same question, same run, still on the shelf → say so instead of stacking.
  const { data: siblings } = await sb.from('student_shelf')
    .select('id, evidence').eq('source_run_id', runId).in('status', ['waiting', 'started']);
  const dup = (siblings ?? []).find(s =>
    (Array.isArray(s.evidence) ? (s.evidence as ShelfEvidence[]) : [])
      .some(e => String(e?.question_number ?? '') === grabbed.evidence.question_number));
  if (dup) return NextResponse.json({ error: 'already on the shelf', id: dup.id }, { status: 409 });

  const topic = String(body.topic ?? '').trim().slice(0, 120) || grabbed.topic || `Q${grabbed.evidence.question_number}`;
  const skill_label = String(body.skill_label ?? '').trim().slice(0, 200)
    || defaultSkillLabel(grabbed.evidence, grabbed.topic);

  return insertEntry({
    airtable_student_id: run.student_id,
    student_name: run.student_name ?? '',
    topic,
    skill_label,
    evidence: [grabbed.evidence],
    source_run_id: run.id,
    paper_name: run.paper_name ?? '',
    marks_lost: grabbed.lost,
    note: body.note ? String(body.note).slice(0, 600) : null,
  });
}

async function insertEntry(row: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin().from('student_shelf')
    .insert(row).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { id?: string; action?: string; skill_label?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: row, error: readErr } = await sb.from('student_shelf')
    .select('id, status').eq('id', body.id).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const r = applyShelfAction(row, String(body.action ?? ''), body.skill_label);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  const { data, error } = await sb.from('student_shelf')
    .update(r.patch).eq('id', body.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await getSupabaseAdmin().from('student_shelf').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
