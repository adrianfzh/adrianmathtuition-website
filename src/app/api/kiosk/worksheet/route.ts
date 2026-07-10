// GET /api/kiosk/worksheet?level=&topic=&count=8&answers=1
// Build a random worksheet from the verified practice-question bank for a
// level+topic. Returns question text (+ marks, + optional answer) ONLY — never
// the worked solution or any originating school/paper metadata.
// Auth: valid kiosk device cookie OR admin. 401 otherwise.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyKioskAuth, KIOSK_LEVELS } from '@/lib/kiosk-session';
import { normalizeTier, TIER_DIFFICULTY_VALUES } from '@/lib/practice-tiers';

export const runtime = 'nodejs';

const MAX_COUNT = 20;
// Cap the pool we shuffle over — enough randomness without pulling the whole bank.
const POOL_CAP = 120;

// Fisher–Yates shuffle (unbiased) — randomisation happens in JS after fetching
// a capped verified pool, so the bank order can't be inferred.
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


// questions.level values servable per kiosk level token.
const SEED_LEVELS: Record<string, string[]> = {
  EM: ['EM', 'S3_EM'],
  AM: ['AM', 'S3_AM'],
  JC2: ['JC', 'JC1', 'JC2'],
};

/* questions.parts jsonb → flattened display text + combined answer
 * (same shape the worksheet-builder uses). */
type Part = {
  text?: string | null; label?: string | null; marks?: number | null;
  answer?: string | null; subparts?: Part[] | null;
};
function flattenParts(stem: string, parts: Part[] | null): { text: string; answer: string } {
  if (!parts?.length) return { text: stem, answer: '' };
  const textLines: string[] = stem ? [stem] : [];
  const answers: string[] = [];
  const walk = (list: Part[], prefix: string) => {
    for (const p of list) {
      const label = p.label ? `${prefix}(${p.label})` : prefix;
      if (p.text) textLines.push(`**${label}** ${p.text}${p.marks ? `  [${p.marks}]` : ''}`);
      if (p.answer) answers.push(`${label} ${p.answer}`);
      if (p.subparts?.length) walk(p.subparts, label);
    }
  };
  walk(parts, '');
  return { text: textLines.join('\n\n'), answer: answers.join(';  ') };
}

export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const level = params.get('level') || '';
  const topic = (params.get('topic') || '').trim();
  const withAnswers = params.get('answers') === '1';
  const tier = normalizeTier(params.get('tier'));  // basic|standard|advanced|null(=Mixed)
  const count = Math.min(MAX_COUNT, Math.max(1, parseInt(params.get('count') || '8', 10) || 8));

  const cfg = KIOSK_LEVELS[level];
  if (!cfg) return NextResponse.json({ error: 'level must be EM, AM or JC2' }, { status: 400 });
  if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 });

  const supa = getSupabaseAdmin();

  // Pool = union of both servable sources:
  //  - `questions` (the generation worker's output + real bank): flatten parts,
  //    text-only or gate-5 verified figure, solved, not deleted. Carries a
  //    `difficulty` we can map to a tier.
  //  - `practice_questions` (the /revise pool): already flat, but has NO
  //    difficulty — so it's only servable when the tier filter is off (Mixed).
  const seedLevels = SEED_LEVELS[level] ?? cfg.questionLevels;
  let bankQuery = supa.from('questions')
    .select('id, question_text, parts, total_marks, answer, figure_url, has_image')
    .in('level', seedLevels)
    .overlaps('topics', [topic])
    .is('deleted_at', null)
    .not('solution', 'is', null)
    .or('has_image.eq.false,figure_url.not.is.null')
    .limit(POOL_CAP);
  if (tier) bankQuery = bankQuery.in('difficulty', TIER_DIFFICULTY_VALUES[tier]);
  // ONE STORE: the old practice_questions pool was migrated into the bank
  // (ai_generated rows, difficulty 'Standard'), so the bank query covers it.
  const bankRes = await bankQuery;
  if (bankRes.error) {
    return NextResponse.json({ error: bankRes.error.message }, { status: 500 });
  }

  type Item = { id: string; markdown: string; marks: number | null; figureUrl: string | null; answer: string | null };
  const items: Item[] = [];
  for (const r of bankRes.data || []) {
    const flat = flattenParts((r.question_text as string) ?? '', (r.parts as Part[] | null) ?? null);
    items.push({
      id: r.id as string,
      markdown: flat.text,
      marks: (r.total_marks as number | null) ?? null,
      figureUrl: (r.figure_url as string | null) ?? null,
      answer: flat.answer || ((r.answer as string | null) ?? null),
    });
  }

  const picked = shuffle(items).slice(0, count);
  const questions = picked.map((r) => ({
    id: r.id,
    markdown: r.markdown,
    marks: r.marks,
    figureUrl: r.figureUrl,
    ...(withAnswers ? { answer: r.answer } : {}),
  }));

  const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Mixed';
  return NextResponse.json({
    title: `${cfg.label} — ${topic} · ${tierLabel}`,
    level,
    topic,
    tier: tier ?? 'mixed',
    questions,
  });
}
