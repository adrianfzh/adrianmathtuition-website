import { describe, it, expect } from 'vitest';
import { pickShelfTwin, seenQuestionIds, shelfLedgerNote, type ShelfTwin } from './practice-shelf';

const tw = (id: string, o: Partial<ShelfTwin> = {}): ShelfTwin => ({ id, twin_of: 's-' + id, total_marks: 4, difficulty: 'standard', verified: true, ...o });

describe('pickShelfTwin', () => {
  it('empty shelf -> null', () => { expect(pickShelfTwin([], { marks: 3, seenIds: [] })).toBeNull(); });
  it('verified only', () => {
    expect(pickShelfTwin([tw('a', { verified: false }), tw('b', { verified: null })], { marks: null, seenIds: [] })).toBeNull();
  });
  it('never reported or removed', () => {
    expect(pickShelfTwin([tw('a', { reported_at: '2026-09-30' }), tw('b', { deleted_at: 'x' })], { marks: null, seenIds: [] })).toBeNull();
  });
  it('unseen only: the twin, or its source, already met is skipped', () => {
    const r = pickShelfTwin([tw('a'), tw('b'), tw('c')], { marks: null, seenIds: ['a', 's-b'] });
    expect(r?.id).toBe('c');
    expect(pickShelfTwin([tw('a')], { marks: null, seenIds: ['a'] })).toBeNull();
  });
  it('marks-closest wins', () => {
    const r = pickShelfTwin([tw('a', { total_marks: 2 }), tw('b', { total_marks: 5 }), tw('c', { total_marks: 7 })], { marks: 5, seenIds: [] });
    expect(r?.id).toBe('b');
  });
  it('unknown marks = no preference, unknown twin marks tie at zero', () => {
    expect(pickShelfTwin([tw('a', { total_marks: null })], { marks: 4, seenIds: [] })?.id).toBe('a');
  });
  it('deterministic, and differs with the seed key', () => {
    const rows = Array.from({ length: 12 }, (_, i) => tw('q' + i));
    const a1 = pickShelfTwin(rows, { marks: 4, seenIds: [], seedKey: 'recA' });
    const a2 = pickShelfTwin([...rows].reverse(), { marks: 4, seenIds: [], seedKey: 'recA' });
    expect(a1?.id).toBe(a2?.id);
    const others = new Set(['recB', 'recC', 'recD', 'recE', 'recF'].map(k => pickShelfTwin(rows, { marks: 4, seenIds: [], seedKey: k })?.id));
    expect(others.size).toBeGreaterThan(1);
  });
  it('returns tier, marks and source', () => {
    expect(pickShelfTwin([tw('a', { difficulty: 'Challenging', total_marks: 6 })], { marks: 6, seenIds: [] })).toEqual({ id: 'a', twinOf: 's-a', tier: 'advanced', marks: 6 });
  });
});

describe('seenQuestionIds', () => {
  it('unions assignments and attempts, skipping revoked and null', () => {
    const s = seenQuestionIds([{ question_id: 'a', status: 'assigned' }, { question_id: 'b', status: 'revoked' }, { question_id: null }], [{ question_id: 'c' }, { question_id: null }]);
    expect([...s].sort()).toEqual(['a', 'c']);
  });
});

describe('shelfLedgerNote', () => {
  it('keeps the shape', () => {
    expect(shelfLedgerNote({ id: 'a', twinOf: 's', tier: 'standard', marks: 3 }, 9)).toEqual({ shelf: { twinId: 'a', twinOf: 's', marks: 3, shelfSize: 9 } });
  });
});
