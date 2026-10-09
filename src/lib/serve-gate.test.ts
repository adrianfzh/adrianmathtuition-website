import { describe, it, expect } from 'vitest';
import { serveRefusal, isNationalRow, practiceQLevels, tagDrawRefusal } from './serve-gate';

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

// Regression, 9 Oct 2026 — Print a paper drew its mock by topic tag with no
// old-syllabus check, the day ~1,000 JC questions were marked old syllabus.
describe('tagDrawRefusal — the Print-a-paper mock draw never prints an old-syllabus question', () => {
  const jc = { qLevels: ['JC1', 'JC2'], treeLevels: ['JC'], isIp: false };
  const am = { qLevels: ['AM', 'S3_AM'], treeLevels: ['AM'], isIp: false };
  const jcRow = { ...ok, level: 'JC2' };
  const OPEN_JC = { level: 'JC', visibility: 'all', ip_extra_level: null };
  const HIDDEN_JC = { level: 'JC', visibility: 'hidden', ip_extra_level: null };
  const OPEN_AM = { level: 'AM', visibility: 'all', ip_extra_level: null };
  const MODULUS = { level: 'AM', visibility: 'ip', ip_extra_level: null };

  it('an ordinary row is drawn, filed or not', () => {
    expect(tagDrawRefusal(jcRow, [], jc)).toBeNull();
    expect(tagDrawRefusal(jcRow, [OPEN_JC], jc)).toBeNull();
  });
  it('an old-syllabus JC row is refused — unfiled, filed under an open sub-skill, or for an IP account', () => {
    expect(tagDrawRefusal({ ...jcRow, legacy_syllabus: true }, [], jc)).toBe('legacy');
    expect(tagDrawRefusal({ ...jcRow, legacy_syllabus: true }, [OPEN_JC], jc)).toBe('legacy');
    expect(tagDrawRefusal({ ...jcRow, legacy_syllabus: true }, [OPEN_JC], { ...jc, isIp: true })).toBe('legacy');
    expect(tagDrawRefusal({ ...jcRow, legacy_syllabus: true }, [], { ...jc, isIp: true })).toBe('legacy');
  });
  it('the one way through: an old-syllabus A Math row filed under an IP-only sub-skill, for an IP student', () => {
    const modulusRow = { ...ok, legacy_syllabus: true };
    expect(tagDrawRefusal(modulusRow, [MODULUS], { ...am, isIp: true })).toBeNull();
    expect(tagDrawRefusal(modulusRow, [MODULUS], am)).toBe('legacy');
    expect(tagDrawRefusal(modulusRow, [OPEN_AM], { ...am, isIp: true })).toBe('legacy');
  });
  it('a row filed only under a hidden sub-skill is not drawn; one open filing is enough', () => {
    expect(tagDrawRefusal(jcRow, [HIDDEN_JC], jc)).toBe('audience');
    expect(tagDrawRefusal(jcRow, [HIDDEN_JC, OPEN_JC], jc)).toBeNull();
  });
  it('the by-id rules still apply to a draw: unverified, thrice-flagged, national, another level', () => {
    expect(tagDrawRefusal({ ...jcRow, ai_generated: true, verified: false }, [], jc)).toBe('unverified');
    expect(tagDrawRefusal({ ...jcRow, flagged_count: 3 }, [], jc)).toBe('flagged');
    expect(tagDrawRefusal({ ...jcRow, national: true }, [], jc)).toBe('national');
    expect(tagDrawRefusal(ok, [], jc)).toBe('level');
  });
});
