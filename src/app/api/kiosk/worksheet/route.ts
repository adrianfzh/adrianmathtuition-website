// GET /api/kiosk/worksheet?level=&topic=&count=8&answers=1
// Build a random worksheet from the verified practice-question bank for a
// level+topic. Returns question text (+ marks, + optional answer) ONLY — never
// the worked solution or any originating school/paper metadata.
// Auth: valid kiosk device cookie OR admin. 401 otherwise.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isKioskOpen } from '@/lib/kiosk-config';
import { verifyKioskAuth, KIOSK_LEVELS } from '@/lib/kiosk-session';
import { normalizeTier, TIER_DIFFICULTY_VALUES } from '@/lib/practice-tiers';
import { studentFromRequest } from '@/lib/kiosk-student';

export const runtime = 'nodejs';

const MAX_COUNT = 20;
// Cap the pool we shuffle over — enough randomness without pulling the whole bank.
const POOL_CAP = 120;
// Fetch more than POOL_CAP because answer-less rows are dropped in JS after
// flattening (the sheet prints answers, so only answer-bearing questions serve).
const FETCH_CAP = 400;

// DETERMINISTIC daily draw (Adrian, 2026-07-16): two students printing the same
// level+topic+tier on the same SGT day get the SAME sheet — so they can discuss.
// Counts slice one shared order, so printing 8 then 15 extends (Q9–15 are new),
// and a reprint is an identical copy. Seed rotates at SGT midnight.
function sgtDate(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}
// FNV-1a string hash → 32-bit seed.
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
// mulberry32 — tiny deterministic PRNG.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Fisher–Yates with a seeded PRNG — same seed → same order.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
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
  if (!verifyAdminAuth(req) && !(await isKioskOpen())) {
    return NextResponse.json({ error: 'Kiosk closed', closed: true }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const level = params.get('level') || '';
  const topic = (params.get('topic') || '').trim();
  const withAnswers = params.get('answers') === '1';
  const withCard = params.get('card') === '1'; // Type A: prepend the topic revision card
  const tier = normalizeTier(params.get('tier'));  // basic|standard|advanced|null(=Mixed)
  const count = Math.min(MAX_COUNT, Math.max(1, parseInt(params.get('count') || '8', 10) || 8));

  const cfg = KIOSK_LEVELS[level];
  if (!cfg) return NextResponse.json({ error: 'level must be EM, AM or JC2' }, { status: 400 });
  if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 });

  // Hard-lock: students can only build worksheets for their own level (admin bypasses).
  if (!verifyAdminAuth(req)) {
    const student = studentFromRequest(req);
    if (!student) return NextResponse.json({ error: 'Scan to start', studentRequired: true }, { status: 401 });
    if (!student.entitlements.practice.includes(level)) {
      return NextResponse.json({ error: 'Not your level', forbidden: true }, { status: 403 });
    }
  }

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
    // NOTE: no solution filter. The sheet prints ANSWERS (never solutions), so the
    // gate is answer-presence — checked in JS after flattening parts, because most
    // extracted questions carry answers in parts[].answer, not the top-level column.
    // (The old `solution NOT NULL` filter was a leftover from the AI-generated-only
    // pool and silently excluded ~80% of the extracted bank. Removed 2026-07-16.)
    .or('has_image.eq.false,figure_url.not.is.null')
    .order('id') // pin pool order — Postgres gives no default ordering, and the daily draw must be reproducible
    .limit(FETCH_CAP);
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
    const answer = flat.answer || ((r.answer as string | null) ?? '');
    if (!answer.trim()) continue; // answers always print — answer-less questions don't serve
    items.push({
      id: r.id as string,
      markdown: flat.text,
      marks: (r.total_marks as number | null) ?? null,
      figureUrl: (r.figure_url as string | null) ?? null,
      answer,
    });
    if (items.length >= POOL_CAP) break; // cap AFTER the answer gate, in pinned id order
  }

  const picked = seededShuffle(items, hashSeed(`${sgtDate()}|${level}|${topic}|${tier ?? 'mixed'}`)).slice(0, count);
  const questions = picked.map((r) => ({
    id: r.id,
    markdown: r.markdown,
    marks: r.marks,
    figureUrl: r.figureUrl,
    ...(withAnswers ? { answer: r.answer } : {}),
  }));

  // Type A: attach the topic revision card (page 1 of the printed sheet).
  // Draft cards serve too — Adrian pilots the format before formally approving.
  let card: { title: string; contentMd: string; status: string } | null = null;
  if (withCard) {
    const cardRes = await supa.from('topic_cards')
      .select('title, content_md, status')
      .eq('level', level).eq('topic', topic)
      .maybeSingle();
    if (cardRes.data) {
      card = { title: cardRes.data.title, contentMd: cardRes.data.content_md, status: cardRes.data.status };
    }
  }

  const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Mixed';
  return NextResponse.json({
    title: `${cfg.label} — ${topic} · ${tierLabel}`,
    level,
    topic,
    tier: tier ?? 'mixed',
    ...(withCard ? { card } : {}),
    questions,
  });
}
