import { notFound } from 'next/navigation';
import SwipeApp from './SwipeApp';
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

function NotFoundView({ level, slug }: { level: string; slug: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xl font-semibold text-gray-700">
        We couldn&apos;t find that topic.
      </p>
      <p className="text-gray-500 text-sm">
        Level: <code className="bg-gray-100 px-1 rounded">{level}</code>{' '}
        Topic: <code className="bg-gray-100 px-1 rounded">{slug}</code>
      </p>
      <a href="/revise" className="mt-2 text-blue-600 underline text-sm">
        Try the index →
      </a>
    </main>
  );
}

function EmptyView({ level, topic }: { level: string; topic: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xl font-semibold text-gray-700">
        Worked examples for <em>{topic}</em> are still being written.
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
  searchParams,
}: {
  params: Promise<{ topic: string; subtopic: string }>;
  searchParams: Promise<{ subgroup?: string }>;
}) {
  const { topic: levelParam, subtopic: topicSlugParam } = await params;
  const { subgroup: subgroupParam } = await searchParams;
  const subgroupId = subgroupParam ? Number(subgroupParam) : null;
  const levelLower = levelParam.toLowerCase();

  if (!VALID_LEVELS.includes(levelLower)) return notFound();

  const canonicalTopic = await findCanonicalTopic(levelLower, topicSlugParam);
  if (!canonicalTopic) {
    return <NotFoundView level={levelParam} slug={topicSlugParam} />;
  }

  const supa = getSupabase();
  let query = supa
    .from('content_snippets')
    .select('id, subgroup_id, display_group, order_index, card_title, content, content_kind')
    .eq('level', levelLower.toUpperCase())
    .eq('topic', canonicalTopic)
    .eq('content_kind', 'worked_example')
    .in('feature', ['both', 'web'])
    .eq('is_published', true);

  if (subgroupId !== null && Number.isFinite(subgroupId)) {
    query = query.eq('subgroup_id', subgroupId);
  }

  const { data: cardsRaw } = await query;

  if (!cardsRaw || cardsRaw.length === 0) {
    return <EmptyView level={levelLower} topic={canonicalTopic} />;
  }

  // Sort by section order (sections_meta), then subgroup_id, then order_index —
  // matches the order shown in the Cards Editor.
  const { data: sectionsMeta } = await supa
    .from('sections_meta')
    .select('name, order_index')
    .eq('level', levelLower.toUpperCase())
    .eq('topic', canonicalTopic);
  const sectionOrder: Record<string, number> = Object.fromEntries(
    (sectionsMeta || []).map((s: { name: string; order_index: number }) => [s.name, s.order_index])
  );
  const SECTION_FALLBACK = 9999; // unknown sections sink to the bottom
  type Card = { id: string; subgroup_id: number; display_group: string | null; order_index: number; card_title: string; content: string; content_kind: string };
  const cards: Card[] = [...cardsRaw as Card[]].sort((a, b) => {
    const aSec = a.display_group ? (sectionOrder[a.display_group] ?? SECTION_FALLBACK) : SECTION_FALLBACK;
    const bSec = b.display_group ? (sectionOrder[b.display_group] ?? SECTION_FALLBACK) : SECTION_FALLBACK;
    if (aSec !== bSec) return aSec - bSec;
    // Fallback to alphabetical for unknown sections so behaviour is deterministic
    if (aSec === SECTION_FALLBACK && a.display_group && b.display_group && a.display_group !== b.display_group) {
      return a.display_group.localeCompare(b.display_group);
    }
    if (a.subgroup_id !== b.subgroup_id) return a.subgroup_id - b.subgroup_id;
    return (a.order_index ?? 0) - (b.order_index ?? 0);
  });

  const sgIds = [...new Set(cards.map((c: { subgroup_id: number }) => c.subgroup_id))];
  const { data: sgs } = await supa
    .from('subgroups')
    .select('id, name, description')
    .in('id', sgIds);
  const sgMap = Object.fromEntries((sgs || []).map((s: { id: number; name: string; description: string }) => [s.id, s]));

  const focusedSubgroupName =
    subgroupId !== null && sgIds.length === 1 && sgMap[subgroupId]
      ? (sgMap[subgroupId] as { name: string }).name
      : undefined;

  return (
    <SwipeApp
      cards={cards}
      subgroups={sgMap}
      level={levelLower}
      topic={canonicalTopic}
      focusedSubgroupName={focusedSubgroupName}
    />
  );
}
