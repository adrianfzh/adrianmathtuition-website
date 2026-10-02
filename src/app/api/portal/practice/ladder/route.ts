import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { practiceAuth } from '@/lib/practice';
import { isScienceSubject } from '@/lib/science-levels';
import { proofLadderAllowedFor } from '@/lib/portal-beta';
import { ladderSteps, ladderSlice, ladderMarkdown } from '@/lib/proof-ladder';

export const runtime = 'nodejs';

// GET /api/portal/practice/ladder?id=<uuid>&n=<steps>
// 🪜 "Stuck? Next step" (1 Oct 2026): the first `n` lines of the bank's own
// working, revealed one tap at a time. Only the revealed lines leave the server
// — the rest of the solution is never in the page. No model call.
// Auth: portal student session (the flag or a preview identity) OR admin Bearer.
export async function GET(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (caller.kind === 'student' && !proofLadderAllowedFor(caller.account.airtable_student_id)) {
    return NextResponse.json({ error: 'Not open yet' }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  // Science rows live in the other project; the ladder is a maths door for now.
  if (isScienceSubject(url.searchParams.get('subject'))) return NextResponse.json({ markdown: '', revealed: 0, total: 0, done: true });
  const n = Number(url.searchParams.get('n') || 1);

  const { data: q, error } = await getSupabaseAdmin()
    .from('questions')
    .select('id, solution, answer, parts')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const slice = ladderSlice(ladderSteps(q), n);
  return NextResponse.json({ markdown: ladderMarkdown(slice.steps), revealed: slice.revealed, total: slice.total, done: slice.done });
}
