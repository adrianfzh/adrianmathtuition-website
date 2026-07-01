import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { solutionMarkdown } from '@/lib/bank-question-markdown';

export const runtime = 'nodejs';

// GET /api/portal/practice/solution?id=<uuid>
// Returns the answer + worked-solution markdown for one question, revealed on demand
// (kept out of the /next payload so the solution isn't in the page before it's asked for).
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().rpc('practice_solution', { p_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const q = data?.[0];
  if (!q) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ markdown: solutionMarkdown(q) });
}
