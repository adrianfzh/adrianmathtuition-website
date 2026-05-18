import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { level, topic, name, description } = await req.json();
  if (!level || !topic || !name) {
    return NextResponse.json(
      { error: 'level, topic, name required' },
      { status: 400 }
    );
  }

  // Normalise inputs
  const trimmedName = String(name).trim();
  const trimmedDesc = description ? String(description).trim() : null;
  if (!trimmedName) {
    return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  // Reject duplicate (same level + topic + name)
  const { data: dup } = await supa
    .from('subgroups')
    .select('id, name')
    .eq('level', level)
    .eq('topic', topic)
    .eq('name', trimmedName)
    .maybeSingle();

  if (dup) {
    return NextResponse.json(
      { error: `Sub-group "${trimmedName}" already exists for ${level}/${topic} (id ${dup.id})` },
      { status: 409 }
    );
  }

  const { data, error } = await supa
    .from('subgroups')
    .insert({
      level,
      topic,
      name: trimmedName,
      description: trimmedDesc,
    })
    .select('id, name, description')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
