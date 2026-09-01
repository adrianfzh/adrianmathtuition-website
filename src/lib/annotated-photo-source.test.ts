import { describe, it, expect } from 'vitest';
import { pickAnnotatedPhotoUrl } from './annotated-photo-source';

const PLAIN = 'https://blob/p-1.jpg';
const SOL = 'https://blob/p-sol-1.jpg';

describe('pickAnnotatedPhotoUrl', () => {
  it('gives the images-only PDF the copy that carries the worked solution', () => {
    expect(pickAnnotatedPhotoUrl({ url: PLAIN, url_with_solutions: SOL }, 'photos')).toBe(SOL);
  });

  it('never gives the full PDF the solution copy — its transcript already says the answer', () => {
    expect(pickAnnotatedPhotoUrl({ url: PLAIN, url_with_solutions: SOL }, 'full')).toBe(PLAIN);
  });

  it('falls back to the plain page when there is no twin (nothing wrong on the page)', () => {
    expect(pickAnnotatedPhotoUrl({ url: PLAIN, url_with_solutions: null }, 'photos')).toBe(PLAIN);
    expect(pickAnnotatedPhotoUrl({ url: PLAIN }, 'photos')).toBe(PLAIN);
  });

  // Runs marked before the split shipped have no `url_with_solutions` at all; replaying one
  // must still produce a PDF rather than a page of broken image fetches.
  it('replays a pre-split run without reaching for a field it does not have', () => {
    const legacy = JSON.parse('{"photo_index":0,"url":"https://blob/p-1.jpg","method":"line"}');
    expect(pickAnnotatedPhotoUrl(legacy, 'photos')).toBe(PLAIN);
    expect(pickAnnotatedPhotoUrl(legacy, 'full')).toBe(PLAIN);
  });

  // An empty string is what a failed upload leaves behind if anyone ever coalesces to ''.
  it('treats an empty twin URL as absent', () => {
    expect(pickAnnotatedPhotoUrl({ url: PLAIN, url_with_solutions: '' }, 'photos')).toBe(PLAIN);
  });
});

describe('photos-booklet mode', () => {
  // The booklet at the back is the solution's one surface, so the marked pages
  // themselves must be the clean copies — a -sol twin here would print the same
  // worked solution twice.
  it('gives the booklet-backed photos PDF the clean copy even when a twin exists', () => {
    expect(pickAnnotatedPhotoUrl({ url: PLAIN, url_with_solutions: SOL }, 'photos-booklet')).toBe(PLAIN);
  });
});
