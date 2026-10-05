import { describe, it, expect } from 'vitest';
import { lostTopics, pickTopics, cleanNote, topicFocus, readTopicFocus, topicList, NOTE_MAX } from './practice-again-topics';
import { focusText } from './sheet-queue';

const qs = [
  { questionNumber: '1', awarded: 3, max: 3, topic: 'Indices' },
  { questionNumber: '2', awarded: 1, max: 4, topic: 'Quadratics' },
  { questionNumber: '5', awarded: 0, max: 2, topic: 'quadratics' },
  { questionNumber: '7', awarded: 2, max: 6, topic: 'Trigonometry' },
  { questionNumber: '9', awarded: 0, max: 5, topic: null },
];

describe('lostTopics', () => {
  it('groups lost marks by topic, most lost first, full marks and untopiced left out', () => {
    expect(lostTopics(qs)).toEqual([
      { topic: 'Quadratics', lost: 5, questions: ['2', '5'] },
      { topic: 'Trigonometry', lost: 4, questions: ['7'] },
    ]);
  });
  it('is empty when no question names a topic', () => {
    expect(lostTopics([{ questionNumber: '1', awarded: 0, max: 4, topic: null }])).toEqual([]);
  });
});

describe('pickTopics', () => {
  const avail = lostTopics(qs);
  it('keeps only topics the paper lost marks on, in list order', () => {
    expect(pickTopics(['trigonometry', 'Quadratics', 'Calculus'], avail)).toEqual(['Quadratics', 'Trigonometry']);
  });
  it('rejects junk', () => {
    expect(pickTopics('Quadratics', avail)).toEqual([]);
    expect(pickTopics(null, avail)).toEqual([]);
  });
});

describe('focus round trip', () => {
  it('writes JSON the worker reads literally, and reads it back', () => {
    const f = topicFocus({ topics: ['Quadratics'], note: '  more on   discriminant ' });
    const j = JSON.parse(f);
    expect(j.topics).toEqual(['Quadratics']);
    expect(j.note).toBe('more on discriminant');
    expect(j.instruction).toMatch(/ONLY/);
    expect(readTopicFocus(f)).toEqual({ topics: ['Quadratics'], note: 'more on discriminant' });
  });
  it('a plain-text or wave-two focus is not a topic request', () => {
    expect(readTopicFocus('teach the angle')).toBeNull();
    expect(readTopicFocus(JSON.stringify({ wave: 2, shelved: ['x'] }))).toBeNull();
    expect(readTopicFocus(null)).toBeNull();
  });
  it('focusText renders the {topics} shape, never "[object Object]"', () => {
    const f = focusText({ topics: ['Indices', 'Surds'], note: 'hi' });
    expect(readTopicFocus(f)).toEqual({ topics: ['Indices', 'Surds'], note: 'hi' });
  });
});

describe('cleanNote / topicList', () => {
  it('caps the note', () => { expect(cleanNote('x'.repeat(500)).length).toBe(NOTE_MAX); });
  it('joins topics in plain words', () => {
    expect(topicList(['A'])).toBe('A');
    expect(topicList(['A', 'B'])).toBe('A and B');
    expect(topicList(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
