import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// POST /api/admin/cards/sections/delete
// Refuses if the section has cards (409). Succeeds silently if already empty
// (sections are implicit — no row to delete).
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { level, topic, name } = await req.json();

  if (!level || !topic || !name) {
    return NextResponse.json({ error: 'level, topic, name required' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  const { count } = await supa
    .from('content_snippets')
    .select('*', { count: 'exact', head: true })
    .eq('level', level)
    .eq('topic', topic)
    .eq('display_group', name)
    .eq('content_kind', 'worked_example');

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Section '${name}' has ${count} card${count === 1 ? '' : 's'}. Move or delete them first.` },
      { status: 409 }
    );
  }

  // Remove from sections_meta so the section doesn't reappear on reload
  await supa
    .from('sections_meta')
    .delete()
    .eq('level', level)
    .eq('topic', topic)
    .eq('name', name);

  return NextResponse.json({ ok: true });
}
