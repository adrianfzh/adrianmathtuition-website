import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// POST /api/admin/cards/subgroups/reorder
// Rewrites order_index to 1..N for all sub-groups in the given (level, topic) scope.
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { level, topic, orderedIds } = await req.json();

  if (!level || !topic || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json(
      { error: 'level, topic, orderedIds required' },
      { status: 400 }
    );
  }

  const supa = getSupabaseAdmin();

  const updates = (orderedIds as number[]).map((id, i) => ({
    id,
    order_index: i + 1,
  }));

  const { error } = await supa
    .from('subgroups')
    .upsert(updates, { onConflict: 'id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
