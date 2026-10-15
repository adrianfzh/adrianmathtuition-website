import { describe, expect, it } from 'vitest';
import { cleanPart, compareExams, examLabel, lossByTopic, parseExamRead, parseReport, totalMismatch, totals, type ExamPart } from './school-exam';

const P = (q: string, got: number, max: number, topic: string): ExamPart =>
  ({ q, part: '', got, max, topic, why: got < max ? 'x' : '', error_kind: null, unsure: false });

describe('parseExamRead', () => {
  it('reads parts and the written total through a code fence', () => {
    const raw = '```json\n{"parts":[{"q":"1","part":"a","got":2,"max":3,"topic":"vectors","why":"wrong ratio","error_kind":"concept"},{"q":"2","got":4,"max":4,"topic":"Indices"}],"written_total":{"got":6,"max":7}}\n```';
    const r = parseExamRead(raw, ['Vectors', 'Indices'])!;
    expect(r.parts).toHaveLength(2);
    expect(r.parts[0]).toMatchObject({ q: '1', part: 'a', got: 2, max: 3, topic: 'Vectors', why: 'wrong ratio', error_kind: 'concept' });
    expect(r.parts[1]).toMatchObject({ topic: 'Indices', why: '', error_kind: null });
    expect(r.written_total).toEqual({ got: 6, max: 7 });
  });
  it('is null for no JSON or no usable parts', () => {
    expect(parseExamRead('sorry')).toBeNull();
    expect(parseExamRead('{"parts":[{"q":"","max":3}]}')).toBeNull();
  });
});

describe('cleanPart', () => {
  it('clamps got into 0..max and keeps halves', () => {
    expect(cleanPart({ q: '3', got: 9, max: 4 })!.got).toBe(4);
    expect(cleanPart({ q: '3', got: -1, max: 4 })!.got).toBe(0);
    expect(cleanPart({ q: '3', got: 2.5, max: 4 })!.got).toBe(2.5);
  });
  it('drops why and error kind on a full-mark part, and an unknown kind', () => {
    expect(cleanPart({ q: '1', got: 2, max: 2, why: 'x', error_kind: 'concept' })).toMatchObject({ why: '', error_kind: null });
    expect(cleanPart({ q: '1', got: 0, max: 2, error_kind: 'vibes' })!.error_kind).toBeNull();
  });
  it('refuses a part with no question number or no max', () => {
    expect(cleanPart({ got: 1, max: 2 })).toBeNull();
    expect(cleanPart({ q: '1', got: 1 })).toBeNull();
  });
});

describe('totals and mismatch', () => {
  it('flags marks that do not add up to the written total', () => {
    const read = { parts: [P('1', 2, 3, 'A'), P('2', 4, 4, 'B')], written_total: { got: 7, max: 7 } };
    expect(totals(read.parts)).toEqual({ got: 6, max: 7 });
    expect(totalMismatch(read)).toContain('add up to 6');
    expect(totalMismatch({ ...read, written_total: { got: 6, max: 7 } })).toBeNull();
  });
});

describe('lossByTopic', () => {
  it('sums per topic, biggest loss first', () => {
    const t = lossByTopic([P('1', 1, 5, 'Vectors'), P('2', 3, 4, 'Algebra'), P('3', 0, 4, 'Vectors')]);
    expect(t[0]).toEqual({ topic: 'Vectors', lost: 8, max: 9 });
    expect(t[1]).toEqual({ topic: 'Algebra', lost: 1, max: 4 });
  });
});

describe('compareExams', () => {
  it('sorts topics into better, still weak and new', () => {
    const prev = [P('1', 0, 8, 'Algebra'), P('2', 1, 8, 'Vectors'), P('3', 5, 5, 'Graphs')];
    const cur = [P('1', 7, 8, 'Algebra'), P('2', 0, 9, 'Vectors'), P('3', 0, 6, 'Probability')];
    const c = compareExams(prev, cur);
    expect(c.better).toEqual([{ topic: 'Algebra', before: 8, now: 1 }]);
    expect(c.stillWeak).toEqual([{ topic: 'Vectors', before: 7, now: 9 }]);
    expect(c.newWeak).toEqual([{ topic: 'Probability', now: 6 }]);
  });
  it('gives the change in percentage points', () => {
    expect(compareExams([P('1', 40, 80, 'A')], [P('1', 52, 80, 'A')]).change).toBe(15);
    expect(compareExams([], [P('1', 52, 80, 'A')]).change).toBeNull();
  });
  it('a topic weak now that was fine last time is new', () => {
    const c = compareExams([P('1', 5, 6, 'Vectors')], [P('1', 1, 6, 'Vectors')]);
    expect(c.newWeak).toEqual([{ topic: 'Vectors', now: 5 }]);
  });
});

describe('parseReport', () => {
  it('keeps three steps at most and needs a note', () => {
    const r = parseReport(JSON.stringify({ next_steps: [1, 2, 3, 4].map(i => ({ topic: `T${i}`, action: 'do' })), parent_note: 'Hi' }))!;
    expect(r.next_steps).toHaveLength(3);
    expect(parseReport('{"next_steps":[]}')).toBeNull();
  });
});

describe('examLabel', () => {
  it('joins type, subject and year', () => {
    expect(examLabel('WA3', '2026-10-09', 'E Math')).toBe('WA3 · E Math · 2026');
    expect(examLabel('EOY', '')).toBe('EOY');
  });
});
