import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// GET /api/portal/practice/topics?level=AM
// Topics (with answerable-question counts) for the practice picker. Service role —
// the bank is locked to the anon key, so serving goes through us, not direct reads.
export async function GET(req: NextRequest) {
  const level = new URL(req.url).searchParams.get('level');
  if (!level) return NextResponse.json({ error: 'level required' }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().rpc('practice_topics', { p_level: level });
  if (error) return NextResponse.json({ error: error.message, topics: [] }, { status: 500 });
  return NextResponse.json({ topics: data || [] });
}
