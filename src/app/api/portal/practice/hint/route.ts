import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth, scienceServeFor } from '@/lib/practice';
import { isScienceSubject, mcqKey, scienceLevelForSubject, sciencePoolLevels, type ScienceSubject } from '@/lib/science-levels';
import { getScienceClient, scienceEligible, scienceQuestion } from '@/lib/science-bank';
import { scienceRowServable } from '@/lib/science-practice';
import { loadTeachingKnowledge, scienceKnowledgeLevel } from '@/lib/teaching-knowledge';
import { HINT_MODEL, buildHintPrompt, normaliseHint, hintMarkdown } from '@/lib/practice-hint';
import { hintWriteAllowed, HINT_LIMIT_MARKDOWN } from '@/lib/grade-limit';
import { portalIdentity } from '@/lib/portal-auth';
import { hasPartMarks, studentRow } from '@/lib/part-syllabus';

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
  const admin = getSupabaseAdmin();
  const subject = url.searchParams.get('subject');
  if (isScienceSubject(subject)) return scienceHint(caller, admin, subject, id);

  const { data: raw, error } = await admin
    .from('questions')
    .select('id, level, topics, question_text, answer, solution, hint, parts, total_marks')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!raw) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // Part marks (lib/part-syllabus.ts): the hint is written from the student's row, and a
  // stored hint — written before the part was marked — is not used or replaced.
  const marked = hasPartMarks(raw.parts);
  const q = studentRow(raw, { assigned: true });
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (typeof q.hint === 'string') return NextResponse.json({ markdown: hintMarkdown(q.hint), cached: true });

  const limited = await hintCapReached(caller, admin, q.id);
  if (limited) return limited;

  const hint = await writeHint(admin, q as HintRow, !marked);
  return NextResponse.json({ markdown: hintMarkdown(hint), cached: false });
}

type Caller = NonNullable<Awaited<ReturnType<typeof practiceAuth>>>;

// A NEW hint is a model call — a student may cause DAILY_HINT_WRITE_CAP a day across
// maths and science (lib/grade-limit.ts, 5 Oct 2026). Cached hints are always free.
async function hintCapReached(caller: Caller, admin: ReturnType<typeof getSupabaseAdmin>, questionId: string): Promise<NextResponse | null> {
  if (caller.kind !== 'student') return null;
  const identity = portalIdentity(caller.account);
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from('portal_event_log').select('id', { count: 'exact', head: true })
    .eq('identity', identity).eq('kind', 'hint:write').gte('created_at', since);
  if (!hintWriteAllowed(count || 0)) return NextResponse.json({ markdown: HINT_LIMIT_MARKDOWN, limited: true });
  await admin.from('portal_event_log').insert({ identity, kind: 'hint:write', detail: { questionId } }).then(() => {}, () => {});
  return null;
}

// 💡 Science (15 Oct 2026, Adrian: "yes … also do the science Hints button"). The question
// lives in the science project and its hint is cached there (`questions.hint`, migration
// science_questions_hint); the teaching tips come from the maths project's shelf, asked
// with the science level (CHEM/PHYS/BIO). A student opens only what the picker would serve,
// exactly as the solution route. MCQs get no hint — a hint there points at an option.
async function scienceHint(caller: Caller, admin: ReturnType<typeof getSupabaseAdmin>, subject: ScienceSubject, id: string) {
  try {
    const sq = await scienceQuestion(subject, id);
    if (!sq) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const serve = await scienceServeFor(caller);
    const lk = scienceLevelForSubject(subject)?.key ?? '';
    if (serve.open && (!scienceEligible(sq, { checkedOnly: serve.checkedOnly }) || !scienceRowServable(serve.open, lk, sq, serve.combined, c => sciencePoolLevels(lk, c)))) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (mcqKey(sq.answer)) return NextResponse.json({ markdown: '' });
    const sci = getScienceClient();
    const { data: cached } = await sci.from('questions').select('hint').eq('id', sq.id).maybeSingle();
    const stored = (cached as { hint?: string | null } | null)?.hint;
    if (typeof stored === 'string') return NextResponse.json({ markdown: hintMarkdown(stored), cached: true });

    const limited = await hintCapReached(caller, admin, sq.id);
    if (limited) return limited;
    const row: HintRow = {
      id: sq.id, level: scienceKnowledgeLevel(subject, sq.level), topics: Array.isArray(sq.topics) ? sq.topics : [],
      question_text: String(sq.question_text || ''), answer: sq.answer ?? null, solution: sq.solution ?? null,
    };
    const hint = await writeHint(admin, row, async h => { await sci.from('questions').update({ hint: h }).eq('id', sq.id); });
    return NextResponse.json({ markdown: hintMarkdown(hint), cached: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

type HintRow = { id: string; level: string | null; topics: string[] | null; question_text: string; answer: string | null; solution: string | null };

// `store`: true = cache on the maths bank row; a function = cache elsewhere (science); false = do not cache.
// Only a real reply is cached — a failed writer caches nothing, so the next tap tries again.
async function writeHint(admin: ReturnType<typeof getSupabaseAdmin>, q: HintRow, store: boolean | ((hint: string) => Promise<void>) = true): Promise<string> {
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
    if (typeof store === 'function') await store(hint).catch(() => {});
    else if (store) await admin.from('questions').update({ hint }).eq('id', q.id);
    return hint;
  } catch (e) {
    console.error('[practice/hint] writer failed', e instanceof Error ? e.message : e);
    return '';
  }
}
