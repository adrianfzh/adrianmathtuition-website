// POST /api/admin/lessons/propose
// AI lesson proposal: reads the candidate bank questions for a topic scope and proposes
// which become worked EXAMPLES (one per concept, optionally a second when the method
// genuinely differs) and which become PRACTICE (coverage-first: every concept on the
// checklist must be exercised; flags gaps when the bank is thin).
//
// Body: {
//   level: string, topics: string[],
//   questionIds: string[],          // candidate pool — the client's current filtered bank list
//   rejectedIds?: string[],         // previously rejected; still considered but flagged
// }
// Returns: {
//   concepts: string[],             // checklist used (from lesson_concepts, merged across topics)
//   suggestedConcepts: string[],    // AI-suggested additions not on the checklist
//   examples: Array<{ question_id, concept, parts: string[] | null, rationale, alt_method?: boolean, previously_rejected?: boolean }>,
//   practice: Array<{ question_id, concepts: string[], parts: string[] | null, previously_rejected?: boolean }>,
//   gaps: Array<{ concept, note }>,
// }
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 180;

const SYSTEM = `You are curating a Singapore math revision lesson for a tuition teacher (the questions come from his exam-paper question bank).

You receive:
1. A CONCEPT CHECKLIST — the sub-skills this topic's notes must teach.
2. A numbered list of CANDIDATE QUESTIONS (id, source, marks, question text with parts, whether a worked solution exists).

Your job — exactly like an experienced teacher assembling topic notes:

EXAMPLES — for each checklist concept pick the ONE question (or PART of a question) that most cleanly illustrates the method:
- Prefer questions with complete worked solutions, moderate marks, a clean setup that showcases the standard method without unusual twists.
- You may pick a SUBSET of parts when only some parts illustrate the concept (e.g. ["a","b"]). Use null for the whole question.
- When a concept has TWO genuinely different standard methods (not just harder numbers), you may propose a SECOND example for it with "alt_method": true and say in the rationale what the second method is.
- One-line rationale each, written for the teacher ("cleanest two-curve discriminant setup; (c) drifts into max/min").

PRACTICE — choose a set whose UNION exhaustively covers EVERY checklist concept. Coverage completeness is the goal, NOT a difficulty ladder:
- Tag each pick with the concept(s) it exercises.
- Prefer questions that are NOT near-duplicates of the chosen examples.
- Multi-concept questions are good — they keep the set compact while exhaustive.
- A concept already covered may still get a second practice question if the question adds a distinct variation; don't pad beyond that.

GAPS — if no suitable practice (or example) exists for a concept, report it under "gaps" with a short note. NEVER force a bad fit.

SUGGESTED CONCEPTS — if the candidate questions clearly exercise a recurring sub-skill that is MISSING from the checklist, list it under "suggestedConcepts" (and you may use it for picks).

PREVIOUSLY REJECTED ids (if provided) may still be proposed when nothing better exists, but mark them "previously_rejected": true.

OUTPUT — return ONLY a JSON object, no fences, no commentary:
{"examples":[{"question_id":"...","concept":"...","parts":["a","b"]|null,"rationale":"...","alt_method":false,"previously_rejected":false}],
 "practice":[{"question_id":"...","concepts":["..."],"parts":null,"previously_rejected":false}],
 "suggestedConcepts":["..."],
 "gaps":[{"concept":"...","note":"..."}]}
Use ONLY question_ids from the candidate list. Use ONLY part labels that exist on that question.`;

type PartLike = { label?: string; text?: string; marks?: number; solution?: string; subparts?: PartLike[] };

