// GET /api/admin/lessons/bank-semantic?level=JC&topics=t1,t2&q=conics+hyperbola&model=haiku&limit=40
//
// AI-reranked bank search for the lesson editor. Instead of embedding similarity (too fuzzy for
// LaTeX-heavy maths), we let Claude READ the candidate questions and pick the ones genuinely
// relevant to the teacher's query.
//
// Mechanism (retrieve → rerank):
//   1. Pull the in-scope candidate pool from Postgres — level + overlap with the lesson's topics.
//      The lesson-topics scope keeps this small (typically tens to low-hundreds), so it fits in
//      one model call cheaply.
//   2. Hand Claude a numbered list of candidate stems and ask which numbers match the query,
//      ranked most-relevant first. (Numeric indices instead of UUIDs to save tokens.)
//   3. Map the picks back to ids, fetch full rows in that order, attach usage counts.
//
// Model: Haiku by default (?model=haiku), Sonnet on demand (?model=sonnet) for sharper judgement.
//
// Response mirrors /api/admin/lessons/bank so LessonBankPanel renders it unchanged, plus
// { model, pool, truncated } diagnostics.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Claude model strings.
const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
} as const;
type ModelKey = keyof typeof MODELS;

// Cap the candidate pool so a very broad topic can't blow up token cost / latency.
const POOL_CAP = 600;
// Max chars of stem+parts text we show the model per candidate.
const SNIPPET_CHARS = 360;

const FULL_COLUMNS =
  'id, school, year, paper, question_number, question_text, parts, answer, solution, solution_images, topics, total_marks, has_image, image_url, images, difficulty, source_file, exam_type, level';

type PartLike = { label?: string; text?: string; subparts?: Array<{ label?: string; text?: string }> };

function candidateSnippet(q: { question_text: string | null; parts: unknown }): string {
  const bits: string[] = [];
  if (q.question_text) bits.push(q.question_text);
  if (Array.isArray(q.parts)) {
    for (const p of q.parts as PartLike[]) {
      if (p?.text) bits.push(`(${p.label ?? ''}) ${p.text}`);
      if (Array.isArray(p?.subparts)) for (const sp of p.subparts) if (sp?.text) bits.push(`(${sp.label ?? ''}) ${sp.text}`);
    }
  }
  // Collapse whitespace; LaTeX is left intact — Claude reads it fine.
  const text = bits.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > SNIPPET_CHARS ? text.slice(0, SNIPPET_CHARS) + '…' : text;
}

