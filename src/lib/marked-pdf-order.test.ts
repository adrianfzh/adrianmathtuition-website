import { describe, it, expect } from 'vitest';
import { coverPhotoIndexes, frontMatterPages, orderMarkedPages } from './marked-pdf-order';

const photo = (i: number) => ({ photo_index: i, item: `photo${i}` });
const sheet = (label: string, photo_index?: number | null) => ({ photo_index, label, item: `Q${label}` });

const flat = (pages: ReturnType<typeof orderMarkedPages<string, string>>) => pages.map(p => p.item);

describe('orderMarkedPages', () => {
  it('puts each photo immediately before its own transcript sheets', () => {
    const out = orderMarkedPages(
      [photo(0), photo(1)],
      [sheet('1', 0), sheet('2', 1), sheet('3', 1)],
    );
    expect(flat(out)).toEqual(['photo0', 'Q1', 'photo1', 'Q2', 'Q3']);
  });

  it('sorts photos by index and questions naturally within a photo', () => {
    const out = orderMarkedPages(
      [photo(1), photo(0)],
      [sheet('10', 0), sheet('2', 0)],
    );
    expect(flat(out)).toEqual(['photo0', 'Q2', 'Q10', 'photo1']);
  });

  it('keeps unattributed sheets rather than dropping them', () => {
    const out = orderMarkedPages([photo(0)], [sheet('1', 0), sheet('2', null), sheet('3', undefined)]);
    expect(flat(out)).toEqual(['photo0', 'Q1', 'Q2', 'Q3']);
  });

  it('still emits sheets whose photo failed to annotate', () => {
    const out = orderMarkedPages([photo(0)], [sheet('1', 0), sheet('9', 4)]);
    expect(flat(out)).toEqual(['photo0', 'Q1', 'Q9']);
  });

  it('handles the two degenerate modes: photos only, sheets only', () => {
    expect(flat(orderMarkedPages([photo(0), photo(1)], []))).toEqual(['photo0', 'photo1']);
    expect(flat(orderMarkedPages([], [sheet('2', 0), sheet('1', 0)]))).toEqual(['Q1', 'Q2']);
  });

  it('tags each page with what it is, so the caller embeds the right image type', () => {
    const out = orderMarkedPages([photo(0)], [sheet('1', 0)]);
    expect(out.map(p => p.kind)).toEqual(['photo', 'sheet']);
  });
});

describe('coverPhotoIndexes', () => {
  it('returns the classified cover pages in photo order, once each', () => {
    expect(coverPhotoIndexes([{ photo_index: 3, kind: 'student_work' }, { photo_index: 0, kind: 'cover' }, { photo_index: 0, kind: 'cover' }, { photo_index: 5, kind: 'cover' }])).toEqual([0, 5]);
  });
  it('is empty for missing, malformed or cover-less classifications', () => {
    expect(coverPhotoIndexes(undefined)).toEqual([]);
    expect(coverPhotoIndexes('cover')).toEqual([]);
    expect(coverPhotoIndexes([{ photo_index: '0', kind: 'cover' }, { kind: 'cover' }, { photo_index: 1, kind: 'question_paper' }])).toEqual([]);
  });
});

describe('coverPhotoIndexes — the fallback when there is no classification (Mac hand-backs)', () => {
  const p = (photo_index: number, attempts: number, unreadable = false) => ({ photo_index, attempts: Array(attempts).fill({}), unreadable });
  it('the leading no-work pages are the front matter, capped at three', () => {
    expect(coverPhotoIndexes([], [p(0, 0), p(1, 0), p(2, 0), p(3, 2), p(4, 1)])).toEqual([0, 1, 2]);
    expect(coverPhotoIndexes(null, [p(0, 0), p(1, 3)])).toEqual([0]);
    expect(coverPhotoIndexes(undefined, [p(0, 0), p(1, 0), p(2, 0), p(3, 0), p(4, 0), p(5, 2)])).toEqual([0, 1, 2]);
  });
  it('a classification with a cover still wins, and an unreadable first page is never a cover', () => {
    expect(coverPhotoIndexes([{ photo_index: 1, kind: 'cover' }], [p(0, 0), p(1, 0), p(2, 2)])).toEqual([1]);
    expect(coverPhotoIndexes([], [p(0, 0, true), p(1, 2)])).toEqual([]);
  });
  it('a paper with no work anywhere, or a first page with work, has no front matter', () => {
    expect(coverPhotoIndexes([], [p(0, 0), p(1, 0)])).toEqual([]);
    expect(coverPhotoIndexes([], [p(0, 3), p(1, 0)])).toEqual([]);
    expect(coverPhotoIndexes([], [])).toEqual([]);
  });
});

describe('frontMatterPages — a Mac hand-back has no per-page attempts, so results[].photo_index says where the work is', () => {
  it('marks the pages that carry a marked question as work, keeps unreadable flags', () => {
    const rj = {
      results: [{ photo_index: 3, question_number: '1' }, { photo_index: 4 }, { photo_index: 'x' }],
      annotated_photos: [{ photo_index: 0, attempts: [] }, { photo_index: 1, attempts: [] }, { photo_index: 2, unreadable: true, attempts: [] }, { photo_index: 3, attempts: [] }, { photo_index: 4, attempts: [] }],
    };
    const pages = frontMatterPages(rj);
    expect(pages.map(p => [p.photo_index, p.hasWork, p.unreadable])).toEqual([[0, false, false], [1, false, false], [2, false, true], [3, true, false], [4, true, false]]);
    // and through the fallback: pages 0–1 lead, page 2 is unreadable so the run stops there
    expect(coverPhotoIndexes([], pages)).toEqual([0, 1]);
  });
  it('Gavin\'s shape — every attempts[] empty, questions on pages 3+ — puts the cover and two front pages first', () => {
    const rj = {
      results: Array.from({ length: 12 }, (_, i) => ({ photo_index: 3 + Math.floor(i / 2) })),
      annotated_photos: Array.from({ length: 19 }, (_, i) => ({ photo_index: i, attempts: [] })),
    };
    expect(coverPhotoIndexes([], frontMatterPages(rj))).toEqual([0, 1, 2]);
    expect(frontMatterPages(null)).toEqual([]);
  });
});
