// /api/portal/my-notes — "Save to My Notes": clippings a student cuts out of
// their released marked papers (Adrian, 2026-08-27).
//
//   GET              the student's own clippings, newest first
//   POST             save one clipping: {runId?, sourceLabel, topic?, note?, image}
//                    (image = PNG data URL from the ✂️ clipper's canvas crop)
//   PATCH            edit the typed note on one clipping: {id, note}
//   DELETE ?id=      delete one clipping (Blob file + row)
//
// Access model — the /app/marking + notebook pattern: `portal_notes` has RLS
// enabled with NO policies, so students never touch it directly. Every query
// goes through the service client scoped by the session's
// airtable_student_id; that ownership filter IS the access control and must
// never come from the client. Deliberately NOT gated by the marking-only beta:
// clippings come from marked papers, which are in the beta allowlist.
//
// Probed by /api/health-check (`portal-my-notes`) — anonymous GET must 401.
import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import {
  parseCreatePayload,
  parseUpdatePayload,
  isPngBytes,
  isUuid,
  MAX_NOTES_PER_STUDENT,
  type MyNoteRow,
} from '@/lib/portal-notes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COLUMNS = 'id, run_id, source_label, topic, image_url, note, created_at';

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

export async function GET() {
  const sid = await sessionStudentId();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('portal_notes')
    .select(COLUMNS)
    .eq('airtable_student_id', sid)
    .order('created_at', { ascending: false })
    .limit(MAX_NOTES_PER_STUDENT);
  if (error) return NextResponse.json({ error: 'Could not load notes' }, { status: 500 });

  return NextResponse.json({ notes: (data ?? []) as MyNoteRow[] });
}

export async function POST(req: NextRequest) {
  const sid = await sessionStudentId();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const parsed = parseCreatePayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { runId, sourceLabel, topic, note, imageBase64 } = parsed.value;

  const bytes = Buffer.from(imageBase64, 'base64');
  if (!isPngBytes(bytes)) {
    return NextResponse.json({ error: 'image must be a PNG' }, { status: 400 });
  }

  const svc = createServiceClient();

  // Brake, not quota — see MAX_NOTES_PER_STUDENT.
  const { count } = await svc
    .from('portal_notes')
    .select('id', { count: 'exact', head: true })
    .eq('airtable_student_id', sid);
  if ((count ?? 0) >= MAX_NOTES_PER_STUDENT) {
    return NextResponse.json(
      { error: 'Notes limit reached — delete some old clippings first' }, { status: 400 });
  }

  // Keep the run linkage only when the run really is this student's. A
  // mismatch (or a run deleted since the page loaded) degrades to null — the
  // clipping itself is the value; the FK is `on delete set null` anyway.
  let verifiedRunId: string | null = null;
  if (runId) {
    const { data: run } = await svc
      .from('paper_marking_runs')
      .select('id')
      .eq('id', runId)
      .eq('student_id', sid)
      .maybeSingle();
    verifiedRunId = run ? runId : null;
  }

  const blob = await put(`portal-notes/${sid}/${crypto.randomUUID()}.png`, bytes, {
    access: 'public',
    contentType: 'image/png',
  });

  const { data: row, error } = await svc
    .from('portal_notes')
    .insert({
      airtable_student_id: sid,
      run_id: verifiedRunId,
      source_label: sourceLabel,
      topic,
      image_url: blob.url,
      note,
    })
    .select(COLUMNS)
    .single<MyNoteRow>();
  if (error || !row) {
    // Don't strand the freshly-uploaded file if the row never landed.
    try { await del(blob.url); } catch { /* best-effort */ }
    return NextResponse.json({ error: 'Could not save the clipping' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, note: row });
}

export async function PATCH(req: NextRequest) {
  const sid = await sessionStudentId();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const parsed = parseUpdatePayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data: row, error } = await svc
    .from('portal_notes')
    .update({ note: parsed.value.note })
    .eq('id', parsed.value.id)
    .eq('airtable_student_id', sid) // ownership — see header
    .select(COLUMNS)
    .maybeSingle<MyNoteRow>();
  if (error) return NextResponse.json({ error: 'Could not save the note' }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true, note: row });
}

export async function DELETE(req: NextRequest) {
  const sid = await sessionStudentId();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!isUuid(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const svc = createServiceClient();
  const { data: row } = await svc
    .from('portal_notes')
    .select('id, image_url, airtable_student_id')
    .eq('id', id)
    .maybeSingle<{ id: string; image_url: string | null; airtable_student_id: string }>();
  if (!row || row.airtable_student_id !== sid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Row first, Blob second (the /admin/papers order): an orphaned file is
  // invisible; a row pointing at a deleted file is a broken gallery tile.
  const { error: delErr } = await svc
    .from('portal_notes')
    .delete()
    .eq('id', id)
    .eq('airtable_student_id', sid);
  if (delErr) return NextResponse.json({ error: 'Could not delete' }, { status: 500 });

  if (row.image_url) {
    try { await del(row.image_url); }
    catch (e) { console.error('[my-notes] blob cleanup failed for', id, (e as Error).message); }
  }

  return NextResponse.json({ ok: true });
}
