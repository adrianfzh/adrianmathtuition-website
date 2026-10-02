import { describe, it, expect } from 'vitest';
import { QA_CARDS, buildDeck, orderRound, shuffle, type DeckCard } from './qa-cards';

describe('QA_CARDS — the SEAB 6092 qualitative-analysis table', () => {
  it('has every cation with NaOH(aq), every cation but ammonium with NH₃(aq), the five anions and the six gases', () => {
    const cations = QA_CARDS.filter(c => c.group === 'cation');
    expect(cations.filter(c => c.test === 'add NaOH(aq)').map(c => c.subject.split(' ')[0])).toEqual(['Al³⁺', 'NH₄⁺', 'Ca²⁺', 'Cu²⁺', 'Fe²⁺', 'Fe³⁺', 'Zn²⁺']);
    expect(cations.filter(c => c.test === 'add NH₃(aq)').map(c => c.subject.split(' ')[0])).toEqual(['Al³⁺', 'Ca²⁺', 'Cu²⁺', 'Fe²⁺', 'Fe³⁺', 'Zn²⁺']);
    expect(QA_CARDS.filter(c => c.group === 'anion')).toHaveLength(5);
    expect(QA_CARDS.filter(c => c.group === 'gas')).toHaveLength(6);
  });
  it('ids are unique and every card has a subject, a test and a result', () => {
    expect(new Set(QA_CARDS.map(c => c.id)).size).toBe(QA_CARDS.length);
    for (const c of QA_CARDS) { expect(c.subject).toBeTruthy(); expect(c.test).toBeTruthy(); expect(c.result).toBeTruthy(); }
  });
  it('the chloride and sulfate tests acidify with dilute nitric acid first (the scheme docks the mark without it)', () => {
    for (const id of ['anion:cl', 'anion:i', 'anion:so4']) {
      expect(QA_CARDS.find(c => c.id === id)!.test).toMatch(/^acidify with dilute nitric acid/);
    }
  });
});

describe('buildDeck', () => {
  it('forward: the ion on the front, the reagent as the cue, the observation behind; groups filter', () => {
    const deck = buildDeck(QA_CARDS, 'forward', ['gas']);
    expect(deck).toHaveLength(6);
    expect(deck.find(d => d.id === 'gas:h2')).toEqual({ id: 'gas:h2', group: 'gas', cue: 'lighted splint', front: 'H₂ (hydrogen)', back: '"pops"' });
  });
  it('reverse: the same observation under the same test folds into ONE card naming every ion (Al³⁺ or Zn²⁺ with NaOH)', () => {
    const deck = buildDeck(QA_CARDS, 'reverse', ['cation']);
    const white = deck.filter(d => d.cue === 'add NaOH(aq)' && d.front.startsWith('white precipitate, soluble'));
    expect(white).toHaveLength(1);
    expect(white[0].back).toBe('Al³⁺ (aluminium) or Zn²⁺ (zinc)');
    expect(white[0].id).toBe('cation:al:naoh+cation:zn:naoh');
    // The NH₃ line tells them apart, so it stays two cards.
    expect(deck.filter(d => d.cue === 'add NH₃(aq)' && d.front.startsWith('white precipitate')).map(d => d.back).sort())
      .toEqual(['Al³⁺ (aluminium)', 'Zn²⁺ (zinc)']);
    // Fe²⁺ and Fe³⁺ never collide: different colours.
    expect(deck.some(d => d.back.includes('iron(II)') && d.back.includes('iron(III)'))).toBe(false);
  });
  it('reverse: the two silver-nitrate anions stay apart (white vs yellow) and the two white-precipitate anions fold by TEST, not by colour', () => {
    const deck = buildDeck(QA_CARDS, 'reverse', ['anion']);
    expect(deck).toHaveLength(5);   // no two anions share (test, result)
  });
  it('an empty group list is an empty deck', () => {
    expect(buildDeck(QA_CARDS, 'forward', [])).toEqual([]);
  });
});

describe('shuffle + orderRound', () => {
  const deck: DeckCard[] = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, group: 'gas', cue: '', front: id, back: id }));
  it('shuffle is a permutation, deterministic for a seed, and leaves the input alone', () => {
    const one = shuffle(deck, 7), two = shuffle(deck, 7), other = shuffle(deck, 8);
    expect(one).toEqual(two);
    expect([...one].map(d => d.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(deck.map(d => d.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(other.map(d => d.id)).not.toEqual(one.map(d => d.id));
  });
  it('orderRound puts the unknown cards first, the known after, or only the unknown', () => {
    const known = new Set(['b', 'd']);
    expect(orderRound(deck, known, false).map(d => d.id)).toEqual(['a', 'c', 'e', 'b', 'd']);
    expect(orderRound(deck, known, true).map(d => d.id)).toEqual(['a', 'c', 'e']);
    expect(orderRound(deck, new Set(), true)).toHaveLength(5);
  });
});
