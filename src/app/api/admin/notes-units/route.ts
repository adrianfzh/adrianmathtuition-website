// Review writes for /notes learning-unit blocks.
//
// Status vocabulary is the table's own CHECK constraint: pending | approved |
// rejected. The UI says "flag" for rejected — same state, reviewer's verb.
// Unflag returns a block to `pending` (not straight to approved): a block that
// was wrong enough to flag deserves a second read after the fix.

import { NextResponse } from 'next/server';
import { isNotesAuthed } from '@/lib/notes-auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  if (!(await isNotesAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const supa = getSupabaseAdmin();

  if (action === 'approve-topic') {
    const level = body?.level;
    const topic = body?.topic;
    if (typeof level !== 'string' || typeof topic !== 'string' || !level || !topic) {
      return NextResponse.json({ error: 'level and topic required' }, { status: 400 });
    }
    const { error, count } = await supa
      .from('learning_units')
      .update({ status: 'approved' }, { count: 'exact' })
      .eq('subject', level.toUpperCase())
      .eq('topic', topic)
      .eq('status', 'pending')
      // Checks never render on /notes, so approve-all must not sign them off
      // sight-unseen — they stay pending for the Learn player's own review.
      .neq('kind', 'check');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, approved: count ?? 0 });
  }

  if (action === 'flag' || action === 'unflag') {
    const id = body?.id;
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    // Unflagging also clears the review note: the note describes a problem, and
    // unflag is the assertion that the problem is gone. Flagging clears any
    // fix receipt — re-flagging a "fixed" block is Adrian disputing the fix.
    const cleared = await clearPayloadKey(
      supa,
      id,
      action === 'unflag' ? 'review_note' : 'fixed_note',
    );
    if (cleared) return cleared;
    const { error, count } = await supa
      .from('learning_units')
      .update({ status: action === 'flag' ? 'rejected' : 'pending' }, { count: 'exact' })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!count) return NextResponse.json({ error: 'unit not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // Adrian's on-page note on a flagged block: what's wrong, in his words.
  // Stored as payload.review_note; an empty note deletes the key.
  if (action === 'note') {
    const id = body?.id;
    const note = body?.note;
    if (typeof id !== 'string' || !id || typeof note !== 'string' || note.length > 4000) {
      return NextResponse.json({ error: 'id and note (≤4000 chars) required' }, { status: 400 });
    }
    const { data: row, error: readErr } = await supa
      .from('learning_units')
      .select('payload')
      .eq('id', id)
      .single();
    if (readErr || !row) return NextResponse.json({ error: 'unit not found' }, { status: 404 });
    const payload = { ...(row.payload as Record<string, unknown>) };
    if (note.trim()) payload.review_note = note.trim();
    else delete payload.review_note;
    const { error } = await supa.from('learning_units').update({ payload }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Adrian dismissing a green "✓ Fixed" strip: seen it, done with it.
  if (action === 'ack') {
    const id = body?.id;
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const cleared = await clearPayloadKey(supa, id, 'fixed_note');
    if (cleared) return cleared;
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

async function clearPayloadKey(
  supa: ReturnType<typeof getSupabaseAdmin>,
  id: string,
  key: 'review_note' | 'fixed_note',
) {
  const { data: row } = await supa.from('learning_units').select('payload').eq('id', id).single();
  if (!row) return NextResponse.json({ error: 'unit not found' }, { status: 404 });
  const payload = row.payload as Record<string, unknown>;
  if (key in payload) {
    const next = { ...payload };
    delete next[key];
    const { error } = await supa.from('learning_units').update({ payload: next }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return null;
}
