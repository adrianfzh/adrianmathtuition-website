// ── Notes portal: Supabase reads (server-only) ───────────────────────────────
//
// Pure shaping lives in `notes-tree.ts`; this file is only I/O. Every loader is
// wrapped in React `cache()` so a single request that renders the sidebar and a
// page body hits Supabase once, not twice.

import { cache } from 'react';
import { getSupabase, getSupabaseAdmin } from './supabase';
import {
  buildPageTree,
  buildSections,
  matchBySlug,
  sortSubgroups,
  subgroupUrl,
  topicUrl,
  type NotesSection,
  type RecallCardRow,
  type SectionMetaRow,
  type SnippetRow,
  type SubgroupRow,
  type TopicCardRow,
  type TreeRoot,
} from './notes-tree';

// The same filters the /revise worked-examples page applies. Kept in one place
// so the portal and the swipe cards can never drift apart on what is publishable.
const PUBLISHABLE = {
  content_kind: 'worked_example',
  features: ['both', 'web'],
} as const;

// PostgREST caps a response at 1000 rows. AM is well under that today, but the
// portal grows to every level in Phase 2 — page from the start so the tree can
// never silently lose its tail (this exact cap has bitten this project before).
const PAGE = 1000;

async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`notes-data: supabase read failed — ${String(error)}`);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) return out;
  }
}

/** All sub-groups for a level, ordered for display. */
const loadSubgroups = cache(async (level: string): Promise<SubgroupRow[]> => {
  const supa = getSupabase();
  const rows = await fetchAllRows<SubgroupRow>((from, to) =>
    supa
      .from('subgroups')
      .select('id, level, topic, name, description, order_index')
      .eq('level', level.toUpperCase())
      .range(from, to),
  );
  return sortSubgroups(rows);
});

/**
 * How many renderable snippets each sub-group has. Deliberately selects no
 * `content` — the sidebar only needs to know which pages are non-empty, and
 * pulling every snippet body on every request would be wasteful.
 */
const loadSnippetCounts = cache(async (level: string): Promise<Map<number, number>> => {
  const supa = getSupabase();
  const rows = await fetchAllRows<{ subgroup_id: number | null }>((from, to) =>
    supa
      .from('content_snippets')
      .select('subgroup_id')
      .eq('level', level.toUpperCase())
      .eq('content_kind', PUBLISHABLE.content_kind)
      .in('feature', [...PUBLISHABLE.features])
      .eq('is_published', true)
      .range(from, to),
  );
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.subgroup_id == null) continue; // recall cards carry no sub-group
    counts.set(r.subgroup_id, (counts.get(r.subgroup_id) ?? 0) + 1);
  }
  return counts;
});

/**
 * Recall cards for a level, keyed by topic.
 *
 * These are the 179 AM rows the sub-group tree could never reach: `subgroup_id`
 * is NULL on every one of them, so `loadSnippetCounts` skips them and no page
 * in the tree owns them. They hang off `topic` instead, which is why this is a
 * separate loader rather than another filter over the sub-group snippets.
 */
const loadRecallCards = cache(
  async (level: string): Promise<Map<string, RecallCardRow[]>> => {
    const supa = getSupabase();
    const rows = await fetchAllRows<RecallCardRow>((from, to) =>
      supa
        .from('content_snippets')
        .select('id, topic, card_title, content, order_index')
        .eq('level', level.toUpperCase())
        .eq('content_kind', 'recall_card')
        .in('feature', [...PUBLISHABLE.features])
        .eq('is_published', true)
        .range(from, to),
    );

    const byTopic = new Map<string, RecallCardRow[]>();
    for (const row of rows) {
      const list = byTopic.get(row.topic);
      if (list) list.push(row);
      else byTopic.set(row.topic, [row]);
    }
    for (const list of byTopic.values()) {
      list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    }
    return byTopic;
  },
);

const loadSectionsMeta = cache(async (level: string): Promise<SectionMetaRow[]> => {
  const supa = getSupabase();
  return fetchAllRows<SectionMetaRow>((from, to) =>
    supa
      .from('sections_meta')
      .select('level, topic, name, order_index')
      .eq('level', level.toUpperCase())
      .range(from, to),
  );
});

/**
 * Topic cards, unlike the snippet tables, are NOT anon-readable — RLS returns
 * zero rows for the anon key, which silently emptied this section until it was
 * caught in review. They're admin-authored and carry a draft/published `status`,
 * so the privileged client is correct while /notes is admin-gated and rendered
 * server-side.
 *
 * ⚠ Phase 3 (student login): this bypass must become a `status='published'`
 * filter, or the RLS policy must be widened — otherwise drafts leak to students.
 */
const loadTopicCards = cache(async (level: string): Promise<TopicCardRow[]> => {
  const supa = getSupabaseAdmin();
  return fetchAllRows<TopicCardRow>((from, to) =>
    supa
      .from('topic_cards')
      .select('level, topic, title, content_md, status')
      .eq('level', level.toUpperCase())
      .range(from, to),
  );
});

