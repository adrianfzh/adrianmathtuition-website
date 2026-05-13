import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json();
  const { name, description } = body;

  if (name === undefined && description === undefined) {
    return NextResponse.json({ error: 'name or description required' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  // Fetch existing record for level/topic scope
  const { data: existing } = await supa
    .from('subgroups')
    .select('id, level, topic, name')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Duplicate name check (only if name is changing)
  if (name !== undefined) {
    const trimmedName = String(name).trim();
    if (!trimmedName) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });

    if (trimmedName !== existing.name) {
      const { data: dup } = await supa
        .from('subgroups')
        .select('id')
        .eq('level', existing.level)
        .eq('topic', existing.topic)
        .eq('name', trimmedName)
        .maybeSingle();

      if (dup) {
        return NextResponse.json(
          { error: `Sub-group "${trimmedName}" already exists for ${existing.level}/${existing.topic}` },
          { status: 409 }
        );
      }
    }
  }

  const updates: Record<string, string | null> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (description !== undefined) updates.description = description ? String(description).trim() : null;

  const { data, error } = await supa
    .from('subgroups')
    .update(updates)
    .eq('id', id)
    .select('id, name, description')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const supa = getSupabaseAdmin();

  // Check 1: no cards in content_snippets
  const { data: card } = await supa
    .from('content_snippets')
    .select('id')
    .eq('subgroup_id', id)
    .limit(1)
    .maybeSingle();

  if (card) {
    return NextResponse.json(
      { error: 'Sub-group has cards. Delete them first.' },
      { status: 409 }
    );
  }

  // Check 2: question_subgroups references
  const { count: qCount } = await supa
    .from('question_subgroups')
    .select('*', { count: 'exact', head: true })
    .eq('subgroup_id', id);

  if (qCount && qCount > 0) {
    return NextResponse.json(
      { error: `Sub-group is referenced by ${qCount} exam question${qCount === 1 ? '' : 's'}. Reassign first.` },
      { status: 409 }
    );
  }

  // Check 3: kb_entries references
  const { count: kbCount } = await supa
    .from('kb_entries')
    .select('*', { count: 'exact', head: true })
    .contains('related_subgroup_ids', [id]);

  if (kbCount && kbCount > 0) {
    return NextResponse.json(
      { error: `Sub-group is referenced by ${kbCount} KB entr${kbCount === 1 ? 'y' : 'ies'}. Reassign first.` },
      { status: 409 }
    );
  }

  const { error } = await supa.from('subgroups').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
