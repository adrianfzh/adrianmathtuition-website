// GET /api/portal/curriculum
// Read-only strategy-layer metadata (topic_meta) for the caller's subjects.
// Exists so the portal can later wire readiness hints from the prerequisite DAG;
// today it just makes the data available. Degrades to an empty list.
// Auth: portal student session (subject-scoped) OR admin Bearer/session (all).
import { NextRequest, NextResponse } from 'next/server';
import { practiceAuth } from '@/lib/practice';
import { getSupabaseAdmin } from '@/lib/supabase';
import { learnSubjectsForLevel } from '@/lib/learn';
import { CURRICULUM_SUBJECTS, TOPIC_META_COLS } from '@/lib/topic-meta';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subjects = caller.kind === 'student'
    ? learnSubjectsForLevel(caller.account.level)
    : CURRICULUM_SUBJECTS.map(s => s.key);

  if (subjects.length === 0) return NextResponse.json({ rows: [] });

  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('topic_meta')
    .select(TOPIC_META_COLS)
    .in('subject', subjects)
    .order('subject', { ascending: true })
    .order('default_order', { ascending: true, nullsFirst: false })
    .order('topic', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}
