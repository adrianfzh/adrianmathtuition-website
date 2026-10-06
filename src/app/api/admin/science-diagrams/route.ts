import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// Review page for the curated science picture library (Supabase `science_diagrams`).
//
// The bot sends one of these after a science answer that needs a picture (apparatus,
// cells, anatomy, circuits). Since 6 Oct 2026 students only get a picture Adrian has
// approved here (`student_ok`); drawn graphs need no approval. Some pictures carry
// labels beyond O-Level (e.g. "pistil" for carpel) — that is what this page is for.

type Row = {
  id: string; name: string; subject: string; topic: string | null; kind: string;
  keywords: string | null; image_url: string; source: string | null;
  is_published: boolean; student_ok: boolean; reviewed_at: string | null;
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supa = createServiceClient();
  const { data, error } = await supa.from('science_diagrams')
    .select('id, name, subject, topic, kind, keywords, image_url, source, is_published, student_ok, reviewed_at')
    .order('subject').order('topic').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // What students needed and did not get (bot's ai/science-diagram.js logs every lookup to
  // science_diagram_requests since 6 Oct 2026): grouped by the picture asked for, last 60 days.
  const since = new Date(Date.now() - 60 * 86400_000).toISOString();
  const { data: reqs } = await supa.from('science_diagram_requests')
    .select('subject, kind, spec, outcome, created_at')
    .gte('created_at', since).in('outcome', ['miss', 'not-approved'])
    .order('created_at', { ascending: false }).limit(1000);
  const groups = new Map<string, { subject: string; kind: string; spec: string; outcome: string; count: number; last: string }>();
  for (const r of (reqs || []) as { subject: string; kind: string; spec: string; outcome: string; created_at: string }[]) {
    const key = `${r.subject}|${r.outcome}|${String(r.spec || '').toLowerCase().trim()}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { subject: r.subject, kind: r.kind, spec: r.spec, outcome: r.outcome, count: 1, last: r.created_at });
  }
  const missing = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 50);
  return NextResponse.json({ rows: (data || []) as Row[], missing });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 200) : [];
  if (!ids.length || typeof body.studentOk !== 'boolean') {
    return NextResponse.json({ error: 'ids[] and studentOk (boolean) are required' }, { status: 400 });
  }
  const supa = createServiceClient();
  const { error } = await supa.from('science_diagrams')
    .update({ student_ok: body.studentOk, reviewed_at: new Date().toISOString() })
    .in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: ids.length });
}
