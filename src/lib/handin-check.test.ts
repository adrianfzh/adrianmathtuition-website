import { describe, it, expect } from 'vitest';
import { cleanMissing, handinCheckStamp, handinCheckLine, missingAfterMarking } from './handin-check';

const AT = '2026-09-29T16:00:00.000Z';
const joey = [{ q: 1, part: 'a' }, { q: 1, part: 'd' }, { q: 2 }];

describe('handinCheckStamp', () => {
  it('a clean first send records the check that ran', () => {
    expect(handinCheckStamp({ at: AT, preflight: { list: 'bank', key: 'GCE 2024 EM P2', missing: [] } }))
      .toEqual({ checked_at: AT, list: 'bank', key: 'GCE 2024 EM P2', asked: [], missing: [], answer: null });
  });
  it('"I didn\'t do these" records the list the student was shown', () => {
    const s = handinCheckStamp({ at: AT, preflight: null, check: { asked: joey, list: 'bank', key: 'GCE 2024 EM P2' }, answer: 'not-done' });
    expect(s).toMatchObject({ list: 'bank', missing: joey, answer: 'not-done' });
  });
  it('Send anyway is recorded as sent-anyway', () => {
    expect(handinCheckStamp({ at: AT, preflight: null, check: { asked: joey }, answer: 'whatever' })).toMatchObject({ answer: 'sent-anyway', list: 'none' });
  });
  it('asked, then came back with pages: the new check decides what is still missing', () => {
    const s = handinCheckStamp({ at: AT, preflight: { list: 'bank', missing: [{ q: 2 }] }, check: { asked: joey } });
    expect(s).toMatchObject({ answer: 'added', missing: [{ q: 2 }], asked: joey });
  });
  it('nothing ran and nothing was shown → no stamp', () => {
    expect(handinCheckStamp({ at: AT, preflight: null, check: null })).toBeNull();
  });
});

describe('cleanMissing / handinCheckLine', () => {
  it('drops malformed entries and roman numerals', () => {
    expect(cleanMissing([{ q: 1, part: 'a' }, { q: 'x' }, { q: 3, part: 'ii' }, null])).toEqual([{ q: 1, part: 'a' }, { q: 3 }]);
  });
  it('the desk line says which case it is', () => {
    expect(handinCheckLine({ missing: joey, answer: 'sent-anyway' })).toBe('⚠️ Missing at hand-in, sent anyway: Q1(a), Q1(d), Q2');
    expect(handinCheckLine({ missing: joey, answer: 'not-done' })).toBe('✋ Student said not done: Q1(a), Q1(d), Q2');
    expect(handinCheckLine({ missing: [], answer: 'added' })).toBeNull();
  });
});

describe('missingAfterMarking — the backstop', () => {
  const base = { portal_submission: true };
  it('names questions the marker never found', () => {
    expect(missingAfterMarking({ ...base, unattempted_questions: ['4', '7'] })).toEqual([{ q: 4 }, { q: 7 }]);
  });
  it('adds parts the student was warned about and sent anyway', () => {
    expect(missingAfterMarking({ ...base, unattempted_questions: ['2'], handin_check: { answer: 'sent-anyway', missing: [{ q: 1, part: 'a' }, { q: 2 }] } }))
      .toEqual([{ q: 1, part: 'a' }, { q: 2 }]);
  });
  it('leaves out what the student said they did not do', () => {
    expect(missingAfterMarking({ ...base, unattempted_questions: ['4', '7'], handin_check: { answer: 'not-done', missing: [{ q: 7 }] } })).toEqual([{ q: 4 }]);
  });
  it('reads "Q4(c)" labels too', () => {
    expect(missingAfterMarking({ ...base, unattempted_questions: ['Q4(c)', 'Q4(d)'] })).toEqual([{ q: 4, part: 'c' }, { q: 4, part: 'd' }]);
  });
  it('says nothing on a science paper (Section B is a choice)', () => {
    expect(missingAfterMarking({ ...base, subject: 'chemistry', unattempted_questions: ['7', '8'] })).toEqual([]);
    expect(missingAfterMarking({ ...base, subject: 'math', unattempted_questions: ['7'] })).toEqual([{ q: 7 }]);
  });
  it('says nothing for Adrian’s uploads, sheets, or a complete paper', () => {
    expect(missingAfterMarking({ unattempted_questions: ['4'] })).toEqual([]);
    expect(missingAfterMarking({ ...base, assignment_id: 'a1', unattempted_questions: ['4'] })).toEqual([]);
    expect(missingAfterMarking({ ...base, source: { paper_kind: 'practice-again' }, unattempted_questions: ['4'] })).toEqual([]);
    expect(missingAfterMarking({ ...base })).toEqual([]);
  });
});
