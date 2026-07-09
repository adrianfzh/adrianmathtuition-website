// /api/admin/topic-meta — CRUD for the curriculum strategy layer (topic_meta).
//   GET    ?subject=BIO           → rows ordered by default_order
//   POST   {subject, topic, ...}  → upsert (partial patch; creates on first write)
//   DELETE {subject, topic}       → remove a row
// Admin-only (Bearer ADMIN_PASSWORD or signed admin session cookie).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildTopicMetaPatch, TOPIC_META_COLS } from '@/lib/topic-meta';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subject = new URL(req.url).searchParams.get('subject');
  if (!subject) return NextResponse.json({ error: 'subject required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('topic_meta')
    .select(TOPIC_META_COLS)
    .eq('subject', subject)
    .order('default_order', { ascending: true, nullsFirst: false })
    .order('topic', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  const subject = String(body.subject ?? '').trim();
  const topic = String(body.topic ?? '').trim();
  if (!subject || !topic) return NextResponse.json({ error: 'subject and topic required' }, { status: 400 });

  const row = {
    subject,
    topic,
    ...buildTopicMetaPatch(body),
    updated_at: new Date().toISOString(),
  };

  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('topic_meta')
    .upsert(row, { onConflict: 'subject,topic' })
    .select(TOPIC_META_COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  const subject = String(body.subject ?? '').trim();
  const topic = String(body.topic ?? '').trim();
  if (!subject || !topic) return NextResponse.json({ error: 'subject and topic required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  const { error } = await supa.from('topic_meta').delete().eq('subject', subject).eq('topic', topic);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
