import { describe, it, expect } from 'vitest';
import { pagesSignature } from './pages-key';

const a = { photoIndex: 0, url: '/api/files/runs/r/p0.png', layerUrl: '/api/files/runs/r/l0.svg', rot: 0 };
const b = { photoIndex: 1, url: '/api/files/runs/r/p1.png', layerUrl: null, rot: 90 };

describe('pagesSignature — the overlay ignores identity-only prop churn (10 Sep 2026)', () => {
  it('a fresh array of the same pages has the same key', () => {
    expect(pagesSignature([a, b])).toBe(pagesSignature([{ ...a }, { ...b }]));
    expect(pagesSignature([a, b])).toBe(pagesSignature([a, b].map(p => ({ ...p }))));
  });
  it('a real change to any page changes the key', () => {
    expect(pagesSignature([a, b])).not.toBe(pagesSignature([a]));
    expect(pagesSignature([a, b])).not.toBe(pagesSignature([a, { ...b, url: '/api/files/runs/r/p1-v2.png' }]));
    expect(pagesSignature([a, b])).not.toBe(pagesSignature([a, { ...b, layerUrl: '/api/files/runs/r/l1.svg' }]));
    expect(pagesSignature([a, b])).not.toBe(pagesSignature([a, { ...b, rot: 0 }]));
    expect(pagesSignature([a, b])).not.toBe(pagesSignature([{ ...a, layer: { boxes: [] } }, b]));
  });
  it('empty and missing are the same, empty key', () => {
    expect(pagesSignature([])).toBe('');
    expect(pagesSignature(null)).toBe('');
  });
});
