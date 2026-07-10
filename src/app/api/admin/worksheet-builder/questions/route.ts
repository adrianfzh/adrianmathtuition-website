// GET /api/admin/worksheet-builder/questions
// Search the Supabase question bank for the worksheet builder.
//
// Query params:
//   level  — EM | AM | H2 (required)
//   topic  — exact topic name (optional; matched against questions.topics[] / practice_questions.topic)
//   search — free-text ILIKE on question_text (optional)
//   source — seed | generated | all (default all)
//
// Returns up to 30 rows:
//   { id, source: 'seed'|'generated', text, marks, provenance, difficulty, hasImage, imageUrl, answer, solution }
//
// NOTE on levels (verified against live schema 2026-07-07):
//   questions.level          → AM, EM, EM_NA, JC1, JC2, S1, S2, S3_AM, S3_EM (no 'H2')
//   practice_questions.level → mirrors subgroups (AM/EM/JC/S1/S2)
// so the UI level is mapped per table below.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

const UI_LEVELS = ['EM', 'AM', 'H2'] as const;
type UiLevel = (typeof UI_LEVELS)[number];

/** UI level → questions.level values */
const SEED_LEVELS: Record<UiLevel, string[]> = {
  EM: ['EM', 'S3_EM'],
  AM: ['AM', 'S3_AM'],
  H2: ['JC1', 'JC2'],
};

/** UI level → practice_questions.level values */
const GENERATED_LEVELS: Record<UiLevel, string[]> = {
  EM: ['EM'],
  AM: ['AM'],
  H2: ['JC', 'JC1', 'JC2'],
};

const MAX_ROWS = 30;

/* questions.parts jsonb: [{text,label,marks,answer,solution,subparts?:[...]}].
 * Flatten into display text / combined answer / combined solution so
 * multi-part questions carry their full content through the builder. */
type Part = {
  text?: string | null;
  label?: string | null;
  marks?: number | null;
  answer?: string | null;
  solution?: string | null;
  subparts?: Part[] | null;
};

function flattenParts(stem: string, parts: Part[] | null): { text: string; answer: string; solution: string } {
  if (!parts?.length) return { text: stem, answer: '', solution: '' };
  const textLines: string[] = stem ? [stem] : [];
  const answers: string[] = [];
  const solutions: string[] = [];
  const walk = (list: Part[], prefix: string) => {
    for (const p of list) {
      const label = p.label ? `${prefix}(${p.label})` : prefix;
      if (p.text) textLines.push(`**${label}** ${p.text}${p.marks ? `  [${p.marks}]` : ''}`);
      if (p.answer) answers.push(`${label} ${p.answer}`);
      if (p.solution) solutions.push(`**${label}**\n${p.solution}`);
      if (p.subparts?.length) walk(p.subparts, label);
    }
  };
  walk(parts, '');
  return {
    text: textLines.join('\n\n'),
    answer: answers.join(';  '),
    solution: solutions.join('\n\n'),
  };
}

export interface BuilderQuestion {
  id: string;
  source: 'seed' | 'generated';
  text: string;
  marks: number | null;
  provenance: string;
  difficulty: string | null;
  hasImage: boolean;
  imageUrl: string | null;
  answer: string;
  solution: string;
}

/** questions.image_url is a legacy text column holding either a bare URL or a
 *  JSON array of records (bare URL string or {url, pos}). Extract the first URL. */
function firstImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith('http')) return s;
  try {
    const parsed = JSON.parse(s);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of arr) {
      if (typeof entry === 'string' && entry.startsWith('http')) return entry;
      if (entry && typeof entry === 'object' && typeof entry.url === 'string') return entry.url;
    }
  } catch {
    /* not JSON — ignore */
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level') as UiLevel | null;
  const topic = (searchParams.get('topic') ?? '').trim();
  const search = (searchParams.get('search') ?? '').trim();
  const source = searchParams.get('source') ?? 'all';
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);

  if (!level || !UI_LEVELS.includes(level)) {
    return NextResponse.json({ error: 'level must be EM, AM or H2' }, { status: 400 });
  }
  if (!['seed', 'generated', 'ai-bank', 'all'].includes(source)) {
    return NextResponse.json({ error: 'source must be seed, generated, ai-bank or all' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();
  const results: BuilderQuestion[] = [];

  // ── Seed questions (real past-paper bank) ──────────────────────────────────
  if (source === 'seed' || source === 'all' || source === 'ai-bank') {
    let q = supa
      .from('questions')
      .select('id, question_text, answer, solution, parts, total_marks, school, year, exam_type, difficulty, has_image, image_url, verified, ai_generated, figure_url, solution_source')
      .is('deleted_at', null)
      .in('level', SEED_LEVELS[level])
      .range(offset, offset + MAX_ROWS - 1);
    // ai-bank: newest generations first; past papers keep year ordering
    q = source === 'ai-bank'
      ? q.order('created_at', { ascending: false })
      : q.order('year', { ascending: false, nullsFirst: false });
    // 'ai-bank' = only AI-generated bank rows (gen-worker, geometry construct,
    // session batches), newest first — the "show me just the new ones" view.
    if (source === 'ai-bank') q = q.eq('ai_generated', true);
    if (topic) q = q.overlaps('topics', [topic]);
    if (search) q = q.ilike('question_text', `%${search}%`);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const r of data ?? []) {
      const prov = r.ai_generated
        ? `AI · ${(r as { solution_source?: string }).solution_source ?? 'generated'}`
        : [r.school, r.year, r.exam_type].filter(Boolean).join(' · ') || 'Question bank';
      const flat = flattenParts(r.question_text ?? '', (r.parts as Part[] | null) ?? null);
      results.push({
        id: r.id,
        source: 'seed',
        text: flat.text,
        marks: r.total_marks ?? null,
        provenance: prov,
        difficulty: r.difficulty ?? null,
        hasImage: !!r.has_image,
        imageUrl: firstImageUrl(r.image_url) ?? (r as { figure_url?: string | null }).figure_url ?? null,
        answer: flat.answer || (r.answer ?? ''),
        solution: flat.solution || (r.solution ?? ''),
      });
    }
  }

  // ── Generated practice questions (4-gate verified pipeline) ───────────────
  if (source === 'generated' || source === 'all') {
    let q = supa
      .from('practice_questions')
      .select('id, question_text, marks, answer, solution, verified, generated_by, topic')
      .in('level', GENERATED_LEVELS[level])
      .order('generated_at', { ascending: false })
      .range(offset, offset + MAX_ROWS - 1);
    if (topic) q = q.eq('topic', topic);
    if (search) q = q.ilike('question_text', `%${search}%`);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const r of data ?? []) {
      results.push({
        id: r.id,
        source: 'generated',
        text: r.question_text ?? '',
        marks: r.marks ?? null,
        provenance: r.verified ? 'AI • 4-gate verified' : 'AI-generated (unverified)',
        difficulty: null,
        hasImage: false,
        imageUrl: null,
        answer: r.answer ?? '',
        solution: r.solution ?? '',
      });
    }
  }

  return NextResponse.json({ questions: results.slice(0, MAX_ROWS) });
}
