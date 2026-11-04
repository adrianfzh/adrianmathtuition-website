// /api/admin/traps — 🪤 the questions most students lose marks on (4 Nov 2026, Adrian: "it should
// also be able to classify a question that most students make mistakes"). Admin-only.
// GET [?all=1] → { rows } — `question_traps` rows marked is_trap (or every counted question with
// ?all=1), most-missed first, each with its bank question's level, topic, source and opening.
// Filled nightly by /api/cron/math-practice-difficulty (lib/question-traps.ts).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type TrapListRow = {
  question_id: string; students: number; lost: number; kind: string | null; kind_students: number; part_label: string | null;
  from_papers: number; from_practice: number; is_trap: boolean; updated_at: string;
  questions: { level: string | null; topics: string[] | null; school: string | null; year: number | null; paper: string | null; question_number: string | null; difficulty: string | null; question_text: string | null } | null;
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const all = req.nextUrl.searchParams.get('all') === '1';
  let q = getSupabaseAdmin().from('question_traps')
    .select('question_id, students, lost, kind, kind_students, part_label, from_papers, from_practice, is_trap, updated_at, questions(level, topics, school, year, paper, question_number, difficulty, question_text, parts)')
    .order('lost', { ascending: false }).order('students', { ascending: false }).limit(300);
  if (!all) q = q.eq('is_trap', true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // The opening: the stem, or part (a)'s text when the stem is empty (many school questions).
  type Raw = TrapListRow & { questions: (TrapListRow['questions'] & { parts?: { text?: string }[] | null }) | null };
  const rows = ((data ?? []) as unknown as Raw[]).map(({ questions: q, ...r }) => {
    const opening = (q?.question_text || (Array.isArray(q?.parts) ? q.parts[0]?.text : '') || '').slice(0, 240);
    return { ...r, questions: q ? { level: q.level, topics: q.topics, school: q.school, year: q.year, paper: q.paper, question_number: q.question_number, difficulty: q.difficulty, question_text: opening } : null };
  });
  rows.sort((a, b) => b.lost / b.students - a.lost / a.students || b.students - a.students);
  return NextResponse.json({ rows });
}
