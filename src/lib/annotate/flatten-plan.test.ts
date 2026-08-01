import { describe, expect, it } from 'vitest';
import { planFlatten } from './flatten-plan';

const pages = [
  { photoIndex: 0, url: 'https://x.public.blob.vercel-storage.com/p0.png' },
  { photoIndex: 1, url: 'https://x.public.blob.vercel-storage.com/p1.png' },
  { photoIndex: 2, url: 'https://x.public.blob.vercel-storage.com/p2.png' },
];

describe('planFlatten', () => {
  it('flags inked pages for re-encode, passes the rest through with their ORIGINAL url', () => {
    const plan = planFlatten(pages, [1]);
    expect(plan).toEqual([
      { photoIndex: 0, url: pages[0].url, reencode: false },
      { photoIndex: 1, url: pages[1].url, reencode: true },
      { photoIndex: 2, url: pages[2].url, reencode: false },
    ]);
  });
  it('orders by photoIndex regardless of input order', () => {
    const shuffled = [pages[2], pages[0], pages[1]];
    expect(planFlatten(shuffled, []).map((p) => p.photoIndex)).toEqual([0, 1, 2]);
  });
  it('throws on an empty run', () => {
    expect(() => planFlatten([], [])).toThrow(/no pages/);
  });
  it('throws when an inked index is not a known page (catches wiring bugs)', () => {
    expect(() => planFlatten(pages, [7])).toThrow(/not in the page list/);
  });
  it('no ink at all → every page passes through', () => {
    expect(planFlatten(pages, []).every((p) => !p.reencode)).toBe(true);
  });
});
