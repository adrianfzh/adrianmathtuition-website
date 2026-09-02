import { notFound } from 'next/navigation';
import Link from 'next/link';
import SwipeApp from '../worked-examples/SwipeApp';
import { topicSlug } from '@/lib/topic-slug';
import { getSupabase } from '@/lib/supabase';
import { orderDeckCards } from '@/lib/deck-order';
import { PUBLIC_VISIBILITY_FILTER } from '@/lib/subgroup-visibility';

const VALID_LEVELS = ['am', 'em', 'jc', 's1', 's2'];

// Public page, no account: only the 'all' audience exists here. 'ip' and
// 'hidden' sub-groups (and their cards) never render — lib/subgroup-visibility.
async function findCanonicalTopic(level: string, slug: string): Promise<string | null> {
  const supa = getSupabase();
  const { data } = await supa
    .from('subgroups')
    .select('topic')
    .eq('level', level.toUpperCase())
    .or(PUBLIC_VISIBILITY_FILTER);
  const topics = [...new Set((data || []).map((r: { topic: string }) => r.topic))];
  return topics.find(t => topicSlug(t) === slug) ?? null;
}

function NotFoundView({ level, slug }: { level: string; slug: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xl font-semibold text-gray-700">We couldn&apos;t find that topic.</p>
      <p className="text-gray-500 text-sm">
        Level: <code className="bg-gray-100 px-1 rounded">{level}</code>{' '}
        Topic: <code className="bg-gray-100 px-1 rounded">{slug}</code>
      </p>
      <Link href="/revise" className="mt-2 text-blue-600 underline text-sm">Try the index →</Link>
    </main>
  );
}

function EmptyView({ level, topic, subtopicSlug }: { level: string; topic: string; subtopicSlug: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xl font-semibold text-gray-700">
        No refresher cards for <em>{topic}</em> yet.
      </p>
      <p className="text-gray-400 text-sm">Worked examples are available while refresher content is being added.</p>
      <a
        href={`/revise/${level}/${subtopicSlug}/worked-examples`}
        className="mt-2 inline-block px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
      >
        📚 Open Worked Examples
      </a>
      <a href={`/revise/${level}`} className="text-blue-600 underline text-sm">
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
    .eq('content_kind', 'refresher')
    .in('feature', ['both', 'web'])
    .eq('is_published', true);

  if (subgroupId !== null && Number.isFinite(subgroupId)) {
    query = query.eq('subgroup_id', subgroupId);
  }

  const { data: cardsRaw } = await query;

  if (!cardsRaw || cardsRaw.length === 0) {
    return (
      <EmptyView
        level={levelLower}
        topic={canonicalTopic}
        subtopicSlug={topicSlugParam}
      />
    );
  }

  type Card = { id: string; subgroup_id: number; display_group: string | null; order_index: number; card_title: string; content: string; content_kind: string };
  const allSgIds = [...new Set((cardsRaw as Card[]).map(c => c.subgroup_id))];
  const [{ data: sgs }, { data: sectionsMeta }] = await Promise.all([
    supa.from('subgroups').select('id, name, description, order_index').in('id', allSgIds).or(PUBLIC_VISIBILITY_FILTER),
    supa
      .from('sections_meta')
      .select('name, order_index')
      .eq('level', levelLower.toUpperCase())
      .eq('topic', canonicalTopic),
  ]);
  const sgMap = Object.fromEntries(
    (sgs || []).map((s: { id: number; name: string; description: string; order_index: number | null }) => [s.id, s])
  );
  // Cards whose sub-group is not publicly visible drop out with it.
  const visibleCards = (cardsRaw as Card[]).filter(c => sgMap[c.subgroup_id]);
  if (visibleCards.length === 0) {
    return <EmptyView level={levelLower} topic={canonicalTopic} subtopicSlug={topicSlugParam} />;
  }
  const sgIds = [...new Set(visibleCards.map(c => c.subgroup_id))];

  // Sort so every student-facing section (display_group, falling back to the
  // sub-group name — the key DesktopView groups by) is contiguous: sections_meta
  // order first, everything else in sub-group order. See lib/deck-order.ts.
  const cards = orderDeckCards(visibleCards, sgMap, sectionsMeta || []);

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
