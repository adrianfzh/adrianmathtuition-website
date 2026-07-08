import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// /admin/learn-review — approve / reject / edit interactive learning_units.
// Data lives in Supabase `learning_units` (subject, topic, unit_order real,
// kind, title, payload jsonb, status pending|approved|rejected). Students only
// ever see approved units in the portal player; this is Adrian's review gate.

type Status = 'pending' | 'approved' | 'rejected';
const ACTION_STATUS: Record<string, Status> = {
  approve: 'approved',
  reject: 'rejected',
  pending: 'pending',
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const subject = searchParams.get('subject') || '';
  const topic = searchParams.get('topic') || '';

  if (!subject) {
    return NextResponse.json({ error: 'subject required' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  // Topic-level view: full unit rows (including payload) for one topic.
  if (topic) {
    const { data, error } = await supa
      .from('learning_units')
      .select('id, subject, topic, unit_order, kind, title, payload, status, updated_at')
      .eq('subject', subject)
      .eq('topic', topic)
      .order('unit_order', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ units: data ?? [] });
  }

  // Subject-level view: distinct topics with counts by status.
  const { data, error } = await supa
    .from('learning_units')
    .select('topic, status')
    .eq('subject', subject);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byTopic: Record<string, { topic: string; pending: number; approved: number; rejected: number; total: number }> = {};
  for (const row of data ?? []) {
    const t = (row as { topic: string }).topic ?? '';
    const s = (row as { status: string }).status as Status;
    if (!byTopic[t]) byTopic[t] = { topic: t, pending: 0, approved: 0, rejected: 0, total: 0 };
    if (s === 'pending' || s === 'approved' || s === 'rejected') byTopic[t][s] += 1;
    byTopic[t].total += 1;
  }
  const topics = Object.values(byTopic).sort((a, b) => a.topic.localeCompare(b.topic));
  return NextResponse.json({ topics });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String(body.action ?? '');
  const supa = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Bulk approve every pending unit in a topic.
  if (action === 'approve_topic') {
    const subject = String(body.subject ?? '');
    const topic = String(body.topic ?? '');
    if (!subject || !topic) {
      return NextResponse.json({ error: 'subject and topic required' }, { status: 400 });
    }
    const { data, error } = await supa
      .from('learning_units')
      .update({ status: 'approved', updated_at: now })
      .eq('subject', subject)
      .eq('topic', topic)
      .eq('status', 'pending')
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
  }

  // Everything else is keyed on a single unit id.
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Edit title / payload; status unchanged.
  if (action === 'edit') {
    const payload = body.payload;
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'payload must be a JSON object' }, { status: 400 });
    }
    const update: Record<string, unknown> = { payload, updated_at: now };
    if (typeof body.title === 'string') update.title = body.title;
    const { data, error } = await supa
      .from('learning_units')
      .update(update)
      .eq('id', id)
      .select('id, subject, topic, unit_order, kind, title, payload, status, updated_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, unit: data });
  }

  // Status change: approve / reject / back-to-pending.
  const status = ACTION_STATUS[action];
  if (!status) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
  const { data, error } = await supa
    .from('learning_units')
    .update({ status, updated_at: now })
    .eq('id', id)
    .select('id, status, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, unit: data });
}
