// GET/POST /api/cron/practice-topup — keeps the kiosk/practice pools stocked.
// For each (level, topic) with fewer than TARGET verified practice questions,
// enqueues generation_requests (requested_by 'admin-topup' — within the Fly
// worker's allowed prefixes; each request runs the full 4-gate verification).
// Bounded per run so cost/wall-clock stay predictable; runs nightly via cron.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOPUP_LEVELS: Record<string, { seedLevels: string[]; poolLevels: string[] }> = {
  AM: { seedLevels: ['AM', 'S3_AM'], poolLevels: ['AM'] },
  // EM/JC join the pilot once AM proves out:
  // EM: { seedLevels: ['EM', 'S3_EM'], poolLevels: ['EM'] },
};
const TARGET = 20;          // desired verified questions per (level, topic)
const PER_TOPIC_CAP = 3;    // max requests enqueued per topic per run
const MAX_ENQUEUE = 12;     // max requests enqueued per run (bounds nightly cost)
const QUEUE_BACKOFF = 15;
// Topics whose bank questions all carry diagrams but whose MATH is text-safe —
// these may seed from KB worked examples. Genuinely figure-dependent topics
// (Plane Geometry, Integration (Area)) stay curated-only until diagram
// generation exists.
const TEXT_FALLBACK_TOPICS = new Set(['Modulus Functions', 'Trigonometry (R-Formula)']);   // skip run if this many requests already waiting

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  if (process.env.ADMIN_PASSWORD && auth === `Bearer ${process.env.ADMIN_PASSWORD}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supa = getSupabaseAdmin();

  // Backoff if the generation queue is already busy — never pile up.
  const { count: queued } = await supa
    .from('generation_requests')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'claimed']);
  if ((queued ?? 0) >= QUEUE_BACKOFF) {
    return NextResponse.json({ ok: true, skipped: `queue busy (${queued} waiting)` });
  }

  const report: { level: string; topic: string; have: number; enqueued: number }[] = [];
  let budget = MAX_ENQUEUE - (queued ?? 0);

  for (const [level, cfg] of Object.entries(TOPUP_LEVELS)) {
    if (budget <= 0) break;
    const { data: topicRows } = await supa
      .from('subgroups').select('topic').eq('level', level);
    const topics = [...new Set((topicRows || []).map(r => r.topic as string))];

    for (const topic of topics) {
      if (budget <= 0) break;
      const { count: have } = await supa
        .from('practice_questions')
        .select('id', { count: 'exact', head: true })
        .in('level', cfg.poolLevels).eq('topic', topic).eq('verified', true);
      if ((have ?? 0) >= TARGET) continue;

      const need = Math.min(PER_TOPIC_CAP, TARGET - (have ?? 0), budget);
      // Seeds: real, solved, diagram-free bank questions of this topic.
      const { data: seeds } = await supa
        .from('questions')
        .select('id')
        .in('level', cfg.seedLevels)
        .overlaps('topics', [topic])
        .eq('has_image', false)
        .is('deleted_at', null)
        .not('solution', 'is', null)
        .limit(30);
      let rows: Record<string, unknown>[] = [];
      if (seeds?.length) {
        const picked = seeds.sort(() => Math.random() - 0.5).slice(0, need);
        rows = picked.map(s => ({
          source_question_id: s.id,
          similarity_level: 'similar',
          count: 1,
          requested_by: 'admin-topup',
          status: 'pending',
          generated_ids: [] as string[],
        }));
      } else if (TEXT_FALLBACK_TOPICS.has(topic)) {
        // No diagram-free bank seeds — seed from Adrian's ingested worked
        // examples instead (kb_entries text; the 4 gates still verify output).
        const { data: kb } = await supa
          .from('kb_entries')
          .select('content')
          .eq('subject', level).eq('topic', topic).eq('section_type', 'example')
          .not('is_current', 'is', false)
          .limit(20);
        const exs = (kb || []).filter(k => (k.content || '').length > 80);
        if (!exs.length) { report.push({ level, topic, have: have ?? 0, enqueued: 0 }); continue; }
        rows = exs.sort(() => Math.random() - 0.5).slice(0, need).map(k => ({
          source_text: (k.content as string).slice(0, 4000),
          similarity_level: 'similar',
          count: 1,
          requested_by: 'admin-topup',
          status: 'pending',
          generated_ids: [] as string[],
        }));
      } else {
        report.push({ level, topic, have: have ?? 0, enqueued: 0 }); continue;
      }
      const { error } = await supa.from('generation_requests').insert(rows);
      if (!error) {
        budget -= rows.length;
        report.push({ level, topic, have: have ?? 0, enqueued: rows.length });
      }
    }
  }

  const total = report.reduce((a, r) => a + r.enqueued, 0);
  return NextResponse.json({ ok: true, enqueued: total, lowTopics: report.filter(r => r.have < TARGET) });
}

export const POST = GET;
