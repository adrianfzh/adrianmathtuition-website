import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import EditorClient from './EditorClient';
import { getSupabaseAdmin } from '@/lib/supabase';

interface Card {
  id: string;
  level: string;
  topic: string;
  subgroup_id: number;
  order_index: number;
  card_title: string;
  content: string;
  is_published: boolean;
  source_kb_entry_id: string | null;
  content_kind: string;
  feature: string;
  source: string;
  created_at: string;
  updated_at: string;
}

interface Subgroup {
  id: number;
  name: string;
  description: string;
}

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const pw =
    cookieStore.get('admin_pw')?.value ||
    cookieStore.get('schedule_pw')?.value ||
    cookieStore.get('progress_pw')?.value ||
    '';

  if (!pw || pw !== process.env.ADMIN_PASSWORD) {
    redirect('/admin');
  }

  const { id } = await params;
  const supa = getSupabaseAdmin();

  const { data: card, error } = await supa
    .from('content_snippets')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !card) redirect('/admin/edit-cards');

  const typedCard = card as Card;

  // Fetch subgroups for this card's level+topic
  const { data: subgroups } = await supa
    .from('subgroups')
    .select('id, name, description')
    .eq('level', typedCard.level)
    .eq('topic', typedCard.topic)
    .order('id', { ascending: true });

  // Fetch sibling cards (same subgroup) for prev/next nav
  const { data: siblings } = await supa
    .from('content_snippets')
    .select('id, order_index, card_title')
    .eq('level', typedCard.level)
    .eq('topic', typedCard.topic)
    .eq('subgroup_id', typedCard.subgroup_id)
    .eq('content_kind', 'worked_example')
    .order('order_index', { ascending: true });

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>}>
      <EditorClient
        card={typedCard}
        subgroups={(subgroups ?? []) as Subgroup[]}
        siblings={(siblings ?? []) as { id: string; order_index: number; card_title: string }[]}
      />
    </Suspense>
  );
}
