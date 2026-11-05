// 👪 The note to the parent after a shared-board lesson (SPEC-TUTOR-TOOLS §8; Adrian, 6 Nov 2026: "summary would
// be a good thing to send to parents" → "yes"). The TUTOR only — the parent is the tutor's customer, so the note
// goes from the tutor's own WhatsApp and we never hold the parent's number.
//   GET  ?id=<board>                                   the note (if any) and its private read-only link
//   POST { id, op: 'make' }                            write it from the board (lib/board-summary-store makeParentNote)
//   POST { id, op: 'save', worked, watch, help }       the tutor's edits
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { makeParentNote } from '@/lib/board-summary-store';
import { PARENT_FIELD_MAX, type ParentNote } from '@/lib/board-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const UUID = /^[0-9a-f-]{36}$/i;
const linkOf = (req: Request, key: string | null) => (key ? `${new URL(req.url).origin}/p/${key}` : null);

async function own(id: string | undefined | null) {
  const tutor = await currentTutor();
  if (!tutor) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (!id || !UUID.test(id)) return { error: NextResponse.json({ error: 'board is required' }, { status: 400 }) };
  const { data } = await getSupabaseAdmin().from('shared_boards').select('id, parent_note, parent_key').eq('id', id).eq('tutor_id', tutor.id).maybeSingle();
  if (!data) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  return { tutor, board: data as { id: string; parent_note: ParentNote | null; parent_key: string | null } };
}

export async function GET(req: Request) {
  const o = await own(new URL(req.url).searchParams.get('id'));
  if ('error' in o) return o.error;
  return NextResponse.json({ note: o.board.parent_note, link: linkOf(req, o.board.parent_key) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { id?: string; op?: string; worked?: unknown; watch?: unknown; help?: unknown };
  const o = await own(body.id);
  if ('error' in o) return o.error;
  const sb = getSupabaseAdmin();
  const key = o.board.parent_key ?? randomBytes(18).toString('base64url');
  let note: ParentNote | null;
  if (body.op === 'make') {
    note = await makeParentNote(o.board.id).catch(e => { console.error('[parent note]', (e as Error).message); return null; });
    if (!note) return NextResponse.json({ error: 'Could not write the note — is there maths on the board yet? Try again in a minute.' }, { status: 502 });
  } else if (body.op === 'save') {
    const f = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, PARENT_FIELD_MAX) : '');
    const worked = f(body.worked), watch = f(body.watch), help = f(body.help);
    if (!worked || !watch || !help) return NextResponse.json({ error: 'Fill in all three parts.' }, { status: 400 });
    note = { ...(o.board.parent_note ?? { at: new Date().toISOString() }), worked, watch, help, edited: true };
  } else return NextResponse.json({ error: 'unknown' }, { status: 400 });
  const { error } = await sb.from('shared_boards').update({ parent_note: note, parent_key: key }).eq('id', o.board.id);
  if (error) return NextResponse.json({ error: 'Could not save the note — try again.' }, { status: 500 });
  return NextResponse.json({ note, link: linkOf(req, key) });
}