/** Pull the array of picked indices out of Claude's reply, tolerant of fences / stray prose. */
function parsePicks(raw: string, maxIndex: number): number[] {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  // Prefer a {"matches":[...]} object, else the first bare [...] array.
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    const m = text.match(/\[[\s\S]*?\]/);
    if (m) { try { arr = JSON.parse(m[0]); } catch { arr = null; } }
  }
  let nums: unknown[] = [];
  if (Array.isArray(arr)) nums = arr;
  else if (arr && typeof arr === 'object' && Array.isArray((arr as { matches?: unknown[] }).matches)) {
    nums = (arr as { matches: unknown[] }).matches;
  }
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of nums) {
    const i = typeof n === 'number' ? n : parseInt(String(n), 10);
    if (Number.isInteger(i) && i >= 0 && i < maxIndex && !seen.has(i)) { seen.add(i); out.push(i); }
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const topicsParam = searchParams.get('topics') ?? '';
  const query = (searchParams.get('q') ?? searchParams.get('search') ?? '').trim();
  const modelKey: ModelKey = searchParams.get('model') === 'sonnet' ? 'sonnet' : 'haiku';
  const exam = (searchParams.get('exam') ?? '').trim();
  const limit = Math.min(Number(searchParams.get('limit') ?? 40), 100);

  if (!level) return NextResponse.json({ error: 'level required' }, { status: 400 });
  if (!query) return NextResponse.json({ error: 'q required' }, { status: 400 });
  const topics = topicsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (topics.length === 0) return NextResponse.json({ questions: [], total: 0 });

  const JC_FAMILY = ['JC', 'JC1', 'JC2'];
  const isJC = JC_FAMILY.includes(level);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI search unavailable: ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  const supa = getSupabaseAdmin();

  // 1. Candidate pool — in-scope questions only (JC lesson = whole JC1/JC2 family).
  let poolQ = supa
    .from('questions')
    .select('id, question_text, parts', { count: 'exact' })
    .overlaps('topics', topics)
    .is('deleted_at', null);
  poolQ = isJC ? poolQ.in('level', JC_FAMILY) : poolQ.eq('level', level);
  if (isJC && exam) poolQ = poolQ.eq('exam_type', exam);
  const { data: pool, error: poolErr, count } = await poolQ
    .order('year', { ascending: false })
    .order('school', { ascending: true })
    .limit(POOL_CAP);
  if (poolErr) return NextResponse.json({ error: poolErr.message }, { status: 500 });

  const candidates = pool ?? [];
  if (candidates.length === 0) return NextResponse.json({ questions: [], total: 0, model: modelKey, pool: 0 });

  // 2. Ask Claude which candidates match.
  const numbered = candidates
    .map((q, i) => `#${i}: ${candidateSnippet(q) || '(no text)'}`)
    .join('\n');

  const system = `You filter a Singapore secondary/JC maths question bank for a teacher building a lesson.
You are given a search QUERY and a numbered list of CANDIDATE questions (stem + parts text).
Return the candidate numbers that are genuinely about what the query asks for — the mathematical
topic, concept, or method named in the query. Be strict: exclude questions only loosely or
incidentally related. Order them most-relevant first.
Output ONLY compact JSON of the form {"matches":[3,17,2]} — no prose, no code fences. If nothing
is relevant, return {"matches":[]}.`;

  const user = `QUERY: ${query}\n\nCANDIDATES:\n${numbered}`;

  let pickedIdx: number[];
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: MODELS[modelKey],
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const textOut = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');
    pickedIdx = parsePicks(textOut, candidates.length).slice(0, limit);
  } catch (e) {
    return NextResponse.json({ error: `AI search failed: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 502 });
  }

  if (pickedIdx.length === 0) {
    return NextResponse.json({ questions: [], total: 0, model: modelKey, pool: candidates.length, truncated: (count ?? 0) > candidates.length });
  }

  const orderedIds = pickedIdx.map(i => candidates[i].id as string);

  // 3. Fetch full rows for the picks.
  const { data: full, error: fullErr } = await supa.from('questions').select(FULL_COLUMNS).in('id', orderedIds);
  if (fullErr) return NextResponse.json({ error: fullErr.message }, { status: 500 });

  // 4. Best-effort usage counts (same RPC the keyword bank route uses).
  let usageById: Record<string, number> = {};
  try {
    const { data: usage } = await supa.rpc('question_card_usage_counts', { q_ids: orderedIds });
    for (const u of (usage ?? []) as Array<{ question_id: string; usage_count: number }>) {
      usageById[u.question_id] = u.usage_count;
    }
  } catch { usageById = {}; }

  // 5. Reorder to match Claude's ranking (the IN fetch loses order).
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  const out = (full ?? [])
    .map(q => ({ ...q, usage_count: usageById[q.id as string] ?? 0, subgroup_links: [] }))
    .sort((a, b) => (rank.get(a.id as string) ?? 1e9) - (rank.get(b.id as string) ?? 1e9));

  return NextResponse.json({
    questions: out,
    total: out.length,
    // True size of the lesson's topic scope (level∩topics), independent of how many the AI picked.
    // The panel uses this as the "in topic scope" denominator so Smart mode doesn't report "60 of 60".
    scopeTotal: count ?? out.length,
    model: modelKey,
    pool: candidates.length,
    truncated: (count ?? 0) > candidates.length,
  });
}
