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
      .eq('status', 'pending');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, approved: count ?? 0 });
  }

  if (action === 'flag' || action === 'unflag') {
    const id = body?.id;
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const { error, count } = await supa
      .from('learning_units')
      .update({ status: action === 'flag' ? 'rejected' : 'pending' }, { count: 'exact' })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!count) return NextResponse.json({ error: 'unit not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
