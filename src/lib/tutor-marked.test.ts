import { describe, it, expect } from 'vitest';
import { checkScore, parseTotalRead, tutorMarkedRunRow, isTutorMarked } from './tutor-marked';

describe('checkScore', () => {
  it('takes a sensible whole-mark score', () => {
    expect(checkScore('52', '80')).toEqual({ awarded: 52, max: 80 });
    expect(checkScore(0, 45)).toEqual({ awarded: 0, max: 45 });
  });
  it('refuses nonsense', () => {
    expect(checkScore(81, 80)).toBeNull();
    expect(checkScore(-1, 80)).toBeNull();
    expect(checkScore(40, 0)).toBeNull();
    expect(checkScore(40.5, 80)).toBeNull();
    expect(checkScore('abc', 80)).toBeNull();
    expect(checkScore(10, 500)).toBeNull();
  });
});

describe('parseTotalRead', () => {
  it('reads the JSON, fenced or not', () => {
    expect(parseTotalRead('```json\n{"awarded": 52, "max": 80, "sure": true}\n```')).toEqual({ awarded: 52, max: 80, sure: true });
  });
  it('anything short of sure:true is not sure', () => {
    expect(parseTotalRead('{"awarded": 52, "max": 80}')).toEqual({ awarded: 52, max: 80, sure: false });
  });
  it('a contradictory or missing total is no read at all', () => {
    expect(parseTotalRead('{"awarded": 90, "max": 80, "sure": true}')).toBeNull();
    expect(parseTotalRead('{"awarded": null, "max": null, "sure": false}')).toBeNull();
    expect(parseTotalRead('no idea')).toBeNull();
  });
});

describe('tutorMarkedRunRow', () => {
  const row = tutorMarkedRunRow({
    studentId: 'recX', studentName: 'Demo', paperName: 'AM Prelim P1', paperSubject: 'A Math',
    pageUrls: ['https://www.adrianmathtuition.com/api/files/handins/recX/a.jpg', 'https://www.adrianmathtuition.com/api/files/handins/recX/b.jpg'],
    awarded: 52, max: 80, scoreFrom: 'read', at: '2026-10-05T10:00:00.000Z',
  });
  it('is released, scored, page images in order, never queued, never a hand-in', () => {
    expect(row.released_at).toBe('2026-10-05T10:00:00.000Z');
    expect(row.total_awarded).toBe(52);
    expect(row.total_max).toBe(80);
    expect(row.result_json.results).toEqual([]);
    expect(row.result_json.annotated_photos.map(p => p.photo_index)).toEqual([0, 1]);
    expect('portal_submission' in row.result_json).toBe(false);
    expect('queue_status' in row).toBe(false);
    expect(isTutorMarked(row.result_json)).toBe(true);
  });
  it('isTutorMarked is false for an ordinary marking', () => {
    expect(isTutorMarked({ results: [] })).toBe(false);
    expect(isTutorMarked(null)).toBe(false);
  });
});
