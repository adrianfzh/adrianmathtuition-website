import { describe, it, expect } from 'vitest';
import { composeForwardBody, sanitiseMarkSwaps } from './compose-forward';

const base = { runId: '73cf0b11-6afa-4f64-a176-652067f4d116', photoIndex: 12, layerSvg: '<g/>', inkSvg: '' };

describe('compose-page proxy body', () => {
  it('forwards the mark swaps (the desk ink hint depends on them) alongside strokes and record edits', () => {
    const b = composeForwardBody({ ...base, strokes: [], recordEdits: [{ q: '10', part: '(b)', kind: 'note', text: null }], markSwaps: [{ q: '10', x: 330.4, y: 771, to: 'tick' }] });
    expect(b.markSwaps).toEqual([{ q: '10', x: 330.4, y: 771, to: 'tick' }]);
    expect(b.recordEdits).toHaveLength(1);
    expect(b.strokes).toEqual([]);
    expect(b.runId).toBe(base.runId);
    expect(b.photoIndex).toBe(12);
  });
  it('leaves absent lists undefined rather than inventing empty ones', () => {
    const b = composeForwardBody(base);
    expect(b.strokes).toBeUndefined();
    expect(b.recordEdits).toBeUndefined();
    expect(b.markSwaps).toBeUndefined();
  });
  it('drops malformed swaps and keeps the well-formed ones', () => {
    expect(sanitiseMarkSwaps([
      { q: '10', x: 1, y: 2, to: 'cross' },
      { q: '', x: 1, y: 2, to: 'tick' },
      { q: '3', x: 'nan', y: 2, to: 'tick' },
      { q: '3', x: 1, y: 2, to: 'maybe' },
      null, 'x', 42,
      { q: 4, x: '5', y: '6', to: 'tick' },
    ])).toEqual([{ q: '10', x: 1, y: 2, to: 'cross' }, { q: '4', x: 5, y: 6, to: 'tick' }]);
    expect(sanitiseMarkSwaps('nope')).toBeUndefined();
  });
});
