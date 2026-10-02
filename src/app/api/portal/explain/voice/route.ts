// POST /api/portal/explain/voice  { runId, q }  →  { urls: (string|null)[] }
//
// The voice of the one-minute explanation (1 Oct 2026): one canonical file URL
// per beat of the question's script, in flattened scene order, null where a
// beat has no clip. Rebuilds the script exactly as the page does
// (buildStudentMarking → the question → buildExplainScript), then
// lib/explain-voice-store ensureVoice makes what the bucket does not have.
// Same access rule as /app/marking/[id]/explain/[q]: the logged-in student's
// own RELEASED run, or Adrian's admin cookie — and the explanation's own
// switch (explainClipVisible). Anonymous → 401 (the health-check probes this).
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { explainClipVisible, viewingAsStudent } from '@/lib/portal-beta';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import { buildExplainScript, canExplain } from '@/lib/explain-clip';
import { ensureVoice } from '@/lib/explain-voice-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // up to ~12 TTS calls, four in flight

const COLUMNS = 'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, photos_pdf_url, pdf_url, released_at, result_json, student_label, student_starred_at, student_archived_at, student_note, paper_subject, superseded_by, subject, student_id';

export async function POST(req: NextRequest) {
  const isAdmin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value) && !(await viewingAsStudent());
  const account = isAdmin ? null : await sessionAccount();
  if (!isAdmin && !account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const runId = String(body.runId ?? '').trim();
  const qn = String(body.q ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  if (!qn || qn.length > 24) return NextResponse.json({ error: 'q is required' }, { status: 400 });

  let query = getSupabaseAdmin().from('paper_marking_runs').select(COLUMNS).eq('id', runId).not('released_at', 'is', null);
  if (!isAdmin) query = query.eq('student_id', portalIdentity(account!));
  const { data: row } = await query.maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sid = isAdmin ? String((row as { student_id?: string | null }).student_id ?? '') : portalIdentity(account!);
  if (!(await explainClipVisible(sid))) return NextResponse.json({ error: 'Not open yet' }, { status: 403 });

  const { papers } = buildStudentMarking([row as unknown as MarkingRunRow]);
  const question = papers[0]?.questions.filter(x => x.questionNumber === qn).find(canExplain) ?? null;
  const script = question ? buildExplainScript(question, runId) : null;
  if (!script) return NextResponse.json({ error: 'Nothing to explain' }, { status: 404 });

  const { urls, made, failed } = await ensureVoice(runId, qn, script);
  // The reasons ride along (an HTTP status, a quota line — nothing personal) so a silent clip can be read off the response.
  return NextResponse.json({ urls, made, failed });
}
