import { describe, it, expect } from 'vitest';
import { deckSectionName, orderDeckCards, type DeckCardRow } from './deck-order';

function card(
  id: string,
  subgroup_id: number,
  order_index: number | null,
  display_group: string | null = null,
): DeckCardRow {
  return { id, subgroup_id, display_group, order_index };
}

/** Section sequence as the desktop view would group it (consecutive names collapsed). */
function sectionRuns(cards: DeckCardRow[], subgroups: Record<number, { name: string }>): string[] {
  const runs: string[] = [];
  for (const c of cards) {
    const s = deckSectionName(c, subgroups);
    if (runs[runs.length - 1] !== s) runs.push(s);
  }
  return runs;
}

describe('orderDeckCards — sections stay contiguous under the desktop grouping key', () => {
  // Shape of the real EM Trigonometry deck (2026-08-27): no sections_meta rows,
  // most cards null display_group, a few named one-off sections. The old sort
  // put both named sections first (alphabetical) and interleaved everything
  // else by order_index — duplicate "Sine Rule"/"Cosine Rule"/… React keys.
  const trigSubgroups = {
    1136: { id: 1136, name: 'Right-Angled Triangle Trigonometry', order_index: 1 },
    1137: { id: 1137, name: 'Sine Rule', order_index: 2 },
    1138: { id: 1138, name: 'Cosine Rule', order_index: 3 },
    1142: { id: 1142, name: 'Trig Equations', order_index: 7 },
  };
  const trigCards = [
    card('obtuse', 1142, 1, 'Obtuse angle ratios'),
    card('rat-1', 1136, 1),
    card('sine-1', 1137, 1),
    card('cos-1', 1138, 1),
    card('rat-2', 1136, 2),
    card('sine-2', 1137, 2),
    card('cos-2', 1138, 2),
    card('trig-eq-2', 1142, 2),
    card('choosing', 1138, 3, 'Choosing sine or cosine rule'),
    card('pythag', 1136, 3, 'Pythagoras check'),
  ];

  it('no sections_meta: sub-group order rules, named one-offs slot in at their card position', () => {
    const sorted = orderDeckCards(trigCards, trigSubgroups, []);
    expect(sectionRuns(sorted, trigSubgroups)).toEqual([
      'Right-Angled Triangle Trigonometry',
      'Pythagoras check',
      'Sine Rule',
      'Cosine Rule',
      'Choosing sine or cosine rule',
      'Obtuse angle ratios',
      'Trig Equations',
    ]);
    expect(sorted.map(c => c.id)).toEqual([
      'rat-1', 'rat-2', 'pythag',
      'sine-1', 'sine-2',
      'cos-1', 'cos-2', 'choosing',
      'obtuse', 'trig-eq-2',
    ]);
  });

  it('every section forms exactly one run — the duplicate-key regression', () => {
    const sorted = orderDeckCards(trigCards, trigSubgroups, []);
    const runs = sectionRuns(sorted, trigSubgroups);
    expect(new Set(runs).size).toBe(runs.length);
  });

  it('result order is independent of fetch order', () => {
    const shuffled = [...trigCards].reverse();
    expect(orderDeckCards(shuffled, trigSubgroups, []).map(c => c.id)).toEqual(
      orderDeckCards(trigCards, trigSubgroups, []).map(c => c.id),
    );
  });

  it('sections_meta order wins for named sections, meta-less sections trail in sub-group order', () => {
    const subgroups = {
      105: { id: 105, name: 'Basics', order_index: 1 },
      108: { id: 108, name: 'Applications', order_index: 2 },
    };
    const cards = [
      card('b1', 105, 1),
      card('simp-a', 105, 1, 'Simplifying Surds'),
      card('simp-b', 108, 2, 'Simplifying Surds'),
      card('app-1', 108, 1),
      card('lin-a', 105, 1, 'Linear Equations'),
    ];
    // Meta reverses the anchor order: Linear Equations before Simplifying Surds.
    const meta = [
      { name: 'Linear Equations', order_index: 1 },
      { name: 'Simplifying Surds', order_index: 2 },
    ];
    const sorted = orderDeckCards(cards, subgroups, meta);
    expect(sectionRuns(sorted, subgroups)).toEqual([
      'Linear Equations',
      'Simplifying Surds',
      'Basics',
      'Applications',
    ]);
    // The spanning section keeps its editor-written order_index sequence.
    expect(sorted.map(c => c.id)).toEqual(['lin-a', 'simp-a', 'simp-b', 'b1', 'app-1']);
  });

  it('null order_index sorts a sub-group last, not first', () => {
    const subgroups = {
      1: { id: 1, name: 'Ranked', order_index: 1 },
      2: { id: 2, name: 'Unranked', order_index: null },
    };
    const sorted = orderDeckCards([card('u', 2, 1), card('r', 1, 1)], subgroups, []);
    expect(sorted.map(c => c.id)).toEqual(['r', 'u']);
  });
});

describe('deckSectionName', () => {
  it('prefers display_group, falls back to sub-group name, then empty string', () => {
    const subgroups = { 7: { name: 'Vectors' } };
    expect(deckSectionName(card('a', 7, 1, 'Dot Product'), subgroups)).toBe('Dot Product');
    expect(deckSectionName(card('b', 7, 1), subgroups)).toBe('Vectors');
    expect(deckSectionName(card('c', 99, 1), subgroups)).toBe('');
  });
});
