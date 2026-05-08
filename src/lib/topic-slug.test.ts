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

for (const [input, expected] of cases) {
  const result = topicSlug(input);
  if (result !== expected) {
    throw new Error(`topicSlug(${JSON.stringify(input)}) = ${JSON.stringify(result)}, want ${JSON.stringify(expected)}`);
  }
}
console.log('All topicSlug tests passed');
