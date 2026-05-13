import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// GET /api/admin/cards/sections/list?level=AM&topic=Surds
// Returns distinct display_group values with card counts, sorted alphabetically.
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const topic = searchParams.get('topic');

  if (!level || !topic) {
    return NextResponse.json({ error: 'level and topic required' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  const { data, error } = await supa
    .from('content_snippets')
    .select('display_group')
    .eq('level', level)
    .eq('topic', topic)
    .eq('content_kind', 'worked_example')
    .not('display_group', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count per display_group
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const dg = (row as { display_group: string }).display_group;
    counts[dg] = (counts[dg] ?? 0) + 1;
  }

  const sections = Object.entries(counts)
    .map(([name, card_count]) => ({ name, card_count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ sections });
}
