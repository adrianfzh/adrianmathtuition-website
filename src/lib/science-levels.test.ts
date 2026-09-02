import { describe, it, expect } from 'vitest';
import {
  computeScienceMastery, gradeMcq, isMcqAnswer, isScienceLevel, mcqOptionsIn, mcqStemParagraphs, normaliseMcqChoice,
  scienceImageUrl, scienceLevelForSubject, scienceLevelsFor, scienceSubjectOf,
} from './science-levels';

describe('science levels + access', () => {
  it('knows the three pure sciences and nothing else', () => {
    expect(isScienceLevel('PHY')).toBe(true);
    expect(isScienceLevel('CHEM')).toBe(true);
    expect(isScienceLevel('BIO')).toBe(true);
    expect(isScienceLevel('AM')).toBe(false);
    expect(scienceSubjectOf('PHY')).toBe('physics');
    expect(scienceSubjectOf('CHEM')).toBe('chemistry');
    expect(scienceSubjectOf('BIO')).toBe('biology');
    expect(scienceSubjectOf('EM')).toBeNull();
    expect(scienceLevelForSubject('biology')?.key).toBe('BIO');
    expect(scienceLevelForSubject(null)).toBeNull();
  });
  it('closed → nothing; preview → every science level; open → by Airtable subject', () => {
    expect(scienceLevelsFor(['Physics'], 'closed')).toEqual([]);
    expect(scienceLevelsFor(null, 'preview').map(l => l.key)).toEqual(['PHY', 'CHEM', 'BIO']);
    expect(scienceLevelsFor(['A Math', 'physics '], 'open')).toEqual([{ key: 'PHY', label: 'Physics' }]);
    expect(scienceLevelsFor(['Biology', 'Chemistry'], 'open').map(l => l.key)).toEqual(['CHEM', 'BIO']);
    expect(scienceLevelsFor(['A Math'], 'open')).toEqual([]);
    expect(scienceLevelsFor(null, 'open')).toEqual([]);
  });
});

describe('MCQ', () => {
  it('recognises a bare-letter answer only', () => {
    expect(isMcqAnswer('B')).toBe(true);
    expect(isMcqAnswer(' c ')).toBe(true);
    expect(isMcqAnswer('E')).toBe(false);
    expect(isMcqAnswer('330 m/s')).toBe(false);
    expect(isMcqAnswer(null)).toBe(false);
  });
  it('finds the option letters in the stem', () => {
    const stem = 'What is the speed?\n\nA) 0.33 m/s\nB) 330 m/s\nC) 670 m/s\nD) 12 000 m/s';
    expect(mcqOptionsIn(stem)).toEqual(['A', 'B', 'C', 'D']);
    expect(mcqOptionsIn('(A) yes\n(B) no')).toEqual(['A', 'B']);
    expect(mcqOptionsIn('A. first\nB. second\nC. third')).toEqual(['A', 'B', 'C']);
    expect(mcqOptionsIn('What will this prevent?\n\nA  cross-pollination\nB  insect-pollination\nC  self-pollination\nD  wind-pollination')).toEqual(['A', 'B', 'C', 'D']);
    expect(mcqOptionsIn('Calculate the resistance.')).toBeNull();
    expect(mcqOptionsIn('A single line mentioning A) once')).toBeNull();
  });
  it('puts each option on its own paragraph for markdown', () => {
    expect(mcqStemParagraphs('What is F?\nA) 1 N\nB) 2 N\nC) 3 N')).toBe('What is F?\n\nA) 1 N\n\nB) 2 N\n\nC) 3 N');
    expect(mcqStemParagraphs('Already\n\nA) x\n\nB) y')).toBe('Already\n\nA) x\n\nB) y');
    // the bank also stores options inline, double-spaced
    expect(mcqStemParagraphs('Which force?\n\nA) constant  B) decreasing  C) increasing  D) zero'))
      .toBe('Which force?\n\nA) constant\n\nB) decreasing\n\nC) increasing\n\nD) zero');
    expect(mcqStemParagraphs('Which force? A) constant B) decreasing')).toBe('Which force?\n\nA) constant\n\nB) decreasing');
    expect(mcqStemParagraphs('Prevent?\n\nA  cross\nB  insect\nC  self')).toBe('Prevent?\n\nA  cross\n\nB  insect\n\nC  self');
    expect(mcqStemParagraphs('No options\nhere at all')).toBe('No options\nhere at all');
    expect(mcqStemParagraphs(null)).toBe('');
  });
  it('normalises what students type', () => {
    for (const s of ['b', 'B', 'B)', '(B)', 'B) 330 m/s', 'option B', 'Ans: B', 'B.']) expect(normaliseMcqChoice(s)).toBe('B');
    expect(normaliseMcqChoice('Because …')).toBeNull();
    expect(normaliseMcqChoice('E')).toBeNull();
    expect(normaliseMcqChoice('')).toBeNull();
    expect(normaliseMcqChoice('AB')).toBeNull();
  });
  it('grades deterministically', () => {
    const right = gradeMcq('B', 'B', 1);
    expect(right.verdict).toBe('correct');
    expect(right.score).toBe(1);
    expect(right.lineComments[0].ok).toBe(true);
    const wrong = gradeMcq('B', 'D', null);
    expect(wrong).toMatchObject({ verdict: 'wrong', score: 0, outOf: 1 });
    expect(wrong.lineComments[0].fix).toBe('B');
    expect(wrong.nextSteps).toHaveLength(1);
  });
});

describe('computeScienceMastery', () => {
  it('averages score/outOf per first topic and keeps the latest attempt time', () => {
    const m = computeScienceMastery([
      { topics: ['Forces'], score: 1, outOf: 1, attemptedAt: '2026-09-01T10:00:00Z' },
      { topics: ['Forces'], score: 0, outOf: 1, attemptedAt: '2026-09-02T10:00:00Z' },
      { topics: ['Light'], score: null, outOf: null, attemptedAt: '2026-09-02T11:00:00Z' },
      { topics: [], score: 1, outOf: 1, attemptedAt: '2026-09-02T12:00:00Z' },
    ]);
    expect(m.get('Forces')).toEqual({ attempts: 2, mastery: 50, lastPracticedAt: '2026-09-02T10:00:00Z' });
    expect(m.get('Light')).toEqual({ attempts: 1, mastery: null, lastPracticedAt: '2026-09-02T11:00:00Z' });
    expect(m.size).toBe(2);
  });
});

describe('scienceImageUrl', () => {
  it('resolves bare filenames against the public bucket and leaves absolute URLs alone', () => {
    expect(scienceImageUrl('https://x.supabase.co/', 'phys_a.png')).toBe('https://x.supabase.co/storage/v1/object/public/question_images/phys_a.png');
    expect(scienceImageUrl('https://x.supabase.co', 'question_images/phys_a.png')).toBe('https://x.supabase.co/storage/v1/object/public/question_images/phys_a.png');
    expect(scienceImageUrl('https://x.supabase.co', 'https://cdn/img.png')).toBe('https://cdn/img.png');
    expect(scienceImageUrl('https://x.supabase.co', '[]')).toBeNull();
    expect(scienceImageUrl('https://x.supabase.co', null)).toBeNull();
  });
});
