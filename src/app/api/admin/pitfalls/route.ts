import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// Review queue for Supabase `pitfalls` — Adrian's curated traps.
//
// Why this exists: the table has carried a three-state `status`
// (pending/approved/rejected) since it was created, but nothing could ever
// write it, so every row sat at the 'pending' default and no consumer could
// safely read the table. Everything that reads it now filters
// status='approved' (the portal practice grader, create-teaching-notes,
// self-study-sheet), which makes this page the gate those consumers depend on.
//
// Only Adrian taps these buttons — the traps go out in his name.

type PitfallRow = {
  id: string;
  subject: string;
  topic: string;
  context: string;
  wrong_move: string;
  why_wrong: string;
  corrective_cue: string | null;
  source: string;
  status: string;
  created_at: string;
};

const STATUSES = ['pending', 'approved', 'rejected'] as const;
const PAGE_LIMIT = 400;

function shape(r: PitfallRow) {
  return {
    id: r.id,
    subject: r.subject,
    topic: r.topic,
    context: r.context,
    wrongMove: r.wrong_move,
    whyWrong: r.why_wrong,
    cue: r.corrective_cue,
    source: r.source,
    status: r.status,
    createdAt: r.created_at,
  };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get('auth') === 'check') return NextResponse.json({ ok: true });

  const status = url.searchParams.get('status') || 'pending';
  const source = url.searchParams.get('source') || '';
  const subject = url.searchParams.get('subject') || '';

  try {
    const supa = createServiceClient();

    let q = supa.from('pitfalls')
      .select('id, subject, topic, context, wrong_move, why_wrong, corrective_cue, source, status, created_at')
      .order('subject').order('topic').order('created_at')
      .limit(PAGE_LIMIT);
    if (status !== 'all') q = q.eq('status', status);
    if (source) q = q.eq('source', source);
    if (subject) q = q.eq('subject', subject);

    // Facets drive the filter chips AND tell Adrian how much is left to review.
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: allRows } = await supa.from('pitfalls').select('status, source, subject');
    const counts: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const bySubject: Record<string, number> = {};
    for (const r of (allRows || []) as { status: string; source: string; subject: string }[]) {
      counts[r.status] = (counts[r.status] || 0) + 1;
      if (r.status === 'pending') {
        bySource[r.source] = (bySource[r.source] || 0) + 1;
        bySubject[r.subject] = (bySubject[r.subject] || 0) + 1;
      }
    }

    return NextResponse.json({
      rows: ((data || []) as PitfallRow[]).map(shape),
      counts, bySource, bySubject,
      truncated: (data || []).length >= PAGE_LIMIT,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    // `ids` supports the whole-topic buttons; a single `id` is the common case.
    const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String)
      : body.id ? [String(body.id)] : [];
    const status = String(body.status || '');
    if (!ids.length) return NextResponse.json({ error: 'id or ids required' }, { status: 400 });
    if (!STATUSES.includes(status as typeof STATUSES[number])) {
      return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
    }

    const supa = createServiceClient();
    const { data, error } = await supa.from('pitfalls')
      .update({ status }).in('id', ids).select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, updated: (data || []).length, status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
