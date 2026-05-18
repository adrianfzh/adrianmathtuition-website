import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  if (!level) return NextResponse.json({ error: 'level required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('subgroups')
    .select('topic')
    .eq('level', level)
    .order('topic', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const topics = [...new Set((data ?? []).map((r: { topic: string }) => r.topic))].sort();
  return NextResponse.json({ topics });
}
