import { describe, it, expect } from 'vitest';
import { releaseOnTagVerdict, hasMarkedCopy } from './release-on-tag';

const marked = { results: [{ question: '1' }] };
const row = (over = {}) => ({
  student_id: 'recKiara', released_at: null, archived_at: null,
  annotated_pdf_url: null, photos_pdf_url: 'https://x/marked-photos.pdf',
  queue_status: 'done', result_json: marked, ...over,
});

describe('releaseOnTagVerdict — a finished paper tagged later releases at once', () => {
  it('releases a marked, unreleased paper with only the images PDF (Kiara, 25 Oct 2026)', () => {
    expect(releaseOnTagVerdict(row()).go).toBe(true);
    expect(releaseOnTagVerdict(row({ photos_pdf_url: null, annotated_pdf_url: 'https://x/a.pdf' })).go).toBe(true);
  });
  it('never touches a released or archived paper', () => {
    expect(releaseOnTagVerdict(row({ released_at: '2026-10-27T00:00:00Z' }))).toEqual({ go: false, why: 'already released' });
    expect(releaseOnTagVerdict(row({ archived_at: '2026-10-27T00:00:00Z' }))).toEqual({ go: false, why: 'archived' });
  });
  it('waits for a paper still being marked — the marker releases it itself', () => {
    expect(releaseOnTagVerdict(row({ queue_status: 'queued' })).go).toBe(false);
    expect(releaseOnTagVerdict(row({ queue_status: 'claimed' })).go).toBe(false);
    expect(releaseOnTagVerdict(row({ result_json: {} })).why).toBe('not marked yet');
    expect(releaseOnTagVerdict(row({ photos_pdf_url: null })).why).toBe('no marked PDF yet');
  });
  it('a hold stays a hold; an untag releases nothing', () => {
    expect(releaseOnTagVerdict(row({ result_json: { ...marked, auto_release: { outcome: 'held' } } })).go).toBe(false);
    expect(releaseOnTagVerdict(row({ result_json: { ...marked, auto_release: { outcome: 'refused' } } })).go).toBe(true);
    expect(releaseOnTagVerdict(row({ student_id: null })).go).toBe(false);
    expect(releaseOnTagVerdict(null).go).toBe(false);
  });
  it('hasMarkedCopy', () => {
    expect(hasMarkedCopy({ annotated_pdf_url: null, photos_pdf_url: null })).toBe(false);
  });
});
