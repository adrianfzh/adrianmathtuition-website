import { describe, it, expect } from 'vitest';
import {
  deriveBankLevels,
  matchBankTopic,
  partsAnswerSummary,
  pickSuggestedQuestions,
  slotTimeSortKey,
  parseTopicsCovered,
  type BankQuestionRow,
} from './prep';

describe('deriveBankLevels', () => {
  it('Sec 4 dual-subject searches both S4 banks', () => {
    expect(deriveBankLevels('Sec 4', ['A Math', 'E Math'])).toEqual(['AM', 'EM']);
  });
  it('Sec 3 A Math tops up from the S4 pool, S3 bank first', () => {
    expect(deriveBankLevels('Sec 3', ['A Math'])).toEqual(['S3_AM', 'AM']);
  });
  it('Sec 3 E Math mirrors that order', () => {
    expect(deriveBankLevels('Sec 3', ['E Math'])).toEqual(['S3_EM', 'EM']);
  });
  it('lower sec ignores subject labels', () => {
    expect(deriveBankLevels('Sec 1', ['Math'])).toEqual(['S1']);
    expect(deriveBankLevels('Sec 2', ['Math'])).toEqual(['S2']);
  });
  it('JC maps to the JC bank regardless of H1/H2', () => {
    expect(deriveBankLevels('JC1', ['H2 Math'])).toEqual(['JC']);
  });
  it('IP Math counts as both subjects', () => {
    expect(deriveBankLevels('Sec 4', ['IP Math'])).toEqual(['AM', 'EM']);
  });
  it('unknown level yields nothing rather than a guess', () => {
    expect(deriveBankLevels('', ['A Math'])).toEqual([]);
  });
});

describe('matchBankTopic', () => {
  const bank = [
    'Trigonometric Functions',
    'Quadratic Functions',
    'Quadratic Equations and Inequalities',
    'Binomial Theorem',
    'Kinematics',
  ];
  it('exact match wins regardless of case/punctuation', () => {
    expect(matchBankTopic('binomial theorem', bank)).toBe('Binomial Theorem');
    expect(matchBankTopic('Binomial-Theorem', bank)).toBe('Binomial Theorem');
  });
  it('containment links a shorter marker name to the bank name', () => {
    expect(matchBankTopic('Quadratic Functions and Graphs', bank)).toBe('Quadratic Functions');
  });
  it('shared long word-prefix bridges Trigonometry ↔ Trigonometric Functions', () => {
    expect(matchBankTopic('Trigonometry', bank)).toBe('Trigonometric Functions');
  });
  it('a lone short shared word never bridges distinct topics', () => {
    // "Surds" shares nothing ≥8 chars with any bank name.
    expect(matchBankTopic('Surds', bank)).toBeNull();
  });
  it('rejects junk input', () => {
    expect(matchBankTopic('', bank)).toBeNull();
    expect(matchBankTopic('–', bank)).toBeNull();
  });
});

describe('pickSuggestedQuestions', () => {
  const q = (over: Partial<BankQuestionRow>): BankQuestionRow => ({
    id: Math.random().toString(36).slice(2),
    school: 'ACS',
    year: 2023,
    paper: 'P1',
    question_number: '5',
    question_text: 'Solve x^2 = 4.',
    total_marks: 3,
    answer: 'x = ±2',
    parts: null,
    difficulty: 'Standard',
    ...over,
  });

  it('drops rows with no final answer anywhere', () => {
    const rows = [q({ answer: '' }), q({ answer: null })];
    expect(pickSuggestedQuestions(rows, 3)).toEqual([]);
  });
  it('accepts part-level answers when the top-level one is empty', () => {
    const rows = [q({ answer: '', parts: [{ label: 'i', answer: '12' }, { label: 'ii', answer: 'x=3' }] })];
    expect(pickSuggestedQuestions(rows, 3)).toHaveLength(1);
  });
  it('drops figure-referencing rows (the card shows no images)', () => {
    const rows = [q({ question_text: 'The diagram shows a circle…' })];
    expect(pickSuggestedQuestions(rows, 3)).toEqual([]);
  });
  it('prefers recent years and spreads across schools before repeating one', () => {
    const rows = [
      q({ id: 'a', school: 'ACS', year: 2025 }),
      q({ id: 'b', school: 'ACS', year: 2024 }),
      q({ id: 'c', school: 'RI', year: 2023 }),
      q({ id: 'd', school: 'SST', year: 2021 }),
    ];
    const picked = pickSuggestedQuestions(rows, 3);
    expect(picked.map(r => r.id)).toEqual(['a', 'c', 'd']);
  });
  it('falls back to repeating a school when variety runs out', () => {
    const rows = [
      q({ id: 'a', school: 'ACS', year: 2025 }),
      q({ id: 'b', school: 'ACS', year: 2024 }),
    ];
    expect(pickSuggestedQuestions(rows, 3).map(r => r.id)).toEqual(['a', 'b']);
  });
});

describe('partsAnswerSummary', () => {
  it('joins labelled part answers', () => {
    expect(partsAnswerSummary([
      { label: 'i', answer: '12' },
      { label: '(ii)', answer: 'x = 3' },
      { label: 'iii', answer: '' },
    ])).toBe('(i) 12 · (ii) x = 3');
  });
  it('handles non-arrays quietly', () => {
    expect(partsAnswerSummary(null)).toBe('');
  });
});

describe('slotTimeSortKey', () => {
  it('orders the day left to right, unknowns last', () => {
    expect(slotTimeSortKey('9-11am')).toBeLessThan(slotTimeSortKey('7-9pm'));
    expect(slotTimeSortKey('weird')).toBeGreaterThan(slotTimeSortKey('7-9pm'));
  });
});

describe('parseTopicsCovered', () => {
  it('parses the JSON array and appends free text', () => {
    expect(parseTopicsCovered('["Kinematics","Vectors"]', 'RC circuits')).toEqual([
      'Kinematics', 'Vectors', 'RC circuits',
    ]);
  });
  it('treats unparseable text as a single topic', () => {
    expect(parseTopicsCovered('Kinematics only')).toEqual(['Kinematics only']);
  });
  it('empty in, empty out', () => {
    expect(parseTopicsCovered('', '')).toEqual([]);
  });
});
