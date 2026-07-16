// /revise/[level]/[topic-slug]/recall — the QUICK RECALL deck: compressed
// one-reflex-per-card revision cards, DERIVED from learning_units core blocks
// (content_kind='recall_card', provenance in source_unit_id; see
// scripts/derive-recall-cards.js in the bot repo). Same SwipeApp shell as the
// worked-examples deck — different pedagogy, same substrate.
import { notFound } from 'next/navigation';
import SwipeApp from '../worked-examples/SwipeApp';
import { topicSlug } from '@/lib/topic-slug';
import { getSupabase } from '@/lib/supabase';

const VALID_LEVELS = ['am', 'em', 'jc', 's1', 's2'];

async function findCanonicalTopic(level: string, slug: string): Promise<string | null> {
  const supa = getSupabase();
  const { data } = await supa
    .from('subgroups')
    .select('topic')
    .eq('level', level.toUpperCase());
  const topics = [...new Set((data || []).map((r: { topic: string }) => r.topic))];
  return topics.find(t => topicSlug(t) === slug) ?? null;
}

function EmptyView({ level, topic }: { level: string; topic: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xl font-semibold text-gray-700">
        Quick recall cards for <em>{topic}</em> are still being made.
      </p>
      <p className="text-gray-400 text-sm">Coming soon.</p>
      <a href={`/revise/${level}`} className="mt-2 text-blue-600 underline text-sm">
        ← Back to {level.toUpperCase()} topics
      </a>
    </main>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ topic: string; subtopic: string }>;
}) {
  const { topic: levelParam, subtopic: topicSlugParam } = await params;
  const levelLower = levelParam.toLowerCase();
  if (!VALID_LEVELS.includes(levelLower)) return notFound();

  const canonicalTopic = await findCanonicalTopic(levelLower, topicSlugParam);
  if (!canonicalTopic) return notFound();

  const supa = getSupabase();
  const { data: cardsRaw } = await supa
    .from('content_snippets')
    .select('id, subgroup_id, display_group, order_index, card_title, content, content_kind')
    .eq('level', levelLower.toUpperCase())
    .eq('topic', canonicalTopic)
    .eq('content_kind', 'recall_card')
    .in('feature', ['both', 'web'])
    .eq('is_published', true)
    .order('order_index', { ascending: true });

  if (!cardsRaw || cardsRaw.length === 0) {
    return <EmptyView level={levelLower} topic={canonicalTopic} />;
  }

  return (
    <SwipeApp
      cards={cardsRaw}
      subgroups={{}}
      level={levelLower}
      topic={canonicalTopic}
    />
  );
}
