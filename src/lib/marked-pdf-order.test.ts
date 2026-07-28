import { describe, it, expect } from 'vitest';
import { orderMarkedPages } from './marked-pdf-order';

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