/** The sidebar tree for a level. */
export const getNotesTree = cache(async (level: string): Promise<TreeRoot> => {
  const [subgroups, counts] = await Promise.all([
    loadSubgroups(level),
    loadSnippetCounts(level),
  ]);
  return buildPageTree(level, subgroups, counts);
});

export interface LevelTopic {
  topic: string;
  url: string;
  /** Sub-group pages under the topic that have something to show. */
  pages: number;
  examples: number;
  /** Formula reflexes on the topic page. */
  recall: number;
}

/**
 * Level index: one row per topic with its page and example counts.
 *
 * Shares `loadSubgroups`/`loadSnippetCounts` with the tree, so the counts on the
 * cards and the pages in the sidebar can't disagree — and, both being `cache()`d,
 * rendering the index costs no extra Supabase round-trips.
 */
export const getLevelIndex = cache(async (level: string): Promise<LevelTopic[]> => {
  const [subgroups, counts, recall] = await Promise.all([
    loadSubgroups(level),
    loadSnippetCounts(level),
    loadRecallCards(level),
  ]);

  const out: LevelTopic[] = [];
  for (const row of subgroups) {
    if (row.level.toUpperCase() !== level.toUpperCase()) continue;
    const examples = counts.get(row.id) ?? 0;
    if (examples === 0) continue; // empty sub-groups aren't pages

    const seen = out.find(t => t.topic === row.topic);
    if (seen) {
      seen.pages += 1;
      seen.examples += examples;
    } else {
      out.push({
        topic: row.topic,
        url: topicUrl(level, row.topic),
        pages: 1,
        examples,
        recall: recall.get(row.topic)?.length ?? 0,
      });
    }
  }
  // Same ordering as buildPageTree, so the grid and the sidebar agree.
  return out.sort((a, b) => a.topic.localeCompare(b.topic));
});

export interface TopicPageData {
  topic: string;
  card: TopicCardRow | null;
  /** Formula reflexes — the page hero when the topic has them. */
  recall: RecallCardRow[];
  subgroups: { name: string; url: string; description: string | null; count: number }[];
}

/** Topic index page: reflexes and the topic card, then its sub-group list. */
export const getTopicPage = cache(
  async (level: string, slug: string): Promise<TopicPageData | null> => {
    const [subgroups, counts, cards, recall] = await Promise.all([
      loadSubgroups(level),
      loadSnippetCounts(level),
      loadTopicCards(level),
      loadRecallCards(level),
    ]);

    const levelRows = subgroups.filter(
      s => s.level.toUpperCase() === level.toUpperCase(),
    );
    const topics = [...new Set(levelRows.map(s => s.topic))];
    const topic = matchBySlug(topics, slug, t => t);
    if (!topic) return null;

    const list = levelRows
      .filter(s => s.topic === topic)
      .map(s => ({
        name: s.name,
        url: subgroupUrl(level, topic, s.name),
        description: s.description,
        count: counts.get(s.id) ?? 0,
      }))
      .filter(s => s.count > 0);

    if (list.length === 0) return null;

    return {
      topic,
      card: cards.find(c => c.topic === topic && c.content_md) ?? null,
      recall: recall.get(topic) ?? [],
      subgroups: list,
    };
  },
);

export interface SubgroupPageData {
  topic: string;
  subgroup: SubgroupRow;
  sections: NotesSection[];
}

/** One sub-group page: its snippets, split into display_group sections. */
export const getSubgroupPage = cache(
  async (
    level: string,
    topicSlugParam: string,
    subgroupSlug: string,
  ): Promise<SubgroupPageData | null> => {
    const [subgroups, meta] = await Promise.all([
      loadSubgroups(level),
      loadSectionsMeta(level),
    ]);

    const levelRows = subgroups.filter(
      s => s.level.toUpperCase() === level.toUpperCase(),
    );
    const topics = [...new Set(levelRows.map(s => s.topic))];
    const topic = matchBySlug(topics, topicSlugParam, t => t);
    if (!topic) return null;

    const subgroup = matchBySlug(
      levelRows.filter(s => s.topic === topic),
      subgroupSlug,
      s => s.name,
    );
    if (!subgroup) return null;

    const supa = getSupabase();
    const snippets = await fetchAllRows<SnippetRow>((from, to) =>
      supa
        .from('content_snippets')
        .select('id, subgroup_id, display_group, order_index, card_title, content')
        .eq('subgroup_id', subgroup.id)
        .eq('content_kind', PUBLISHABLE.content_kind)
        .in('feature', [...PUBLISHABLE.features])
        .eq('is_published', true)
        .range(from, to),
    );
    if (snippets.length === 0) return null;

    return {
      topic,
      subgroup,
      sections: buildSections(
        snippets,
        subgroup.name,
        meta.filter(m => m.topic === topic),
      ),
    };
  },
);
