// ── Notes portal: pure shaping logic ─────────────────────────────────────────
//
// Everything here is a pure function over rows already fetched from Supabase, so
// it is unit-testable without a network. The I/O lives in `notes-data.ts`.
//
// Tree shape (SPEC-NOTES-PORTAL Phase 1): Level → Topic → one page per sub-group.

import { A_MATH_EXAM_TOPICS, EM_OWN_TOPICS } from './canonical-topics';
import { subgroupInTree } from './subgroup-visibility';
import { topicSlug } from './topic-slug';

export const NOTES_BASE = '/notes';

/** Levels the portal exposes, in sidebar order. Phase 2 (2026-08-27) adds EM. */
export const NOTES_LEVELS = [
  { code: 'AM', label: 'Additional Maths' },
  { code: 'EM', label: 'Elementary Maths' },
] as const;

export type NotesLevel = (typeof NOTES_LEVELS)[number]['code'];

export interface SubgroupRow {
  id: number;
  level: string;
  topic: string;
  name: string;
  description: string | null;
  order_index: number | null;
  /** 'all' | 'ip' | 'hidden' — Adrian's vetting verdicts (2026-08-29), made a
   *  real per-viewer gate on 2026-09-02 (lib/subgroup-visibility.ts).
   *  notes-data's loadSubgroups applies it, so downstream code only ever sees
   *  rows the current viewer may read. */
  visibility?: string | null;
  /** Level this row is ALSO lent to for IP students (e.g. an S2 row with
   *  'S1'), so it can appear in that level's tree. */
  ip_extra_level?: string | null;
}

export interface SnippetRow {
  id: string;
  subgroup_id: number | null;
  display_group: string | null;
  order_index: number | null;
  card_title: string | null;
  content: string;
}

export interface SectionMetaRow {
  level: string;
  topic: string;
  name: string;
  order_index: number;
}

export interface TopicCardRow {
  level: string;
  topic: string;
  title: string | null;
  content_md: string | null;
  status: string | null;
}

/**
 * A `content_kind='recall_card'` row. These carry no `subgroup_id` — they hang
 * off the TOPIC, which is why the sub-group tree never had anywhere to put them
 * and all 179 stayed invisible until the topic pages grew a reflexes strip.
 */
export interface RecallCardRow {
  id: string;
  topic: string;
  card_title: string | null;
  content: string;
  order_index: number | null;
}

// ── Topic families ───────────────────────────────────────────────────────────
//
// 31 AM topics in one flat list is a wall. `canonical-topics.ts` already groups
// them the way the syllabus does — reuse that rather than invent a second
// grouping that could drift from the one the admin pages use.

export interface TopicFamily {
  label: string;
  topics: string[];
}

/** Topics with no home in the canonical list still need somewhere to go. */
const OTHER_FAMILY = 'Other topics';

/** Families for a level, in syllabus order. Levels without a grouping get none.
 *  EM uses EM_OWN_TOPICS, not E_MATH_EXAM_TOPICS — the exam list appends the
 *  cascading [S2]/[S1] categories, which repeat topic names and would claim
 *  every shared topic for the wrong family. */
export function topicFamilies(level: string): TopicFamily[] {
  const lv = level.toUpperCase();
  if (lv === 'AM') return A_MATH_EXAM_TOPICS.map(c => ({ label: c.label, topics: c.topics }));
  if (lv === 'EM') return EM_OWN_TOPICS.map(c => ({ label: c.label, topics: c.topics }));
  return [];
}

/**
 * Bucket items into their topic families, in syllabus order. Families with
 * nothing in them are dropped, and anything unrecognised falls into a trailing
 * "Other topics" group rather than vanishing.
 *
 * Generic over the item so the sidebar (folders) and the level index (topic
 * cards) group identically instead of each rolling their own.
 */
