// ── Notes portal: Supabase reads (server-only) ───────────────────────────────
//
// Pure shaping lives in `notes-tree.ts`; this file is only I/O. Every loader is
// wrapped in React `cache()` so a single request that renders the sidebar and a
// page body hits Supabase once, not twice.

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getSupabase, getSupabaseAdmin } from './supabase';
import {
  groupIntoSections,
  toUnit,
  type UnitRow,
  type UnitSection,
} from './notes-units';
import { topicSlug } from './topic-slug';
import { audienceBadge, subgroupInTree, visibleSubgroups } from './subgroup-visibility';
import {
  buildPageTree,
  buildSections,
  matchBySlug,
  sortSubgroups,
  subgroupUrl,
  topicOrderComparator,
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

/**
 * Who is reading — the sub-group AUDIENCE (lib/subgroup-visibility.ts).
 * Resolved per request by lib/notes-viewer.ts; every exported loader takes
 * it and defaults to the plainest student, so a caller can never widen an
 * audience by forgetting the argument.
 */
export interface NotesViewer {
  isIp: boolean;
  admin: boolean;
}
export const STUDENT_VIEWER: NotesViewer = { isIp: false, admin: false };

/**
 * Tag for every /notes read. The review routes call `revalidateTag(NOTES_CACHE_TAG)`
 * after each write, and /api/notes-revalidate exposes the same for the content
 * scripts that write to Supabase directly — so the cache is busted the moment
 * content changes, and the TTL below is only a safety net.
 */
export const NOTES_CACHE_TAG = 'notes';

/**
 * Persistent data cache around a Supabase read (Adrian, 2026-08-07: refresh was
 * paying every query cross-region on every request). `cache()` still dedupes
 * within one request; this survives across requests until a write invalidates
 * the tag. Cached values are serialized — callers that want a Map or Set build
 * it OUTSIDE the cached fn, from cached plain rows.
 */
function notesCache<T>(keyParts: (string | number)[], fn: () => Promise<T>): Promise<T> {
  return unstable_cache(fn, ['notes', ...keyParts.map(String)], {
    tags: [NOTES_CACHE_TAG],
    revalidate: 300,
  })();
}

/**
 * Every sub-group in a level's TREE — filed at the level, or lent to it for
 * IP students via `ip_extra_level` — UNFILTERED and ordered for display.
 * Viewer-independent, so it can sit in the persistent cache; the audience
 * filter is applied per request in loadSubgroups below.
 */
const loadSubgroupRows = cache((level: string): Promise<SubgroupRow[]> =>
  notesCache(['subgroup-rows', level], async () => {
    const supa = getSupabase();
    const lv = level.toUpperCase();
    const rows = await fetchAllRows<SubgroupRow>((from, to) =>
      supa
        .from('subgroups')
        .select('id, level, topic, name, description, order_index, visibility, ip_extra_level')
        .or(`level.eq.${lv},ip_extra_level.eq.${lv}`)
        .range(from, to),
    );
    return sortSubgroups(rows);
  }),
);

/**
 * The sub-groups THIS viewer may read in a level — Adrian's vetting verdicts
 * (`visibility` 'all' / 'ip' / 'hidden', 2026-08-29) applied against the
 * account's IP flag and the admin cookie (lib/subgroup-visibility.ts,
 * 2026-09-02; before that 'ip' rows were simply excluded, and "Modulus
 * Functions" was retired by name — now the data decides). This is THE
 * chokepoint: tree, level index, topic pages, search and prev/next all
 * enumerate from here, so one filter covers them all. Primitive args so
 * React's per-request cache() dedupes across the layout and the page.
 */
const loadSubgroups = cache(async (level: string, isIp: boolean, admin: boolean): Promise<SubgroupRow[]> =>
  visibleSubgroups(await loadSubgroupRows(level), { level: level.toUpperCase(), isIp, admin }),
);

/**
 * How many renderable snippets each sub-group has. Deliberately selects no
 * `content` — the sidebar only needs to know which pages are non-empty, and
 * pulling every snippet body on every request would be wasteful.
 */
const loadSnippetCounts = cache(async (level: string): Promise<Map<number, number>> => {
  const rows = await notesCache(['snippet-counts', level], async () => {
    const supa = getSupabase();
    const own = await fetchAllRows<{ subgroup_id: number | null }>((from, to) =>
      supa
        .from('content_snippets')
        .select('subgroup_id')
        .eq('level', level.toUpperCase())
        .eq('content_kind', PUBLISHABLE.content_kind)
        .in('feature', [...PUBLISHABLE.features])
        .eq('is_published', true)
        .range(from, to),
    );
    // Sub-groups LENT to this level (ip_extra_level) keep their snippets at
    // their home level, so those are counted by sub-group id instead.
    const lv = level.toUpperCase();
    const lentIds = (await loadSubgroupRows(level))
      .filter(s => s.level.toUpperCase() !== lv)
      .map(s => s.id);
    const lent = lentIds.length === 0 ? [] : await fetchAllRows<{ subgroup_id: number | null }>((from, to) =>
      supa
        .from('content_snippets')
        .select('subgroup_id')
        .in('subgroup_id', lentIds)
        .eq('content_kind', PUBLISHABLE.content_kind)
        .in('feature', [...PUBLISHABLE.features])
        .eq('is_published', true)
        .range(from, to),
    );
    return [...own, ...lent];
  });
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
    const rows = await notesCache(['recall-cards', level], async () => {
      const supa = getSupabase();
      return fetchAllRows<RecallCardRow>((from, to) =>
        supa
          .from('content_snippets')
          .select('id, topic, card_title, content, order_index')
          .eq('level', level.toUpperCase())
          .eq('content_kind', 'recall_card')
          .in('feature', [...PUBLISHABLE.features])
          .eq('is_published', true)
          .range(from, to),
      );
    });

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

const loadSectionsMeta = cache((level: string): Promise<SectionMetaRow[]> =>
  notesCache(['sections-meta', level], async () => {
    const supa = getSupabase();
    return fetchAllRows<SectionMetaRow>((from, to) =>
      supa
        .from('sections_meta')
        .select('level, topic, name, order_index')
        .eq('level', level.toUpperCase())
        .range(from, to),
    );
  }),
);

/**
 * Topic cards, unlike the snippet tables, are NOT anon-readable — RLS returns
 * zero rows for the anon key, which silently emptied this section until it was
 * caught in review. They're admin-authored and carry a draft/published `status`,
 * so the privileged client is correct while /notes is admin-gated and rendered
 * server-side.
 *
 * Students CAN view /notes since 2026-08-14 — the page gates rendering on
 * `status === 'published'` for non-admin viewers (TopicIndex), so drafts stay
 * reviewer-only even though this loader fetches every status.
 */
const loadTopicCards = cache((level: string): Promise<TopicCardRow[]> =>
  notesCache(['topic-cards', level], async () => {
    const supa = getSupabaseAdmin();
    return fetchAllRows<TopicCardRow>((from, to) =>
      supa
        .from('topic_cards')
        .select('level, topic, title, content_md, status')
        .eq('level', level.toUpperCase())
        .range(from, to),
    );
  }),
);

/**
 * Learning units for one topic, split into sections — every status, because
 * this is the reviewer's read. Privileged client: `learning_units` is not
 * anon-readable, same RLS shape as `topic_cards`.
 *
 * The student's view is NOT a different query — the page derives it with
 * `approvedSections()` when the viewer isn't the admin, so the two views can
 * never disagree about what exists, only about what shows. If /notes ever gets
 * a public cache in front of it, revisit: at that point filtering at the query
 * is the safer shape.
 */
const loadTopicUnits = cache((level: string, topic: string): Promise<UnitSection[]> =>
  notesCache(['units', level, topic], async () => {
    const supa = getSupabaseAdmin();
    const rows = await fetchAllRows<UnitRow>((from, to) =>
      supa
        .from('learning_units')
        .select('id, topic, kind, title, unit_order, status, payload')
        .eq('subject', level.toUpperCase())
        .eq('topic', topic)
        // Quick checks are player material, not recap material — /notes never
        // fetches them, and approve-topic never approves them (they get their
        // own review when the Learn player surfaces them).
        .neq('kind', 'check')
        .range(from, to),
    );
    return groupIntoSections(rows.map(toUnit).filter(u => u !== null));
  }),
);

/**
 * Topics whose learning units have been approved — the sidebar drops their old
 * sub-group children (the page students read no longer has those sections).
 * One row per approved unit comes back; the Set dedupes.
 */
const loadConvertedTopics = cache(async (level: string): Promise<Set<string>> => {
  const topics = await notesCache(['converted-topics', level], async () => {
    const supa = getSupabaseAdmin();
    const rows = await fetchAllRows<{ topic: string }>((from, to) =>
      supa
        .from('learning_units')
        .select('topic')
        .eq('subject', level.toUpperCase())
        .eq('status', 'approved')
        .range(from, to),
    );
    return [...new Set(rows.map(r => r.topic))];
  });
  return new Set(topics);
});

/** Topics with a Quick Revision card that has content — any status. Drafts
 *  count: the tree must show the reviewer their drafts, and a student landing
 *  on a draft-only topic just sees the title (the card itself stays gated). */
const loadCardTopics = cache(async (level: string): Promise<Set<string>> => {
  const cards = await loadTopicCards(level);
  return new Set(cards.filter(c => c.content_md).map(c => c.topic));
});

/** The sidebar tree for a level, as this viewer may read it. */
export const getNotesTree = cache(async (level: string, viewer: NotesViewer = STUDENT_VIEWER): Promise<TreeRoot> => {
  const [subgroups, counts, converted, cardTopics] = await Promise.all([
    loadSubgroups(level, viewer.isIp, viewer.admin),
    loadSnippetCounts(level),
    loadConvertedTopics(level),
    loadCardTopics(level),
  ]);
  return buildPageTree(level, subgroups, counts, converted, cardTopics);
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
export const getLevelIndex = cache(async (level: string, viewer: NotesViewer = STUDENT_VIEWER): Promise<LevelTopic[]> => {
  const [subgroups, counts, recall, cardTopics] = await Promise.all([
    loadSubgroups(level, viewer.isIp, viewer.admin),
    loadSnippetCounts(level),
    loadRecallCards(level),
    loadCardTopics(level),
  ]);

  const out: LevelTopic[] = [];
  for (const row of subgroups) {
    if (!subgroupInTree(row, level)) continue;
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
  // Card-only topics (Quick Revision, no example pages yet) still list — the
  // card IS the topic page. Mirrors buildPageTree's cardTopics rule.
  for (const topic of cardTopics) {
    if (!out.some(t => t.topic === topic)) {
      out.push({
        topic,
        url: topicUrl(level, topic),
        pages: 0,
        examples: 0,
        recall: recall.get(topic)?.length ?? 0,
      });
    }
  }
  // Same ordering as buildPageTree, so the grid and the sidebar agree.
  const byLearningOrder = topicOrderComparator(level);
  return out.sort((a, b) => byLearningOrder(a.topic, b.topic));
});

export interface TopicPageData {
  topic: string;
  card: TopicCardRow | null;
  /** Formula reflexes — the page hero when the topic has them. */
  recall: RecallCardRow[];
  /** Learning units, every status — the reviewer's view. Empty when none exist. */
  unitSections: UnitSection[];
  subgroups: {
    name: string;
    url: string;
    description: string | null;
    count: number;
    /** Every example inline (2026-08-29, nested-accordion topic page): the
     *  folder opens in place instead of navigating — "dropdowns in worked
     *  examples themselves … with further dropdowns to see into each". */
    examples: { id: string; card_title: string | null; content: string }[];
    /** Admin only: "IP only" / "hidden" / "also IP S1" (sub-group audience). */
    badge: string | null;
  }[];
}

/** Topic index page: reflexes and the topic card, then its sub-group list. */
export const getTopicPage = cache(
  async (level: string, slug: string, viewer: NotesViewer = STUDENT_VIEWER): Promise<TopicPageData | null> => {
    const [subgroups, counts, cards, recall] = await Promise.all([
      loadSubgroups(level, viewer.isIp, viewer.admin),
      loadSnippetCounts(level),
      loadTopicCards(level),
      loadRecallCards(level),
    ]);

    const levelRows = subgroups.filter(s => subgroupInTree(s, level));
    // Card-only topics have no sub-group rows — resolve the slug against the
    // union so their pages exist (the Quick Revision card is the content).
    const topics = [
      ...new Set([
        ...levelRows.map(s => s.topic),
        ...cards.filter(c => c.content_md).map(c => c.topic),
      ]),
    ];
    const topic = matchBySlug(topics, slug, t => t);
    if (!topic) return null;

    const topicRows = levelRows.filter(s => s.topic === topic);
    // One query for every example on the page, grouped per folder below. Same
    // publishable filters as loadSnippetCounts, so a folder's inline list can
    // never disagree with its count pill.
    const ids = topicRows.map(s => s.id);
    const snippetRows = ids.length === 0 ? [] : await notesCache(['topic-snippets', level, topic], async () => {
      const supa = getSupabase();
      return fetchAllRows<{ id: string; subgroup_id: number; order_index: number | null; card_title: string | null; content: string }>(
        (from, to) =>
          supa
            .from('content_snippets')
            .select('id, subgroup_id, order_index, card_title, content')
            .in('subgroup_id', ids)
            .eq('content_kind', PUBLISHABLE.content_kind)
            .in('feature', [...PUBLISHABLE.features])
            .eq('is_published', true)
            .order('order_index', { ascending: true, nullsFirst: false })
            .range(from, to),
      );
    });
    const examplesBySubgroup = new Map<number, { id: string; card_title: string | null; content: string }[]>();
    for (const r of snippetRows) {
      const a = examplesBySubgroup.get(r.subgroup_id) ?? [];
      a.push({ id: r.id, card_title: r.card_title, content: r.content });
      examplesBySubgroup.set(r.subgroup_id, a);
    }

    const list = topicRows
      .map(s => ({
        name: s.name,
        url: subgroupUrl(level, topic, s.name),
        description: s.description,
        count: counts.get(s.id) ?? 0,
        examples: examplesBySubgroup.get(s.id) ?? [],
        badge: viewer.admin ? audienceBadge(s, level) : null,
      }))
      .filter(s => s.count > 0);

    const card = cards.find(c => c.topic === topic && c.content_md) ?? null;
    if (list.length === 0 && !card) return null;

    return {
      topic,
      card,
      recall: recall.get(topic) ?? [],
      unitSections: await loadTopicUnits(level, topic),
      subgroups: list,
    };
  },
);

export interface SubgroupPageData {
  topic: string;
  subgroup: SubgroupRow;
  sections: NotesSection[];
  /** Admin only: "IP only" / "hidden" / "also IP S1" (sub-group audience). */
  badge: string | null;
}

/** One sub-group page: its snippets, split into display_group sections. A
 *  direct URL to a sub-group this viewer may not read is a 404, not a page. */
export const getSubgroupPage = cache(
  async (
    level: string,
    topicSlugParam: string,
    subgroupSlug: string,
    viewer: NotesViewer = STUDENT_VIEWER,
  ): Promise<SubgroupPageData | null> => {
    const [subgroups, meta] = await Promise.all([
      loadSubgroups(level, viewer.isIp, viewer.admin),
      loadSectionsMeta(level),
    ]);

    const levelRows = subgroups.filter(s => subgroupInTree(s, level));
    const topics = [...new Set(levelRows.map(s => s.topic))];
    const topic = matchBySlug(topics, topicSlugParam, t => t);
    if (!topic) return null;

    const subgroup = matchBySlug(
      levelRows.filter(s => s.topic === topic),
      subgroupSlug,
      s => s.name,
    );
    if (!subgroup) return null;

    const snippets = await notesCache(['subgroup-snippets', subgroup.id], async () => {
      const supa = getSupabase();
      return fetchAllRows<SnippetRow>((from, to) =>
        supa
          .from('content_snippets')
          .select('id, subgroup_id, display_group, order_index, card_title, content')
          .eq('subgroup_id', subgroup.id)
          .eq('content_kind', PUBLISHABLE.content_kind)
          .in('feature', [...PUBLISHABLE.features])
          .eq('is_published', true)
          .range(from, to),
      );
    });
    if (snippets.length === 0) return null;

    return {
      topic,
      subgroup,
      sections: buildSections(
        snippets,
        subgroup.name,
        meta.filter(m => m.topic === topic),
      ),
      badge: viewer.admin ? audienceBadge(subgroup, level) : null,
    };
  },
);

// ── Search index ─────────────────────────────────────────────────────────────

export interface SearchEntry {
  /** What the student typed against: an example title or a section name. */
  label: string;
  /** Where it lives: "Topic · Sub-group" for examples, the topic for sections. */
  context: string;
  /** Deep link — sub-group page, with an #ex-<id> anchor for examples. */
  url: string;
  kind: 'example' | 'section' | 'topic';
}

/**
 * Everything findable in a level, flattened for the sidebar search: topics,
 * sub-group pages and every published worked example BY ITS TITLE (the titles
 * are scenario names — "Circle touching both axes…" — which is exactly what a
 * student searches for). Shares the cached loaders, so building it costs one
 * extra Supabase query (the id/title list) per revalidation window.
 */
export const getSearchIndex = cache(async (level: string, viewer: NotesViewer = STUDENT_VIEWER): Promise<SearchEntry[]> => {
  const [subgroups, counts, titles, coreRows] = await Promise.all([
    loadSubgroups(level, viewer.isIp, viewer.admin),
    loadSnippetCounts(level),
    notesCache(['search-titles', level], async () => {
      const supa = getSupabase();
      return fetchAllRows<{ id: string; subgroup_id: number | null; card_title: string | null }>(
        (from, to) =>
          supa
            .from('content_snippets')
            .select('id, subgroup_id, card_title')
            .eq('level', level.toUpperCase())
            .eq('content_kind', PUBLISHABLE.content_kind)
            .in('feature', [...PUBLISHABLE.features])
            .eq('is_published', true)
            .range(from, to),
      );
    }),
    // Key-concept section headings ("How do I complete the square?") — the
    // learning-unit `core` titles that open each section on a converted topic
    // page. Adrian's round-5 review: a student searching a CONCEPT rather
    // than an example title found nothing. ALL statuses are fetched because
    // draft cores still consume anchor ids on the page (groupIntoSections
    // dedups across them) — only approved ones are emitted below. Privileged
    // client: learning_units is not anon-readable.
    notesCache(['search-sections', level], async () => {
      const supa = getSupabaseAdmin();
      return fetchAllRows<{ topic: string; title: string; unit_order: number | null; status: string | null; payload: unknown }>(
        (from, to) =>
          supa
            .from('learning_units')
            .select('topic, title, unit_order, status, payload')
            .eq('subject', level.toUpperCase())
            .eq('kind', 'core')
            .range(from, to),
      );
    }),
  ]);

  const { cleanTitle } = await import('./notes-text');
  const sgById = new Map(subgroups.map(s => [s.id, s]));
  const out: SearchEntry[] = [];

  const seenTopics = new Set<string>();
  for (const s of subgroups) {
    if ((counts.get(s.id) ?? 0) === 0) continue; // empty pages aren't findable
    if (!seenTopics.has(s.topic)) {
      seenTopics.add(s.topic);
      out.push({ label: s.topic, context: '', url: topicUrl(level, s.topic), kind: 'topic' });
    }
    out.push({
      label: cleanTitle(s.name),
      context: s.topic,
      url: subgroupUrl(level, s.topic, s.name),
      kind: 'section',
    });
  }
  for (const t of titles) {
    if (t.subgroup_id == null || !t.card_title) continue;
    const sg = sgById.get(t.subgroup_id);
    if (!sg) continue;
    out.push({
      label: cleanTitle(t.card_title),
      context: `${sg.topic} · ${cleanTitle(sg.name)}`,
      url: `${subgroupUrl(level, sg.topic, sg.name)}#ex-${t.id}`,
      kind: 'example',
    });
  }

  // Key-concept sections, with the SAME anchor derivation as
  // groupIntoSections (lib/notes-units): question-form title when the style
  // pass wrote one, `unit-<slug>` id deduped per topic in unit order —
  // including drafts, so an approved core after a draft twin still lands on
  // its real anchor.
  const coresByTopic = new Map<string, typeof coreRows>();
  for (const r of coreRows) {
    // toUnit drops rows with a non-object payload — they never open a section
    // on the page, so they must neither consume an anchor id nor emit here.
    if (!r.payload || typeof r.payload !== 'object' || Array.isArray(r.payload)) continue;
    if (!coresByTopic.has(r.topic)) coresByTopic.set(r.topic, []);
    coresByTopic.get(r.topic)!.push(r);
  }
  for (const [topic, rows] of coresByTopic) {
    rows.sort((a, b) => (a.unit_order ?? 0) - (b.unit_order ?? 0));
    const used = new Set<string>();
    for (const r of rows) {
      const titleQ = (r.payload as { title_q?: unknown }).title_q;
      const label = (typeof titleQ === 'string' && titleQ.trim() ? titleQ.trim() : r.title) || '';
      const base = `unit-${topicSlug(label) || 'section'}`;
      let id = base;
      for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
      used.add(id);
      if (r.status !== 'approved' || !label) continue;
      // The concept dropdowns moved off the topic page onto its /learn
      // sub-page (2026-08-29, revision-only split) — anchors follow.
      out.push({
        label,
        context: topic,
        url: `${topicUrl(level, topic)}/learn#${id}`,
        kind: 'section',
      });
    }
  }
  return out;
});
