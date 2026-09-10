// /api/portal/notebook/private-notes — the student's own typed notes in My
// Notebook (SPEC-NOTEBOOK-V2 §8, 11 Sep 2026: "enforce highest privacy").
//
//   GET          the student's notes, newest first
//   POST {body}  write one
//   PATCH {id, body}
//   DELETE {id}
//
// Privacy, by construction: the only key is the session's own portal identity
// (rec… / acct:<uuid>, lib/portal-auth portalIdentity) — there is no admin
// door, no bearer path, no "view as" path, and no AI feature reads the table
// (no OCR, no auto-tag, no resurfacing; search is the client's own matching).
// `notebook_private_notes` has RLS on with no policies: the service client
// carries the identity predicate in every query, so a bug that dropped the
// predicate would still read nothing through the anon key.
//
// Probed by /api/health-check (`notebook-private-notes`): anonymous GET → 401.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import {
  MAX_PRIVATE_NOTES, PRIVATE_NOTE_COLUMNS, isPrivateNoteId, parsePrivateNoteBody, parsePrivateNoteUpdate,
  type PrivateNoteRow,
} from '@/lib/notebook-private-notes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function identity(): Promise<string | null> {
  const account = await sessionAccount().catch(() => null);
  return account ? portalIdentity(account) : null;
}

async function readJson(req: NextRequest): Promise<unknown> {
  try { return await req.json(); } catch { return null; }
}

export async function GET() {
  const sid = await identity();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await createServiceClient().from('notebook_private_notes')
    .select(PRIVATE_NOTE_COLUMNS).eq('airtable_student_id', sid)
    .order('created_at', { ascending: false }).limit(MAX_PRIVATE_NOTES);
  if (error) return NextResponse.json({ error: 'Could not load your notes' }, { status: 500 });
  return NextResponse.json({ notes: (data ?? []) as PrivateNoteRow[] });
}

export async function POST(req: NextRequest) {
  const sid = await identity();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await readJson(req);
  const parsed = parsePrivateNoteBody((body as { body?: unknown } | null)?.body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { count } = await svc.from('notebook_private_notes').select('id', { count: 'exact', head: true }).eq('airtable_student_id', sid);
  if ((count ?? 0) >= MAX_PRIVATE_NOTES) {
    return NextResponse.json({ error: 'That is a lot of notes — delete a few old ones first' }, { status: 400 });
  }
  const { data, error } = await svc.from('notebook_private_notes')
    .insert({ airtable_student_id: sid, body: parsed.value })
    .select(PRIVATE_NOTE_COLUMNS).single<PrivateNoteRow>();
  if (error || !data) return NextResponse.json({ error: 'Could not save the note' }, { status: 500 });
  return NextResponse.json({ ok: true, note: data });
}

export async function PATCH(req: NextRequest) {
  const sid = await identity();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = parsePrivateNoteUpdate(await readJson(req));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await createServiceClient().from('notebook_private_notes')
    .update({ body: parsed.value.body, updated_at: new Date().toISOString() })
    .eq('id', parsed.value.id).eq('airtable_student_id', sid)
    .select(PRIVATE_NOTE_COLUMNS).maybeSingle<PrivateNoteRow>();
  if (error) return NextResponse.json({ error: 'Could not save the note' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, note: data });
}

export async function DELETE(req: NextRequest) {
  const sid = await identity();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await readJson(req)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : req.nextUrl.searchParams.get('id') ?? '';
  if (!isPrivateNoteId(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { data, error } = await createServiceClient().from('notebook_private_notes')
    .delete().eq('id', id).eq('airtable_student_id', sid).select('id');
  if (error) return NextResponse.json({ error: 'Could not delete' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
