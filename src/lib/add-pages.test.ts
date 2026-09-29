import { describe, it, expect } from 'vitest';
import { canAddPages, canAddPagesAfterMarking, pagesBeingAdded, ownsHandinUrl } from './add-pages';

const NOW = Date.parse('2026-09-29T15:00:00Z');
const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ photo_index: i, original_url: `u${i}` }));
const waiting = { total_max: null, released_at: null, queue_status: 'queued', result_json: { source: { photos: photos(8) }, queue: { queued_at: '2026-09-29T14:55:00Z' } } };

describe('canAddPages — show ➕ Add pages only while nobody has started', () => {
  it('a paper waiting in the queue takes pages', () => {
    expect(canAddPages(waiting, NOW)).toBe(true);
  });
  it('a science paper on the waiting list takes pages', () => {
    expect(canAddPages({ total_max: null, result_json: { source: { photos: photos(4) }, queued_for: '2026-09-30' } }, NOW)).toBe(true);
  });
  it('not once a lane has started, it is marked, or it is released', () => {
    expect(canAddPages({ ...waiting, queue_status: 'claimed', lease_until: '2026-09-29T15:10:00Z' }, NOW)).toBe(false);
    expect(canAddPages({ ...waiting, result_json: { ...waiting.result_json, queue: { queued_at: 'x', external_claim: { by: 'mac', at: 'y' } } } }, NOW)).toBe(false);
    expect(canAddPages({ ...waiting, total_max: 90 }, NOW)).toBe(false);
    expect(canAddPages({ ...waiting, released_at: '2026-09-29T15:00:00Z' }, NOW)).toBe(false);
  });
  it('a released Mac claim or an expired lease does not count as started', () => {
    expect(canAddPages({ ...waiting, result_json: { ...waiting.result_json, queue: { queued_at: 'x', external_claim: { by: 'mac', at: 'y', released_at: 'z' } } } }, NOW)).toBe(true);
    expect(canAddPages({ ...waiting, queue_status: 'claimed', lease_until: '2026-09-29T14:00:00Z' }, NOW)).toBe(true);
  });
  it('a full paper (30 pages) has no room', () => {
    expect(canAddPages({ ...waiting, result_json: { ...waiting.result_json, source: { photos: photos(30) } } }, NOW)).toBe(false);
  });
});

describe('ownsHandinUrl', () => {
  it('accepts only the student’s own hand-in prefix', () => {
    expect(ownsHandinUrl('https://www.adrianmathtuition.com/api/files/handins/recA/1.jpg', 'recA')).toBe(true);
    expect(ownsHandinUrl('https://www.adrianmathtuition.com/api/files/handins/recB/1.jpg', 'recA')).toBe(false);
    expect(ownsHandinUrl('https://evil.example.com/handins/recA/1.jpg', 'recA')).toBe(false);
  });
});

describe('canAddPagesAfterMarking — phase 3', () => {
  const marked = { total_max: 90, released_at: '2026-09-28T10:00:00Z', result_json: { source: { photos: photos(8) }, annotated_photos: photos(8) } };
  it('a released paper takes pages for 14 days', () => {
    expect(canAddPagesAfterMarking(marked, NOW)).toBe(true);
    expect(canAddPagesAfterMarking({ ...marked, released_at: '2026-09-01T10:00:00Z' }, NOW)).toBe(false);
  });
  it('not while it is being updated, once re-marked, or if its photos were split', () => {
    expect(canAddPagesAfterMarking({ ...marked, result_json: { ...marked.result_json, queue: { pages_added: 1 } } }, NOW)).toBe(false);
    expect(canAddPagesAfterMarking({ ...marked, superseded_by: 'r2' }, NOW)).toBe(false);
    expect(canAddPagesAfterMarking({ ...marked, result_json: { ...marked.result_json, annotated_photos: photos(9) } }, NOW)).toBe(false);
  });
  it('pagesBeingAdded reads the queue flag', () => {
    expect(pagesBeingAdded({ queue: { pages_added: 2 } })).toBe(true);
    expect(pagesBeingAdded({ queue: {} })).toBe(false);
  });
});
