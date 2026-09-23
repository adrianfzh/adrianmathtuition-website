import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth } from '@/lib/practice';
import { isScienceSubject } from '@/lib/science-levels';
import { loadTeachingKnowledge } from '@/lib/teaching-knowledge';
import { HINT_MODEL, buildHintPrompt, normaliseHint, hintMarkdown } from '@/lib/practice-hint';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /api/portal/practice/hint?id=<uuid>
// 💡 "How to approach it" — three short answer-free lines written FOR THIS
// QUESTION (23 Sep 2026; was the topic's raw method templates, which Adrian
// found verbose and off-target). The hint is cached on `questions.hint`:
//   • the practice-photo worker writes it at generation time (a model is
//     already in the loop there);
//   • a bank question gets it on the first tap, here, and every later tap reads
//     the cache.
// The teaching-knowledge shelf is background the writer reads, never the text
// the student sees. `{ markdown: '' }` when there is nothing to say or the
// writer fails — the client then shows nothing, never an off-topic template.
// Auth: portal student session OR admin Bearer (testing).
export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  // Science rows live in the other project and have no hint (yet).
  if (isScienceSubject(url.searchParams.get('subject'))) return NextResponse.json({ markdown: '' });

  const admin = getSupabaseAdmin();
  const { data: q, error } = await admin
    .from('questions')
    .select('id, level, topics, question_text, answer, solution, hint')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (typeof q.hint === 'string') return NextResponse.json({ markdown: hintMarkdown(q.hint), cached: true });

  const hint = await writeHint(admin, q as HintRow);
  return NextResponse.json({ markdown: hintMarkdown(hint), cached: false });
}

type HintRow = { id: string; level: string | null; topics: string[] | null; question_text: string; answer: string | null; solution: string | null };

async function writeHint(admin: ReturnType<typeof getSupabaseAdmin>, q: HintRow): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return '';
  try {
    const knowledge = await loadTeachingKnowledge(admin, {
      level: q.level as string, topics: q.topics,
      context: String(q.question_text || ''),
      methods: 3, pitfalls: 3,
    }).catch(() => null);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: HINT_MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: buildHintPrompt(q, knowledge) }],
    });
    const text = msg.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n');
    const hint = normaliseHint(text);
    // Cache even '' so a question with nothing to say is not re-asked.
    await admin.from('questions').update({ hint }).eq('id', q.id);
    return hint;
  } catch (e) {
    console.error('[practice/hint] writer failed', e instanceof Error ? e.message : e);
    return '';
  }
}
