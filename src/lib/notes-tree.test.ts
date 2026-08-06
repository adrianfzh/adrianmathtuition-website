import { describe, it, expect } from 'vitest';
import {
  buildPageTree,
  buildSections,
  filterTree,
  flattenPages,
  groupByFamily,
  matchBySlug,
  neighbours,
  sectionRanker,
  sortSubgroups,
  subgroupUrl,
  topicUrl,
  treeFolders,
  type SectionMetaRow,
  type SnippetRow,
  type SubgroupRow,
  type TreeRoot,
} from './notes-tree';

/** Topic folders only — `children` also carries the family separators. */
const folders = (tree: TreeRoot) => treeFolders(tree);
const folderNames = (tree: TreeRoot) => folders(tree).map(f => f.name);
const folderNamed = (tree: TreeRoot, name: string) =>
  folders(tree).find(f => f.name === name);
const separators = (tree: TreeRoot) =>
  tree.children.filter(n => n.type === 'separator').map(n => n.name);

const sg = (
  id: number,
  topic: string,
  name: string,
  order_index: number | null = 0,
  level = 'AM',
): SubgroupRow => ({ id, level, topic, name, description: null, order_index });

const snip = (
  id: string,
  subgroup_id: number,
  order_index: number,
  display_group: string | null = null,
): SnippetRow => ({
  id,
  subgroup_id,
  display_group,
  order_index,
  card_title: `card ${id}`,
  content: `content ${id}`,
});

const counts = (...ids: number[]) => new Map(ids.map(id => [id, 1]));

describe('urls', () => {
  it('slugifies level, topic and sub-group', () => {
    expect(topicUrl('AM', 'Trigonometry (R-Formula)')).toBe(
      '/notes/am/trigonometry-r-formula',
    );
    expect(subgroupUrl('AM', 'Surds', 'Rationalising the Denominator')).toBe(
      '/notes/am/surds/rationalising-the-denominator',
    );
  });
});

