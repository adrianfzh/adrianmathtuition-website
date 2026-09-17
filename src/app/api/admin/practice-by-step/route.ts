// /api/admin/practice-by-step — practice questions keyed by the MISSED STEP, not
// by topic or by text similarity (17 Sep 2026, Adrian: "do what you recommend").
//   GET ?level=EM&q=<the step in words>&limit=12
//        → { steps: [{id, name, topic, questions: n}], questions: [{id, school, year, paper,
//            question_number, total_marks, question_text, subgroup, has_image}] }
// How: the bank's sub-skill filing (`subgroups`, one per step a question exercises,
// `question_subgroups` linking questions to them) is searched by name for the step;
// the questions filed under the best-matching sub-skills come back, serving-eligible
// only (no AI-generated rows, no national rows, no legacy syllabus). The sheet
// worker calls this BEFORE searching by topic — a question filed under the step is
// one that exercises it; a question that merely shares the topic may not.
// Bearer ADMIN_PASSWORD or the admin session; anonymous → 401 (health-check probes it).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { searchTerms } from '@/lib/sheet-sections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LEVELS: Record<string, string[]> = { AM: ['S3_AM', 'S4_AM', 'AM'], EM: ['S3_EM', 'S4_EM', 'S4', 'S3', 'EM'], S1: ['S1'], S2: ['S2'], H2: ['JC1', 'JC2', 'H2'], H1: ['H1'] };

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const q = String(p.get('q') || '').trim();
  const level = String(p.get('level') || '').toUpperCase();
  const limit = Math.min(Math.max(Number(p.get('limit')) || 12, 1), 40);
  if (!q) return NextResponse.json({ error: 'q (the missed step, in words) is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const terms = searchTerms(q).split(' ').filter(Boolean);
  if (!terms.length) return NextResponse.json({ steps: [], questions: [] });
  // Sub-skills whose name carries the step's words: any word matches, ranked by
  // how many match. ILIKE per word keeps it simple and exact enough for a
  // table of a few thousand names.
  let sg = sb.from('subgroups').select('id, name, topic, level').or(terms.slice(0, 6).map(t => `name.ilike.%${t.replace(/[%,]/g, '')}%`).join(','));
  const levels = LEVELS[level];
  if (levels) sg = sg.in('level', levels);
  const { data: subs, error } = await sg.limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const scored = (subs ?? []).map(s => ({ ...s, hits: terms.filter(t => String(s.name).toLowerCase().includes(t)).length }))
    .filter(s => s.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 6);
  if (!scored.length) return NextResponse.json({ steps: [], questions: [] });
  const { data: links } = await sb.from('question_subgroups').select('question_id, subgroup_id, is_primary').in('subgroup_id', scored.map(s => s.id)).limit(400);
  const ids = [...new Set((links ?? []).map(l => l.question_id as string))];
  if (!ids.length) return NextResponse.json({ steps: scored.map(s => ({ id: s.id, name: s.name, topic: s.topic, questions: 0 })), questions: [] });
  const { data: qs } = await sb.from('questions')
    .select('id, school, year, paper, question_number, total_marks, question_text, has_image, level, topics')
    .in('id', ids).neq('school', 'AI Generated').eq('national', false).eq('legacy_syllabus', false).limit(limit * 3);
  const subOf = new Map((links ?? []).map(l => [l.question_id as string, scored.find(s => s.id === l.subgroup_id)?.name || '']));
  const questions = (qs ?? []).slice(0, limit).map(x => ({ ...x, question_text: String(x.question_text || '').slice(0, 1200), subgroup: subOf.get(x.id as string) || '' }));
  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.subgroup_id as string, (counts.get(l.subgroup_id as string) || 0) + 1);
  return NextResponse.json({ steps: scored.map(s => ({ id: s.id, name: s.name, topic: s.topic, questions: counts.get(s.id) || 0 })), questions });
}
