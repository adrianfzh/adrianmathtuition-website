// ── Notes portal: pure shaping logic ─────────────────────────────────────────
//
// Everything here is a pure function over rows already fetched from Supabase, so
// it is unit-testable without a network. The I/O lives in `notes-data.ts`.
//
// Tree shape (SPEC-NOTES-PORTAL Phase 1): Level → Topic → one page per sub-group.

import { topicSlug } from './topic-slug';

export const NOTES_BASE = '/notes';

/** Levels the portal exposes, in sidebar order. AM only for Phase 1. */
export const NOTES_LEVELS = [{ code: 'AM', label: 'Additional Maths' }] as const;

export type NotesLevel = (typeof NOTES_LEVELS)[number]['code'];

export interface SubgroupRow {
  id: number;
  level: string;
  topic: string;
  name: string;
  description: string | null;
  order_index: number | null;
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
 * alphabetically. Mirrors the ordering the /revise worked-examples page uses so
 * both surfaces present sections identically.
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

export interface TreeRoot {
  name: string;
  children: TreeFolder[];
  /**
   * Identity of this particular tree. Not decoration: fumadocs' TreeContextProvider
   * memoises with `useMemo(() => rawTree, [rawTree.$id])`, so a re-render carrying
   * a NEW tree object under an UNCHANGED `$id` is silently ignored. The sidebar
   * filter therefore has to vary this — see `filterTree`.
   */
  $id: string;
}

/**
 * Build the sidebar tree for one level. Topics become collapsible folders whose
 * index page is the topic page; each sub-group becomes a leaf page.
 *
 * Sub-groups with no renderable snippets are dropped — an empty page in the
 * sidebar is a dead end for a student. Topics left with no pages are dropped too.
 */
export function buildPageTree(
  level: string,
  subgroups: SubgroupRow[],
  snippetCountBySubgroup: Map<number, number>,
): TreeRoot {
  const levelRows = subgroups.filter(
    s => s.level.toUpperCase() === level.toUpperCase(),
  );

  const byTopic = new Map<string, SubgroupRow[]>();
  for (const row of levelRows) {
    const list = byTopic.get(row.topic);
    if (list) list.push(row);
    else byTopic.set(row.topic, [row]);
  }

  const folders: TreeFolder[] = [];
  for (const topic of [...byTopic.keys()].sort((a, b) => a.localeCompare(b))) {
    const children = sortSubgroups(byTopic.get(topic) as SubgroupRow[])
      .filter(sg => (snippetCountBySubgroup.get(sg.id) ?? 0) > 0)
      .map<TreeItem>(sg => ({
        type: 'page',
        name: sg.name,
        url: subgroupUrl(level, topic, sg.name),
        $id: `sg-${sg.id}`,
      }));

    if (children.length === 0) continue;

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
    children: folders,
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

  const children: TreeFolder[] = [];
  for (const folder of tree.children) {
    const topicHit = folder.name.toLowerCase().includes(q);
    const kept = topicHit
      ? folder.children
      : folder.children.filter(c => c.name.toLowerCase().includes(q));
    if (kept.length === 0) continue;
    children.push({ ...folder, children: kept, defaultOpen: true });
  }
  // `$id` MUST encode the query — fumadocs re-reads the tree only when `$id`
  // changes, so returning the filtered tree under the root's own id renders the
  // filter completely inert (it did, until this was caught).
  return { ...tree, children, $id: `${tree.$id}::q=${q}` };
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
  for (const folder of tree.children) {
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
