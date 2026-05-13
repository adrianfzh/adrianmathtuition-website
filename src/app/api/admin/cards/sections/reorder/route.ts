import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// POST /api/admin/cards/sections/reorder
// Upserts sections_meta rows with order_index 1..N for the given (level, topic) scope.
// Creates rows for sections that don't have one yet.
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { level, topic, orderedNames } = await req.json();

  if (!level || !topic || !Array.isArray(orderedNames) || orderedNames.length === 0) {
    return NextResponse.json(
      { error: 'level, topic, orderedNames required' },
      { status: 400 }
    );
  }

  const supa = getSupabaseAdmin();

  const rows = (orderedNames as string[]).map((name, i) => ({
    level,
    topic,
    name,
    order_index: i + 1,
  }));

  const { error } = await supa
    .from('sections_meta')
    .upsert(rows, { onConflict: 'level,topic,name' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
