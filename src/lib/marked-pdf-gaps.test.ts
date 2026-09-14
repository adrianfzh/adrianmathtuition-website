import { describe, it, expect } from 'vitest';
import { missingAnnotatedPages } from './marked-pdf-gaps';

const src = (...idx: number[]) => idx.map(i => ({ photo_index: i, original_url: `https://www.adrianmathtuition.com/api/files/handins/s/p${i}.jpg` }));
const ann = (...idx: number[]) => idx.map(i => ({ photo_index: i, url: `https://www.adrianmathtuition.com/api/files/runs/r/annotated/p${i}.jpg` }));

describe('missingAnnotatedPages', () => {
  it('finds nothing when every page was annotated', () => {
    expect(missingAnnotatedPages(src(0, 1, 2), ann(0, 1, 2))).toEqual([]);
  });

  // Alexis Wong, A Math GCE 2022 Paper 1 (run 94326fea): 17 pages handed in,
  // pages 6, 8, 10 and 12 lost their annotated JPEG to `fetch failed`.
  it('finds the pages whose annotated image never uploaded, in page order', () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const got = missingAnnotatedPages(src(...all), ann(...all.filter(i => ![6, 8, 10, 12].includes(i))));
    expect(got.map(g => g.photo_index)).toEqual([6, 8, 10, 12]);
    expect(got[0].url).toContain('/api/files/handins/');
  });

  it('an annotated row pointing at nothing is still a missing page', () => {
    const got = missingAnnotatedPages(src(0, 1), [{ photo_index: 0, url: '' }, ...ann(1)]);
    expect(got.map(g => g.photo_index)).toEqual([0]);
  });

  it('a page with no original kept is left alone — there is nothing to fall back to', () => {
    const got = missingAnnotatedPages([{ photo_index: 0 }, { photo_index: 1, original_url: '  ' }, ...src(2)], []);
    expect(got.map(g => g.photo_index)).toEqual([2]);
  });

  it('out-of-order source, duplicates and junk rows do not confuse it', () => {
    const got = missingAnnotatedPages([...src(3), null, 'junk', { photo_index: -1, original_url: 'u' }, ...src(1), ...src(3)], ann(9));
    expect(got.map(g => g.photo_index)).toEqual([1, 3]);
  });

  it('an unreadable run yields [] — the PDF is exactly the one it always was', () => {
    expect(missingAnnotatedPages(null, ann(0))).toEqual([]);
    expect(missingAnnotatedPages(undefined, undefined)).toEqual([]);
    expect(missingAnnotatedPages('nope', [])).toEqual([]);
  });

  it('a run with no annotated pages at all falls back to every page', () => {
    expect(missingAnnotatedPages(src(0, 1, 2), []).map(g => g.photo_index)).toEqual([0, 1, 2]);
  });
});
