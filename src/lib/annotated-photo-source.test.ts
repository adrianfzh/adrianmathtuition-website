import { describe, it, expect } from 'vitest';
import { pickAnnotatedPhotoUrl, pageImages, type MarkedPdfMode } from './annotated-photo-source';

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

// 17 Sep 2026 — the footer cap moves a long column or a margin figure off the BARE
// page onto its own sheet (`overflow_url_plain`); the sheet follows the page.
describe('pageImages — the bare page\'s overflow sheet', () => {
  it('pairs overflow_url_plain with the bare page in any mode, and never with the with-solutions twin', () => {
    const photo = { photo_index: 13, url: 'u/bare.jpg', url_with_solutions: 'u/sol.jpg', overflow_url: 'u/sol-over.jpg', overflow_url_plain: 'u/bare-over.jpg' };
    const images = pageImages(photo, 'images' as MarkedPdfMode);
    expect(images.map(i => i.url)).toEqual(['u/bare.jpg', 'u/bare-over.jpg']);
    expect(images[1].overflow).toBe(true);
    const photos = pageImages(photo, 'photos' as MarkedPdfMode);
    expect(photos.map(i => i.url)).toEqual(['u/sol.jpg', 'u/sol-over.jpg']);
    expect(pageImages({ photo_index: 1, url: 'u/p.jpg' }, 'images' as MarkedPdfMode)).toHaveLength(1);
  });
});
