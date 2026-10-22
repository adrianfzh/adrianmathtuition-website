import { describe, it, expect } from 'vitest';
import { fixTarget, rankFixCandidates, gradableRow, readFixCache, type FixCandidate } from './fix-one';

const gate = { allowedQLevels: ['EM', 'S3_EM'], isIp: false, assigned: false };
const base = { level: 'EM', school: 'Some Sec', total_marks: 3, answer: 'x = 2', question_text: 'Solve 2x = 4.' };
const row = (id: string, extra: Partial<FixCandidate> = {}): FixCandidate => ({ id, from: 'skill', ...base, ...extra });
const pick = (rows: FixCandidate[], attempted: string[] = [], failedId: string | null = 'failed') =>
  rankFixCandidates(rows, { attempted: new Set(attempted), shown: new Set(), failedId, gate, seed: 'run1' }).map((r) => r.id);

describe('fixTarget', () => {
  const revise = { level: 'em', items: [{ for: '3', name: 'Factorise', topic: 'Algebra', subgroup_id: 41 }, { for: '5', name: 'X', topic: 'T', subgroup_id: 9 }] };
  it('takes the question that lost the most marks, with its sub-skill and bank row', () => {
    expect(fixTarget([{ questionNumber: '3' }, { questionNumber: '5' }], revise, { '3': 'b3' }))
      .toEqual({ questionNumber: '3', level: 'EM', topic: 'Algebra', subgroupId: 41, bankId: 'b3' });
  });
  it('no sub-skill when the run has no mapping for it', () => {
    expect(fixTarget([{ questionNumber: '7' }], revise, {})).toMatchObject({ subgroupId: null, level: null, bankId: null });
  });
  it('nothing dropped → nothing to fix', () => {
    expect(fixTarget([], revise, {})).toBeNull();
  });
});

describe('rankFixCandidates', () => {
  it('skips questions the student has already attempted', () => {
    expect(pick([row('a'), row('b')], ['a'])).toEqual(['b']);
  });
  it('skips old-syllabus rows', () => {
    expect(pick([row('a', { legacy_syllabus: true }), row('b')])).toEqual(['b']);
  });
  it('skips national, flagged, deleted, other-level and figure-flagged rows', () => {
    expect(pick([
      row('n', { national: true }), row('f', { flagged_count: 3 }), row('d', { deleted_at: '2026-01-01' }),
      row('l', { level: 'AM' }), row('g', { figureFlagged: true }), row('p', { outOfPool: true }), row('ok'),
    ])).toEqual(['ok']);
  });
  it('never shows the question they lost marks on', () => {
    expect(pick([row('failed'), row('b')])).toEqual(['b']);
  });
  it('falls back to a twin when the sub-skill has nothing left', () => {
    const twin = row('t', { from: 'twin', school: 'AdrianMath', ai_generated: true, verified: true, solution_source: 'opus_session', twin_of: 'failed' });
    expect(pick([row('a'), twin], ['a'])).toEqual(['t']);
  });
  it('puts sub-skill rows before twins, and short ones first', () => {
    const twin = row('t', { from: 'twin', twin_of: 'failed', total_marks: 1 });
    expect(pick([row('long', { total_marks: 8 }), twin, row('short', { total_marks: 2 })])).toEqual(['short', 'long', 't']);
  });
  it('drops an unverified twin and one the grader would refuse', () => {
    expect(pick([
      row('u', { from: 'twin', ai_generated: true, verified: false, twin_of: 'failed' }),
      row('v1', { ai_generated: true, verified: true, solution_source: 'ai_generated_v1' }),
    ])).toEqual([]);
  });
  it('drops rows with no answer to mark against', () => {
    expect(pick([row('a', { answer: null, solution: null })])).toEqual([]);
  });
});

describe('gradableRow', () => {
  it('school rows, ai_opus rows and verified twins are gradable', () => {
    expect(gradableRow({})).toBe(true);
    expect(gradableRow({ ai_generated: true, solution_source: 'ai_opus' })).toBe(true);
    expect(gradableRow({ ai_generated: true, verified: true, twin_of: 'x', solution_source: 'opus_session' })).toBe(true);
    expect(gradableRow({ ai_generated: true, verified: true, solution_source: 'ai_generated_v1' })).toBe(false);
  });
});

describe('readFixCache', () => {
  it('reads picks and drops junk', () => {
    expect(readFixCache({ picks: [{ id: 'a', q: '3', from: 'twin', at: 't' }, null, { q: '1' }] }).picks)
      .toEqual([{ id: 'a', q: '3', from: 'twin', at: 't' }]);
    expect(readFixCache(null).picks).toEqual([]);
  });
});

import { sanitizeFixDetail } from './fix-one-events';
describe('sanitizeFixDetail', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  it('keeps the three fields and nothing else', () => {
    expect(sanitizeFixDetail('fix:answered', { runId: id, questionId: id, correct: true, x: 1 })).toEqual({ runId: id, questionId: id, correct: true });
    expect(sanitizeFixDetail('fix:shown', { runId: id, questionId: id, correct: true })).toEqual({ runId: id, questionId: id });
  });
  it('refuses bad ids and an answer without a verdict', () => {
    expect(sanitizeFixDetail('fix:shown', { runId: 'x', questionId: id })).toBeNull();
    expect(sanitizeFixDetail('fix:answered', { runId: id, questionId: id })).toBeNull();
  });
});
