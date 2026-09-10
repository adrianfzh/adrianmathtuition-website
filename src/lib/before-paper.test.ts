import { describe, expect, it } from 'vitest';
import { beforePaperGroups, beforePaperLine, examsInWindow, topicMatches } from './before-paper';
import type { StreamItem } from './notebook-stream';
import type { UpcomingExam } from './portal-exams';

const exam = (over: Partial<UpcomingExam>): UpcomingExam => ({
  id: 'recX', examType: 'WA3', label: 'WA3', subject: 'A Math', paper: 'P1', date: '2026-09-15', daysLeft: 4, approx: false,
  testedTopics: ['Trigonometry', 'Logarithms'], practiceLevel: 'AM', ...over,
});
const item = (id: string, kind: StreamItem['kind'], topic: string | null, extra: Partial<StreamItem> = {}): StreamItem => ({
  id, kind, title: id, subtitle: '', at: '2026-09-01T00:00:00Z', haystack: id, topic, ...extra,
});

describe('examsInWindow', () => {
  it('keeps exams within five days, nearest first, and drops the rest', () => {
    const rows = examsInWindow([exam({ id: 'a', daysLeft: 9 }), exam({ id: 'b', daysLeft: 5 }), exam({ id: 'c', daysLeft: 0 }), exam({ id: 'd', daysLeft: -1 })]);
    expect(rows.map(e => e.id)).toEqual(['c', 'b']);
  });
});

describe('topicMatches', () => {
  it('matches the same topic, a bracketed sub-topic, and a contained name', () => {
    expect(topicMatches('Trigonometry', 'Trigonometry (R-Formula)')).toBe(true);
    expect(topicMatches('Indices', 'Indices (Standard Form)')).toBe(true);
    expect(topicMatches('Proportion', 'Direct proportion')).toBe(true);
    expect(topicMatches('Trigonometry (Equations)', 'Trigonometry (Equations)')).toBe(true);
    expect(topicMatches('Logarithms', 'Vectors')).toBe(false);
    expect(topicMatches('Logarithms', null)).toBe(false);
  });
  it("treats the bracketed qualifier as the specific part — the marker's free-text topics file under it, sibling qualifiers never do", () => {
    expect(topicMatches('Algebra (Identities)', 'Algebraic identities and special products')).toBe(true);
    expect(topicMatches('Algebra (Factorization)', 'Factorisation / number properties')).toBe(true);
    expect(topicMatches('Algebra (Factorization)', 'Algebraic identities and special products')).toBe(false);
    expect(topicMatches('Algebra (Identities)', 'Algebra (Factorization)')).toBe(false);
    expect(topicMatches('Algebra (Quadratic Equations)', 'Algebra')).toBe(false);
    expect(topicMatches('Algebra', 'Algebra (Quadratic Equations)')).toBe(true);
  });
});

describe('beforePaperGroups', () => {
  const live = { id: 'm', state: 'dark' as const, live: true, seen: 2, cameBack: false, where: '', practice: [] };
  const fixed = { ...live, state: 'fixed' as const, live: false };
  const items = [
    item('mistake:1', 'mistake', 'Trigonometry (R-Formula)', { mistake: live }),
    item('mistake:2', 'mistake', 'Logarithms', { mistake: fixed }),
    item('mistake:3', 'mistake', 'Vectors', { mistake: live }),
    item('saved:1', 'saved', 'Logarithms'),
    item('note:1', 'photo', 'Trigonometry'),
    item('note:2', 'clip', 'Vectors'),
    item('skill:1', 'skill', 'Trigonometry'),
    item('adrian:1', 'adrian', 'Trigonometry'),
  ];
  const g = beforePaperGroups(exam({}), items);
  it('keeps only the tested topics, live mistakes only, grouped by kind', () => {
    expect(g.mistakes.map(i => i.id)).toEqual(['mistake:1']);
    expect(g.saves.map(i => i.id)).toEqual(['saved:1']);
    expect(g.photos.map(i => i.id)).toEqual(['note:1']);
    expect(g.skills.map(i => i.id)).toEqual(['skill:1']);
  });
  it('names the tested topics nothing in the book touches', () => {
    expect(g.untouched).toEqual([]);
    expect(beforePaperGroups(exam({ testedTopics: ['Vectors', 'Kinematics'] }), items).untouched).toEqual(['Kinematics']);
  });
});

describe('beforePaperLine', () => {
  it('reads like a card', () => {
    expect(beforePaperLine(exam({}))).toBe('WA3 · A Math P1 · in 4 days');
    expect(beforePaperLine(exam({ daysLeft: 1, paper: null }))).toBe('WA3 · A Math · tomorrow');
    expect(beforePaperLine(exam({ daysLeft: 0, approx: true }))).toBe('WA3 · A Math P1 · ~today');
  });
});
