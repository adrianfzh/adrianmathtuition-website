// POST /api/portal/notebook/explain {entryId, answer} — 🧠 "Explain it back" on a
// Notebook re-attempt (4 Nov 2026, Adrian: "make it stick"). Optional: after a
// re-attempt the student may write one sentence on when/why the method is used.
// Same judge as the Learn units (lib/explain-judge), judged ONLY against this
// entry's own twin question, its answer, the worked solution and the marker's
// comment.
//
// Cap: one judged sentence per re-attempt — the verdict is stored on the
// latest attempt (`attempts[-1].explain`), and a second try on the same attempt
// is refused. That bounds the model calls by the re-attempts themselves.
// Access: the notebook route's own rules (session identity owns the row; the
// beta gate hides it while the full portal is admin-only).
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { portalIdentity } from '@/lib/portal-auth';
import { fullPortalVisible } from '@/lib/portal-beta';
import { judgeExplanation, explainSystem, EXPLAIN_MAX_ANSWER } from '@/lib/explain-judge';
import { rollupSolution } from '@/lib/solution-rollup';
import { studentRow } from '@/lib/part-syllabus';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function sessionStudentId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id')
    .eq('id', user.id)
    .single();
  return data ? portalIdentity(data) : null;
}

type Attempt = Record<string, unknown> & { explain?: unknown };

export async function POST(req: NextRequest) {
  const sid = await sessionStudentId();
  if (!sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await fullPortalVisible())) {
    return NextResponse.json({ error: 'Not available yet' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const entryId = typeof body?.entryId === 'string' ? body.entryId : '';
  const answer = String(body?.answer ?? '').slice(0, EXPLAIN_MAX_ANSWER).trim();
  if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 });
  if (answer.length < 8) return NextResponse.json({ error: 'Write a full sentence first.' }, { status: 400 });

  const svc = createServiceClient();
  const { data: entry } = await svc
    .from('notebook_entries')
    .select('id, topic, comment, question_prompt, variant_question, variant_answer, variant_qb_id, attempts')
    .eq('id', entryId)
    .eq('airtable_student_id', sid) // ownership
    .single();
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const attempts = (Array.isArray(entry.attempts) ? entry.attempts : []) as Attempt[];
  const last = attempts[attempts.length - 1];
  if (!last) return NextResponse.json({ error: 'Have a go at the question first.' }, { status: 400 });
  if (last.explain) return NextResponse.json({ error: 'You’ve explained this one already — next time it comes back you can try again.' }, { status: 429 });

  // The content the judge may use: the twin, its answer, the worked solution, the marker's note.
  let solution = '';
  if (entry.variant_qb_id) {
    try {
      const { data: raw } = await svc.from('questions').select('solution, parts, total_marks, answer').eq('id', entry.variant_qb_id).single();
      const row = raw ? studentRow(raw, { assigned: true }) : null;
      solution = rollupSolution(row?.solution, row?.parts) || '';
    } catch { /* answer-only content is still judgeable */ }
  }
  const content = [
    entry.variant_question || entry.question_prompt,
    entry.variant_answer ? `Answer: ${entry.variant_answer}` : '',
    solution ? `Worked solution:\n${solution}` : '',
    entry.comment ? `Marker's note on the original: ${entry.comment}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 4000);
  if (!content.trim()) return NextResponse.json({ error: 'Nothing to explain against on this one.' }, { status: 400 });

  let out: Awaited<ReturnType<typeof judgeExplanation>>;
  try {
    out = await judgeExplanation(
      explainSystem('re-attempted a question on', entry.topic || 'this topic', content, 'QUESTION AND SOLUTION'),
      answer,
      'Not quite — look again at the solution and what made this method the right one.',
    );
  } catch {
    return NextResponse.json({ error: 'Could not check that right now — try again in a moment.' }, { status: 502 });
  }

  attempts[attempts.length - 1] = { ...last, explain: { verdict: out.verdict, text: answer, at: new Date().toISOString() } };
  await svc.from('notebook_entries').update({ attempts }).eq('id', entry.id).eq('airtable_student_id', sid);

  return NextResponse.json(out);
}