export function groupByFamily<T>(
  level: string,
  items: T[],
  topicOf: (item: T) => string,
): { family: TopicFamily; items: T[] }[] {
  const families = topicFamilies(level);
  if (families.length === 0) {
    return items.length ? [{ family: { label: OTHER_FAMILY, topics: [] }, items }] : [];
  }

  const home = new Map<string, string>();
  for (const family of families) {
    for (const topic of family.topics) home.set(topic, family.label);
  }

  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const label = home.get(topicOf(item)) ?? OTHER_FAMILY;
    const list = buckets.get(label);
    if (list) list.push(item);
    else buckets.set(label, [item]);
  }

  const out: { family: TopicFamily; items: T[] }[] = [];
  for (const family of families) {
    const bucket = buckets.get(family.label);
    if (bucket?.length) out.push({ family, items: bucket });
  }
  const rest = buckets.get(OTHER_FAMILY);
  if (rest?.length) out.push({ family: { label: OTHER_FAMILY, topics: [] }, items: rest });
  return out;
}

/**
 * Comparator placing topics in learning order — the order the canonical family
 * arrays list them (which mirror `topic_spine`). Topics outside the canonical
 * list fall to the end, alphabetically, matching groupByFamily's "Other topics".
 */
export function topicOrderComparator(level: string): (a: string, b: string) => number {
  const rank = new Map<string, number>();
  topicFamilies(level).forEach((family, fi) =>
    family.topics.forEach((topic, ti) => rank.set(topic, fi * 1000 + ti)),
  );
  return (a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb || a.localeCompare(b);
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.localeCompare(b);
  };
}

/** URL path for a topic index page. */
export function topicUrl(level: string, topic: string): string {
  return `${NOTES_BASE}/${level.toLowerCase()}/${topicSlug(topic)}`;
}

/** URL path for one sub-group page. */
export function subgroupUrl(level: string, topic: string, name: string): string {
  return `${topicUrl(level, topic)}/${topicSlug(name)}`;
}

/**
 * Order sub-groups within a topic: by `order_index`, then name as a stable
 * tiebreak. Rows with a null order_index sort last rather than colliding at 0.
 */
