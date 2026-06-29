import { describe, it, expect } from 'vitest';
import { topicSlug } from './topic-slug';

const cases: [string, string][] = [
  ['Trigonometry (R-Formula)', 'trigonometry-r-formula'],
  ['Differentiation (Techniques)', 'differentiation-techniques'],
  ['Numbers (Percentages)', 'numbers-percentages'],
  ['Integration  Techniques', 'integration-techniques'],
  ['  Leading and Trailing  ', 'leading-and-trailing'],
  ['A/B Testing', 'ab-testing'],
  ['Surds & Indices', 'surds-indices'],
  ['Logarithms (Log Laws)', 'logarithms-log-laws'],
];

describe('topicSlug', () => {
  it.each(cases)('slugs %j → %j', (input, expected) => {
    expect(topicSlug(input)).toBe(expected);
  });
});
