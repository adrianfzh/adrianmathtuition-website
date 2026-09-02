import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth } from '@/lib/practice';
import { isScienceSubject } from '@/lib/science-levels';
import { loadTeachingKnowledge, methodHintMarkdown } from '@/lib/teaching-knowledge';

export const runtime = 'nodejs';

// GET /api/portal/practice/hint?id=<uuid>
// 💡 "How to approach it" — Adrian's method template(s) for this question's
// topic, from the teaching-knowledge layer (src/lib/teaching-knowledge.ts),
// revealed on demand BEFORE the solution. Answer-free by construction: the
// templates say how to start, never what comes out, so a hint never spoils the
// question and never switches marking off (unlike /solution).
// `{ markdown: '' }` when the shelf has nothing for this topic — the client
// hides the button's result rather than showing an empty box.
// Auth: portal student session OR admin Bearer (testing).
export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  // Science rows live in the other project and have no knowledge shelf (yet).
  if (isScienceSubject(url.searchParams.get('subject'))) return NextResponse.json({ markdown: '' });

  const admin = getSupabaseAdmin();
  const { data: q, error } = await admin
    .from('questions')
    .select('id, level, topics, question_text')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const knowledge = await loadTeachingKnowledge(admin, {
    level: q.level as string, topics: q.topics,
    context: String(q.question_text || ''),
    methods: 2, pitfalls: 0,
  });
  return NextResponse.json({ markdown: methodHintMarkdown(knowledge, 2) });
}