export function sortSubgroups(rows: SubgroupRow[]): SubgroupRow[] {
  return [...rows].sort((a, b) => {
    const ao = a.order_index ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order_index ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Rank display_group section names for a topic: sections known to
 * `sections_meta` first (in their configured order), then unknown ones
 * alphabetically. The /revise swipe decks share the known-first rule but anchor
 * unknown sections to card position instead (lib/deck-order.ts) — they order
 * whole topics, whereas this ranks within a single sub-group page.
 */
export function sectionRanker(
  sectionNames: string[],
  meta: SectionMetaRow[],
): (name: string) => number {
  const metaOrder = new Map(meta.map(m => [m.name, m.order_index]));
  const distinct = [...new Set(sectionNames)];
  const known = distinct
    .filter(s => metaOrder.has(s))
    .sort((a, b) => (metaOrder.get(a) as number) - (metaOrder.get(b) as number));
  const unknown = distinct.filter(s => !metaOrder.has(s)).sort();
  const rank = new Map([...known, ...unknown].map((s, i) => [s, i]));
  return (name: string) => rank.get(name) ?? Number.MAX_SAFE_INTEGER;
}

export interface NotesSection {
  /** Student-facing section heading. */
  name: string;
  /** Anchor id, used by the table of contents. */
  id: string;
  snippets: SnippetRow[];
}

/**
 * Split one sub-group's snippets into display_group sections, ordered by
 * `sections_meta`, with snippets inside a section ordered by `order_index`.
 *
 * A NULL `display_group` falls back to the sub-group's own name (documented in
 * CLAUDE.md's Database section) — that is the common case: 196 of 303 AM
 * worked-example rows carry no display_group.
 */
export function buildSections(
  snippets: SnippetRow[],
  subgroupName: string,
  meta: SectionMetaRow[],
): NotesSection[] {
  const named = snippets.map(s => ({
    snippet: s,
    section: s.display_group ?? subgroupName,
  }));
  const rankOf = sectionRanker(
    named.map(n => n.section),
    meta,
  );

  const bySection = new Map<string, SnippetRow[]>();
  for (const { snippet, section } of named) {
    const list = bySection.get(section);
    if (list) list.push(snippet);
    else bySection.set(section, [snippet]);
  }

  return [...bySection.entries()]
    .sort(([a], [b]) => {
      const r = rankOf(a) - rankOf(b);
      return r !== 0 ? r : a.localeCompare(b);
    })
    .map(([name, list]) => ({
      name,
      id: sectionAnchor(name),
      snippets: [...list].sort(
        (x, y) => (x.order_index ?? 0) - (y.order_index ?? 0),
      ),
    }));
}

/** Stable DOM id for a section heading, for TOC anchors. */
export function sectionAnchor(name: string): string {
  return `section-${topicSlug(name) || 'untitled'}`;
}

// ── Page tree (fumadocs `Root`) ──────────────────────────────────────────────
// Built at request time rather than by fumadocs-mdx: our content lives in
// Supabase, so there are no MDX files for the build-time source API to collect.
// The shape matches fumadocs-core/page-tree's Root/Folder/Item interfaces.

export interface TreeItem {
  type: 'page';
  name: string;
  url: string;
  $id: string;
}

export interface TreeFolder {
  type: 'folder';
  name: string;
  $id: string;
  index: TreeItem;
  children: TreeItem[];
  defaultOpen?: boolean;
}

/** A family heading in the sidebar — fumadocs renders these as a plain label. */
export interface TreeSeparator {
  type: 'separator';
  name: string;
  $id: string;
}

export type TreeNode = TreeFolder | TreeSeparator;

export interface TreeRoot {
  name: string;
  /** Level code the tree was built for, so `filterTree` can re-group by family. */
  level: string;
  children: TreeNode[];
  /**
   * Identity of this particular tree. Not decoration: fumadocs' TreeContextProvider
   * memoises with `useMemo(() => rawTree, [rawTree.$id])`, so a re-render carrying
   * a NEW tree object under an UNCHANGED `$id` is silently ignored. The sidebar
   * filter therefore has to vary this — see `filterTree`.
   */
  $id: string;
}

/** The topic folders, without the family separators between them. */
export function treeFolders(tree: TreeRoot): TreeFolder[] {
  return tree.children.filter((n): n is TreeFolder => n.type === 'folder');
}

/** Interleave family separators between topic folders, in syllabus order. */
function withFamilySeparators(level: string, folders: TreeFolder[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const { family, items } of groupByFamily(level, folders, f => f.name)) {
    out.push({
      type: 'separator',
      name: family.label,
      $id: `family-${level.toLowerCase()}-${topicSlug(family.label)}`,
    });
    out.push(...items);
  }
  return out;
}

/**
 * Build the sidebar tree for one level. Topics become collapsible folders whose
 * index page is the topic page; each sub-group becomes a leaf page.
 *
 * Sub-groups with no renderable snippets are dropped — an empty page in the
 * sidebar is a dead end for a student. Topics left with no pages are dropped
 * too, UNLESS the topic has a Quick Revision card (`cardTopics`) — then the
 * topic-index page itself is the content and it stays in the tree with no
 * children. Without this every card-only EM topic would be unreachable: EM
 * has 44 topic cards but (today) example pages under only 6 topics.
 */
export function buildPageTree(
  level: string,
  subgroups: SubgroupRow[],
  snippetCountBySubgroup: Map<number, number>,
  convertedTopics: Set<string> = new Set(),
  cardTopics: Set<string> = new Set(),
): TreeRoot {
  // Filed at this level, or lent to it (ip_extra_level) — audience filtering
  // already happened upstream, this is tree membership only.
  const levelRows = subgroups.filter(s => subgroupInTree(s, level));

  const byTopic = new Map<string, SubgroupRow[]>();
  for (const row of levelRows) {
    const list = byTopic.get(row.topic);
    if (list) list.push(row);
    else byTopic.set(row.topic, [row]);
  }
  // Card-only topics may have no sub-group rows at all — they still get a node.
  const allTopics = new Set([...byTopic.keys(), ...cardTopics]);

  const folders: TreeFolder[] = [];
  for (const topic of [...allTopics].sort(topicOrderComparator(level))) {
    // A converted topic (approved learning units) reads as one page whose
    // sections the right-hand contents already lists — its old sub-group pages
    // stay off the sidebar, where they no longer match what students read.
    const converted = convertedTopics.has(topic);
    const children = converted
      ? []
      : sortSubgroups(byTopic.get(topic) ?? [])
          .filter(sg => (snippetCountBySubgroup.get(sg.id) ?? 0) > 0)
          .map<TreeItem>(sg => ({
            type: 'page',
            name: sg.name,
            url: subgroupUrl(level, topic, sg.name),
            $id: `sg-${sg.id}`,
          }));

    if (children.length === 0 && !converted && !cardTopics.has(topic)) continue;

    // No tool pages in the sidebar — /notes surfaces no tools at all (Adrian,
    // 2026-08-07, closing the 2026-08-06 decision: the recap surface is for
    // reading; tools belong to the lesson-unit player, or /tools directly).

    folders.push({
      type: 'folder',
      name: topic,
      $id: `topic-${level.toLowerCase()}-${topicSlug(topic)}`,
      index: {
        type: 'page',
        name: topic,
        url: topicUrl(level, topic),
        $id: `topic-index-${level.toLowerCase()}-${topicSlug(topic)}`,
      },
      children,
    });
  }

  return {
    name: levelLabel(level),
    level,
    children: withFamilySeparators(level, folders),
    $id: `notes-${level.toLowerCase()}`,
  };
}

/**
 * Client-side sidebar filter (Phase 1 search). Matches topic folder names and
 * sub-group page names, case-insensitively.
 *
 * A hit on the topic name keeps the whole topic — someone typing "surds" wants
 * every Surds page, not just the ones repeating the word. Otherwise the folder
 * keeps only its matching pages, and empty folders drop out. Surviving folders
 * are force-opened so results are visible without another click.
 */
export function filterTree(tree: TreeRoot, query: string): TreeRoot {
  const q = query.trim().toLowerCase();
  if (!q) return tree;

  const kept: TreeFolder[] = [];
  for (const folder of treeFolders(tree)) {
    const topicHit = folder.name.toLowerCase().includes(q);
    const children = topicHit
      ? folder.children
      : folder.children.filter(c => c.name.toLowerCase().includes(q));
    if (children.length === 0) continue;
    kept.push({ ...folder, children, defaultOpen: true });
  }
  // Re-grouped from the survivors rather than filtered in place, so a family
  // whose every topic was filtered out takes its heading with it.
  // `$id` MUST encode the query — fumadocs re-reads the tree only when `$id`
  // changes, so returning the filtered tree under the root's own id renders the
  // filter completely inert (it did, until this was caught).
  return {
    ...tree,
    children: withFamilySeparators(tree.level, kept),
    $id: `${tree.$id}::q=${q}`,
  };
}

export function levelLabel(level: string): string {
  const found = NOTES_LEVELS.find(
    l => l.code.toUpperCase() === level.toUpperCase(),
  );
  return found ? found.label : level.toUpperCase();
}

/** Resolve a URL slug back to its canonical topic/sub-group name. */
export function matchBySlug<T>(
  rows: T[],
  slug: string,
  nameOf: (row: T) => string,
): T | null {
  return rows.find(r => topicSlug(nameOf(r)) === slug) ?? null;
}

/**
 * Flatten the tree into page order (topic index, then its sub-groups) so
 * prev/next can walk it. Returns URLs paired with their display names.
 */
export function flattenPages(tree: TreeRoot): { name: string; url: string }[] {
  const out: { name: string; url: string }[] = [];
  for (const folder of treeFolders(tree)) {
    out.push({ name: folder.index.name, url: folder.index.url });
    for (const child of folder.children) {
      out.push({ name: child.name, url: child.url });
    }
  }
  return out;
}

/** Previous/next neighbours for a URL in flattened page order. */
export function neighbours(
  tree: TreeRoot,
  url: string,
): { previous?: { name: string; url: string }; next?: { name: string; url: string } } {
  const pages = flattenPages(tree);
  const i = pages.findIndex(p => p.url === url);
  if (i === -1) return {};
  return {
    previous: i > 0 ? pages[i - 1] : undefined,
    next: i < pages.length - 1 ? pages[i + 1] : undefined,
  };
}