function questionBrief(q: Record<string, unknown>, idx: number): string {
  const parts = (Array.isArray(q.parts) ? q.parts : []) as PartLike[];
  const hasSol = !!(q.solution) || parts.some(p => p?.solution || (p?.subparts ?? []).some(s => s?.solution));
  const lines: string[] = [];
  lines.push(`#${idx} id=${q.id} [${q.school} ${q.year} P${q.paper} Q${q.question_number}] ${q.total_marks ?? '?'}m solution=${hasSol ? 'yes' : 'NO'}`);
  if (q.question_text) lines.push(String(q.question_text));
  for (const p of parts) {
    if (!p) continue;
    if (p.label || p.text) lines.push(`(${p.label ?? '?'}) ${p.text ?? ''}${p.marks ? ` [${p.marks}m]` : ''}`);
    for (const sp of (p.subparts ?? [])) {
      lines.push(`(${p.label ?? '?'})(${sp.label ?? '?'}) ${sp.text ?? ''}${sp.marks ? ` [${sp.marks}m]` : ''}`);
    }
  }
  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { level?: string; topics?: string[]; questionIds?: string[]; rejectedIds?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { level, topics, questionIds, rejectedIds = [] } = body;
  if (!level || !Array.isArray(topics) || topics.length === 0 || !Array.isArray(questionIds) || questionIds.length === 0) {
    return NextResponse.json({ error: 'level, topics, questionIds required' }, { status: 400 });
  }
  if (questionIds.length > 400) {
    return NextResponse.json({ error: 'too many candidates (max 400) — narrow your bank filters first' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  // Concept checklist: union across the lesson's topics; AI infers if none stored.
  const { data: conceptRows } = await supa
    .from('lesson_concepts').select('topic, concepts')
    .eq('level', level).in('topic', topics);
  const checklist: string[] = [];
  for (const r of conceptRows ?? []) for (const c of (r.concepts ?? [])) if (!checklist.includes(c)) checklist.push(c);

  // Candidate questions (full text + parts; solutions only as a presence flag to keep tokens sane).
  const { data: qs, error } = await supa
    .from('questions')
    .select('id, school, year, paper, question_number, question_text, parts, solution, total_marks, has_image')
    .in('id', questionIds.slice(0, 400));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!qs || qs.length === 0) return NextResponse.json({ error: 'no candidate questions found' }, { status: 400 });

  const briefs = qs.map((q, i) => questionBrief(q as Record<string, unknown>, i + 1)).join('\n\n---\n\n');
  const checklistBlock = checklist.length > 0
    ? `CONCEPT CHECKLIST (${level} / ${topics.join(' + ')}):\n- ${checklist.join('\n- ')}`
    : `CONCEPT CHECKLIST: none stored for this topic — infer the sub-skill checklist from the questions yourself and return ALL inferred concepts under "suggestedConcepts".`;
  const rejectedBlock = rejectedIds.length > 0
    ? `\n\nPREVIOUSLY REJECTED question ids:\n${rejectedIds.join(', ')}` : '';

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `${checklistBlock}${rejectedBlock}\n\nCANDIDATE QUESTIONS (${qs.length}):\n\n${briefs}`,
    }],
  });

  const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    return NextResponse.json({ error: 'AI returned no JSON', raw: text.slice(0, 500) }, { status: 502 });
  }
  let proposal: Record<string, unknown>;
  try { proposal = JSON.parse(text.slice(jsonStart, jsonEnd + 1)); }
  catch { return NextResponse.json({ error: 'AI returned invalid JSON', raw: text.slice(0, 500) }, { status: 502 }); }

  // Validate ids and part labels against the real questions; drop anything bogus.
  const byId = new Map(qs.map(q => [q.id as string, q]));
  const partLabels = (q: Record<string, unknown>): Set<string> => {
    const out = new Set<string>();
    for (const p of ((q.parts ?? []) as PartLike[])) {
      if (p?.label) out.add(p.label);
      for (const sp of (p?.subparts ?? [])) if (sp?.label && p?.label) out.add(`${p.label}.${sp.label}`);
    }
    return out;
  };
  const cleanPicks = <T extends { question_id?: string; parts?: string[] | null }>(arr: unknown): T[] => {
    if (!Array.isArray(arr)) return [];
    return (arr as T[]).filter(p => {
      const q = p?.question_id ? byId.get(p.question_id) : undefined;
      if (!q) return false;
      if (Array.isArray(p.parts) && p.parts.length > 0) {
        const labels = partLabels(q as Record<string, unknown>);
        p.parts = p.parts.filter(l => labels.has(l));
        if (p.parts.length === 0) p.parts = null;
      } else p.parts = null;
      return true;
    });
  };

  return NextResponse.json({
    concepts: checklist,
    suggestedConcepts: Array.isArray(proposal.suggestedConcepts) ? proposal.suggestedConcepts : [],
    examples: cleanPicks(proposal.examples),
    practice: cleanPicks(proposal.practice),
    gaps: Array.isArray(proposal.gaps) ? proposal.gaps : [],
  });
}
