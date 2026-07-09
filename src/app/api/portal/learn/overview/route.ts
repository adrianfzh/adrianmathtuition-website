// GET /api/portal/learn/overview
// Topics (in topic_spine order) for the caller's subjects, each with its units.
// Auth: portal student session (level/subject-scoped, approved units only) OR
// admin Bearer/session (all subjects, includes pending units flagged pending:true).
// When nothing is visible yet, falls back to the in-code fixture topic so the
// player is demonstrable on an empty table.
import { NextRequest, NextResponse } from 'next/server';
import { practiceAuth } from '@/lib/practice';
import { getSupabaseAdmin } from '@/lib/supabase';
import { studentTitle, ALL_LEARN_SUBJECTS, LEARN_SUBJECT_LABEL, learnSubjectsForLevel } from '@/lib/learn';
import { buildReviewList } from '@/lib/learn-review';
import { fixtureTopic } from '@/lib/learn-fixture';
import type { LearnTopic, UnitKind, UnitSummary } from '@/lib/learn-types';

export const runtime = 'nodejs';

type UnitRow = {
  id: string; subject: string; topic: string;
  unit_order: number; kind: string; title: string; status: string;
};

export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isStudent = caller.kind === 'student';
  const subjects = isStudent
    ? learnSubjectsForLevel(caller.account.level)
    : [...ALL_LEARN_SUBJECTS];

  const supabase = getSupabaseAdmin();

  const [{ data: spine }, unitRes, { data: meta }] = await Promise.all([
    supabase.from('topic_spine').select('subject, topic, spine_order').in('subject', subjects),
    (() => {
      let q = supabase
        .from('learning_units')
        .select('id, subject, topic, unit_order, kind, title, status')
        .in('subject', subjects);
      q = isStudent ? q.eq('status', 'approved') : q.in('status', ['approved', 'pending']);
      return q.order('unit_order');
    })(),
    // Strategy layer (curriculum-intelligence). Optional — harmless if the table
    // has no rows for these subjects. Powers default_order override + prereq/
    // weight/difficulty passthrough. Never fails the overview.
    supabase
      .from('topic_meta')
      .select('subject, topic, default_order, prerequisites, exam_weight, difficulty')
      .in('subject', subjects),
  ]);
  if (unitRes.error) return NextResponse.json({ error: unitRes.error.message }, { status: 500 });

  const spineOrder = new Map<string, number>();
  for (const s of spine || []) spineOrder.set(`${s.subject}|${s.topic}`, Number(s.spine_order));

  // topic_meta indexed by subject|topic → default_order override + passthrough.
  type MetaRow = {
    subject: string; topic: string; default_order: number | null;
    prerequisites: string[] | null; exam_weight: number | null; difficulty: number | null;
  };
  const metaByTopic = new Map<string, MetaRow>();
  for (const m of (meta || []) as MetaRow[]) metaByTopic.set(`${m.subject}|${m.topic}`, m);

  // Group units by subject|topic.
  const byTopic = new Map<string, LearnTopic>();
  for (const r of (unitRes.data || []) as UnitRow[]) {
    const key = `${r.subject}|${r.topic}`;
    if (!byTopic.has(key)) {
      byTopic.set(key, {
        subject: r.subject,
        topic: r.topic,
        spine_order: spineOrder.has(key) ? spineOrder.get(key)! : Math.floor(r.unit_order / 100),
        units: [],
      });
    }
    const summary: UnitSummary = {
      id: r.id, kind: r.kind as UnitKind, title: isStudent ? studentTitle(r.kind, r.title) : r.title,
      unit_order: Number(r.unit_order), status: r.status,
      ...(r.status !== 'approved' ? { pending: true } : {}),
    };
    byTopic.get(key)!.units.push(summary);
  }

  // Attach strategy-layer passthrough where a topic_meta row exists.
  for (const t of byTopic.values()) {
    const m = metaByTopic.get(`${t.subject}|${t.topic}`);
    if (!m) continue;
    if (Array.isArray(m.prerequisites)) t.prereqs = m.prerequisites;
    if (m.exam_weight != null) t.examWeight = m.exam_weight;
    if (m.difficulty != null) t.difficulty = m.difficulty;
  }

  // Order by topic_meta.default_order when present, else fall back to the spine.
  const effOrder = (t: LearnTopic): number => {
    const m = metaByTopic.get(`${t.subject}|${t.topic}`);
    return m && m.default_order != null ? Number(m.default_order) : t.spine_order;
  };
  let topics = [...byTopic.values()].sort(
    (a, b) => effOrder(a) - effOrder(b) || a.topic.localeCompare(b.topic),
  );

  // Empty state → seed the fixture so the experience is never a blank page.
  if (topics.length === 0) topics = [fixtureTopic()];

  // Weakness resurfacing strip (students only; degrades to []).
  const review = isStudent ? await buildReviewList(caller.account) : [];

  return NextResponse.json({
    subjects: subjects.map(s => ({ key: s, label: LEARN_SUBJECT_LABEL[s] || s })),
    topics,
    review,
  });
}