describe('sortSubgroups', () => {
  it('orders by order_index then name', () => {
    const rows = [sg(3, 'T', 'Charlie', 2), sg(1, 'T', 'Alpha', 1), sg(2, 'T', 'Bravo', 1)];
    expect(sortSubgroups(rows).map(r => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts null order_index last instead of treating it as zero', () => {
    const rows = [sg(1, 'T', 'NoOrder', null), sg(2, 'T', 'First', 5)];
    expect(sortSubgroups(rows).map(r => r.name)).toEqual(['First', 'NoOrder']);
  });

  it('does not mutate its input', () => {
    const rows = [sg(2, 'T', 'B', 2), sg(1, 'T', 'A', 1)];
    const before = rows.map(r => r.id);
    sortSubgroups(rows);
    expect(rows.map(r => r.id)).toEqual(before);
  });
});

describe('sectionRanker', () => {
  const meta: SectionMetaRow[] = [
    { level: 'AM', topic: 'Indices', name: 'Graphs', order_index: 1 },
    { level: 'AM', topic: 'Indices', name: 'Laws', order_index: 0 },
  ];

  it('puts sections_meta sections first in their configured order', () => {
    const rank = sectionRanker(['Graphs', 'Laws'], meta);
    expect(rank('Laws')).toBeLessThan(rank('Graphs'));
  });

  it('appends unknown sections alphabetically after known ones', () => {
    const rank = sectionRanker(['Zebra', 'Graphs', 'Apple'], meta);
    expect(rank('Graphs')).toBeLessThan(rank('Apple'));
    expect(rank('Apple')).toBeLessThan(rank('Zebra'));
  });
});

describe('buildSections', () => {
  it('falls back to the sub-group name when display_group is NULL', () => {
    const out = buildSections([snip('a', 1, 0)], 'Quadratic Graphs', []);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Quadratic Graphs');
  });

  it('splits snippets into their display_group sections', () => {
    const out = buildSections(
      [snip('a', 1, 0, 'Basics'), snip('b', 1, 1, 'Harder'), snip('c', 1, 2, 'Basics')],
      'Fallback',
      [],
    );
    expect(out.map(s => s.name)).toEqual(['Basics', 'Harder']);
    expect(out[0].snippets.map(s => s.id)).toEqual(['a', 'c']);
  });

  it('orders snippets within a section by order_index', () => {
    const out = buildSections(
      [snip('late', 1, 9, 'S'), snip('early', 1, 1, 'S')],
      'Fallback',
      [],
    );
    expect(out[0].snippets.map(s => s.id)).toEqual(['early', 'late']);
  });

  it('orders sections by sections_meta, not insertion order', () => {
    const meta: SectionMetaRow[] = [
      { level: 'AM', topic: 'Indices', name: 'Second', order_index: 5 },
      { level: 'AM', topic: 'Indices', name: 'First', order_index: 1 },
    ];
    const out = buildSections(
      [snip('a', 1, 0, 'Second'), snip('b', 1, 1, 'First')],
      'Fallback',
      meta,
    );
    expect(out.map(s => s.name)).toEqual(['First', 'Second']);
  });

  it('gives each section a stable anchor id', () => {
    const out = buildSections([snip('a', 1, 0, 'R-Formula (Part 2)')], 'F', []);
    expect(out[0].id).toBe('section-r-formula-part-2');
  });

  it('groups a mix of NULL and named display_groups without losing snippets', () => {
    const out = buildSections(
      [snip('a', 1, 0, null), snip('b', 1, 1, 'Named'), snip('c', 1, 2, null)],
      'Sub Group',
      [],
    );
    expect(out.flatMap(s => s.snippets.map(x => x.id)).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('buildPageTree', () => {
  const rows = [
    sg(1, 'Surds', 'Rationalising', 0),
    sg(2, 'Surds', 'Simplifying', 1),
    sg(3, 'Indices', 'Laws of Indices', 0),
  ];

  it('nests sub-group pages under topic folders', () => {
    const tree = buildPageTree('AM', rows, counts(1, 2, 3));
    expect(folderNames(tree)).toEqual(['Indices', 'Surds']);
    expect(folderNamed(tree, 'Surds')?.children.map(c => c.name)).toEqual([
      'Rationalising',
      'Simplifying',
    ]);
  });

  it('gives every topic folder an index page pointing at the topic url', () => {
    const tree = buildPageTree('AM', rows, counts(1, 2, 3));
    expect(folderNamed(tree, 'Indices')?.index.url).toBe('/notes/am/indices');
  });

  it('drops sub-groups that have no renderable snippets', () => {
    const tree = buildPageTree('AM', rows, counts(1, 3));
    expect(folderNamed(tree, 'Surds')?.children.map(c => c.name)).toEqual([
      'Rationalising',
    ]);
  });

  it('drops a topic entirely when none of its sub-groups have content', () => {
    const tree = buildPageTree('AM', rows, counts(3));
    expect(folderNames(tree)).toEqual(['Indices']);
  });

  it('ignores sub-groups from other levels', () => {
    const mixed = [...rows, sg(9, 'Numbers', 'Ordering', 0, 'S1')];
    const tree = buildPageTree('AM', mixed, counts(1, 2, 3, 9));
    expect(folderNames(tree)).not.toContain('Numbers');
  });

  it('matches level case-insensitively', () => {
    const tree = buildPageTree('am', rows, counts(1, 2, 3));
    expect(folders(tree)).toHaveLength(2);
  });

  it('returns an empty tree rather than throwing when there is no content', () => {
    expect(buildPageTree('AM', rows, new Map()).children).toEqual([]);
  });

  it('heads each family with a separator, in syllabus order', () => {
    const tree = buildPageTree(
      'AM',
      [sg(1, 'Surds', 'Rationalising', 0), sg(2, 'Kinematics', 'Velocity', 0)],
      counts(1, 2),
    );
    expect(separators(tree)).toEqual(['Algebra & Functions', 'Calculus']);
    expect(tree.children.map(n => n.name)).toEqual([
      'Algebra & Functions',
      'Surds',
      'Calculus',
      'Kinematics',
    ]);
  });

  // Tools left /notes entirely (Adrian, 2026-08-07) — even a topic with a
  // lesson-grade tool gets no tool page in its folder.
  it('never appends a tool page, even for a topic with a lesson-grade tool', () => {
    const tree = buildPageTree('AM', [sg(1, 'Linear Law', 'Plotting', 0)], counts(1));
    expect(folderNamed(tree, 'Linear Law')?.children.map(c => c.url)).toEqual([
      '/notes/am/linear-law/plotting',
    ]);
  });
});

describe('groupByFamily', () => {
  const item = (topic: string) => ({ topic });

  it('buckets topics into their syllabus families, dropping empty ones', () => {
    const out = groupByFamily('AM', [item('Surds'), item('Circles')], i => i.topic);
    expect(out.map(g => g.family.label)).toEqual(['Algebra & Functions', 'Geometry']);
  });

  it('collects unrecognised topics into a trailing bucket rather than dropping them', () => {
    const out = groupByFamily('AM', [item('Sudoku'), item('Surds')], i => i.topic);
    expect(out.map(g => g.family.label)).toEqual(['Algebra & Functions', 'Other topics']);
    expect(out[1].items).toEqual([item('Sudoku')]);
  });

  it('keeps every item when a level has no family grouping', () => {
    const out = groupByFamily('S1', [item('Numbers')], i => i.topic);
    expect(out).toHaveLength(1);
    expect(out[0].items).toEqual([item('Numbers')]);
  });

  it('returns nothing for no items', () => {
    expect(groupByFamily('AM', [], (i: { topic: string }) => i.topic)).toEqual([]);
    expect(groupByFamily('S1', [], (i: { topic: string }) => i.topic)).toEqual([]);
  });
});

describe('flattenPages / neighbours', () => {
  const tree = buildPageTree(
    'AM',
    [sg(1, 'Surds', 'Rationalising', 0), sg(2, 'Surds', 'Simplifying', 1), sg(3, 'Indices', 'Laws', 0)],
    counts(1, 2, 3),
  );

  it('walks topic index then its sub-groups, in sidebar order', () => {
    expect(flattenPages(tree).map(p => p.url)).toEqual([
      '/notes/am/indices',
      '/notes/am/indices/laws',
      '/notes/am/surds',
      '/notes/am/surds/rationalising',
      '/notes/am/surds/simplifying',
    ]);
  });

  it('links prev/next across a topic boundary', () => {
    const n = neighbours(tree, '/notes/am/indices/laws');
    expect(n.previous?.url).toBe('/notes/am/indices');
    expect(n.next?.url).toBe('/notes/am/surds');
  });

  it('has no previous on the first page and no next on the last', () => {
    expect(neighbours(tree, '/notes/am/indices').previous).toBeUndefined();
    expect(neighbours(tree, '/notes/am/surds/simplifying').next).toBeUndefined();
  });

  it('returns nothing for a url not in the tree', () => {
    expect(neighbours(tree, '/notes/am/nope')).toEqual({});
  });
});

describe('filterTree', () => {
  const tree = buildPageTree(
    'AM',
    [
      sg(1, 'Surds', 'Rationalising', 0),
      sg(2, 'Surds', 'Simplifying', 1),
      sg(3, 'Indices', 'Laws of Indices', 0),
      sg(4, 'Logarithms', 'Change of Base', 0),
    ],
    counts(1, 2, 3, 4),
  );

  it('returns the tree untouched for an empty query', () => {
    expect(filterTree(tree, '')).toBe(tree);
    expect(filterTree(tree, '   ')).toBe(tree);
  });

  it('keeps every page of a topic whose name matches', () => {
    const out = filterTree(tree, 'surds');
    expect(folderNames(out)).toEqual(['Surds']);
    expect(folders(out)[0].children.map(c => c.name)).toEqual([
      'Rationalising',
      'Simplifying',
    ]);
  });

  it('keeps only matching pages when the topic name does not match', () => {
    const out = filterTree(tree, 'rationalis');
    expect(folderNames(out)).toEqual(['Surds']);
    expect(folders(out)[0].children.map(c => c.name)).toEqual(['Rationalising']);
  });

  it('is case-insensitive', () => {
    expect(folders(filterTree(tree, 'LAWS'))[0].children[0].name).toBe('Laws of Indices');
  });

  it('force-opens surviving folders so hits are visible', () => {
    expect(folders(filterTree(tree, 'change'))[0].defaultOpen).toBe(true);
  });

  it('drops topics with no match at all', () => {
    expect(filterTree(tree, 'zzzz').children).toEqual([]);
  });

  it('matches across several topics at once', () => {
    // "of" appears in "Laws of Indices" and "Change of Base"
    expect(folderNames(filterTree(tree, 'of '))).toEqual(['Indices', 'Logarithms']);
  });

  // A family heading with nothing under it is worse than no heading: it reads as
  // a section the filter emptied by accident.
  it('takes a family heading away with its last topic', () => {
    const mixed = buildPageTree(
      'AM',
      [sg(1, 'Surds', 'Rationalising', 0), sg(2, 'Kinematics', 'Velocity', 0)],
      counts(1, 2),
    );
    expect(separators(filterTree(mixed, 'surds'))).toEqual(['Algebra & Functions']);
  });

  it('does not mutate the source tree', () => {
    const before = JSON.stringify(tree);
    filterTree(tree, 'surds');
    expect(JSON.stringify(tree)).toBe(before);
  });

  // Regression: fumadocs' TreeContextProvider does
  //   const tree = useMemo(() => rawTree, [rawTree.$id])
  // so it re-reads the tree ONLY when `$id` changes. The first cut of filterTree
  // returned `{...tree, children}` — a new object under the root's own `$id` —
  // and the sidebar filter did nothing at all in the browser while every
  // filtering test here still passed. Distinct queries must yield distinct ids.
  it('gives each query a distinct $id so fumadocs re-reads the tree', () => {
    const ids = ['surds', 'laws', 'change', 'zzzz'].map(q => filterTree(tree, q).$id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).not.toBe(tree.$id);
  });

  it('is case- and whitespace-stable in $id, so equivalent queries agree', () => {
    expect(filterTree(tree, 'Surds').$id).toBe(filterTree(tree, '  surds ').$id);
  });
});

describe('matchBySlug', () => {
  it('resolves a slug back to its canonical name', () => {
    const topics = ['Trigonometry (R-Formula)', 'Surds'];
    expect(matchBySlug(topics, 'trigonometry-r-formula', t => t)).toBe(
      'Trigonometry (R-Formula)',
    );
  });

  it('returns null when nothing matches', () => {
    expect(matchBySlug(['Surds'], 'calculus', t => t)).toBeNull();
  });
});
