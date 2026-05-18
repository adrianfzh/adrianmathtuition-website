import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// POST /api/admin/cards/sections/rename
// Bulk-renames display_group from oldName → newName across all cards in (level, topic).
// Merging is allowed: if newName already exists, cards are merged into that section.
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { level, topic, oldName, newName } = await req.json();

  if (!level || !topic || !oldName || !newName) {
    return NextResponse.json({ error: 'level, topic, oldName, newName required' }, { status: 400 });
  }

  const trimmedNew = String(newName).trim();
  if (!trimmedNew) {
    return NextResponse.json({ error: 'newName cannot be empty' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  const { error, count } = await supa
    .from('content_snippets')
    .update({ display_group: trimmedNew })
    .eq('level', level)
    .eq('topic', topic)
    .eq('display_group', oldName);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep sections_meta in sync: rename the row (upsert new, delete old if different)
  if (trimmedNew !== oldName) {
    // Fetch existing order_index for the old name
    const { data: existing } = await supa
      .from('sections_meta')
      .select('order_index')
      .eq('level', level)
      .eq('topic', topic)
      .eq('name', oldName)
      .maybeSingle();

    if (existing) {
      await supa
        .from('sections_meta')
        .upsert({ level, topic, name: trimmedNew, order_index: existing.order_index }, { onConflict: 'level,topic,name' });
      await supa
        .from('sections_meta')
        .delete()
        .eq('level', level)
        .eq('topic', topic)
        .eq('name', oldName);
    }
  }

  return NextResponse.json({ ok: true, updated: count ?? 0 });
}
