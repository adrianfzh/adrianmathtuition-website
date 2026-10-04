import { describe, it, expect } from 'vitest';
import { serveRefusal, isNationalRow, practiceQLevels } from './serve-gate';

const student = { allowedQLevels: ['AM', 'S3_AM', 'EM', 'S3_EM'], isIp: false, assigned: false };
const admin = { allowedQLevels: null, isIp: false, assigned: false };
const ok = { level: 'AM', school: 'RI', national: false, deleted_at: null, ai_generated: false, verified: false, flagged_count: 0, legacy_syllabus: false };

describe('serveRefusal', () => {
  it('serves an ordinary school row at the student\'s level', () => {
    expect(serveRefusal(ok, student)).toBeNull();
  });
  it('never serves a national / GCE row — not to a student, not even on their own list', () => {
    expect(serveRefusal({ ...ok, national: true }, student)).toBe('national');
    expect(serveRefusal({ ...ok, school: 'GCE' }, { ...student, assigned: true })).toBe('national');
    expect(isNationalRow({ school: 'gce ' })).toBe(true);
  });
  it('national rows are refused even for the admin view of this door; other rules are not', () => {
    expect(serveRefusal({ ...ok, national: true }, admin)).toBe('national');
    expect(serveRefusal({ ...ok, level: 'JC2', ai_generated: true }, admin)).toBeNull();
  });
  it('refuses deleted, unverified AI, thrice-flagged and other-level rows', () => {
    expect(serveRefusal({ ...ok, deleted_at: '2026-01-01' }, student)).toBe('removed');
    expect(serveRefusal({ ...ok, ai_generated: true, verified: false }, student)).toBe('unverified');
    expect(serveRefusal({ ...ok, ai_generated: true, verified: true }, student)).toBeNull();
    expect(serveRefusal({ ...ok, flagged_count: 3 }, student)).toBe('flagged');
    expect(serveRefusal({ ...ok, level: 'JC2' }, student)).toBe('level');
  });
  it('old-syllabus rows only for IP students; a question on their own list skips level + syllabus', () => {
    expect(serveRefusal({ ...ok, legacy_syllabus: true }, student)).toBe('legacy');
    expect(serveRefusal({ ...ok, legacy_syllabus: true }, { ...student, isIp: true })).toBeNull();
    expect(serveRefusal({ ...ok, level: 'JC2' }, { ...student, assigned: true })).toBeNull();
  });
});

describe('practiceQLevels', () => {
  it('matches public.practice_qlevels', () => {
    expect(practiceQLevels('JC')).toEqual(['JC1', 'JC2']);
    expect(practiceQLevels('AM')).toEqual(['AM', 'S3_AM']);
    expect(practiceQLevels('S1')).toEqual(['S1']);
  });
});
