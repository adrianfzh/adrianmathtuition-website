import { describe, it, expect } from 'vitest';
import { parseTopicsField } from './progress-digest';

// Regression suite for the two live formats of Airtable `Topics Covered`.
// A parser that only understood the JSON one silently reported ZERO topics for
// every lesson logged through LessonModal — which is all of them — so the
// weekly digest and every parent draft lost their topic list.
describe('parseTopicsField', () => {
  it('reads the comma format LessonModal writes', () => {
    expect(parseTopicsField({ 'Topics Covered': 'Differentiation, Vectors' }))
      .toEqual(['Differentiation', 'Vectors']);
  });

  it('reads the subject-prefixed comma format /admin/progress writes', () => {
    expect(parseTopicsField({ 'Topics Covered': 'E Math: Differentiation, A Math: Vectors' }))
      .toEqual(['E Math: Differentiation', 'A Math: Vectors']);
  });

  it('still reads the legacy JSON-array format', () => {
    expect(parseTopicsField({ 'Topics Covered': '["Trigonometry","Circles"]' }))
      .toEqual(['Trigonometry', 'Circles']);
  });

  it('merges Topics Free Text and dedupes across both fields', () => {
    expect(parseTopicsField({
      'Topics Covered': 'Differentiation, Vectors',
      'Topics Free Text': 'Vectors, Statistics',
    })).toEqual(['Differentiation', 'Vectors', 'Statistics']);
  });

  it('splits on newlines as well as commas', () => {
    expect(parseTopicsField({ 'Topics Free Text': 'Trig\nCircles' })).toEqual(['Trig', 'Circles']);
  });

  it('returns nothing for empty, missing or whitespace-only fields', () => {
    expect(parseTopicsField({})).toEqual([]);
    expect(parseTopicsField({ 'Topics Covered': '' })).toEqual([]);
    expect(parseTopicsField({ 'Topics Covered': '   ' })).toEqual([]);
    expect(parseTopicsField({ 'Topics Covered': ',,' })).toEqual([]);
  });

  it('treats a JSON scalar as plain text rather than dropping it', () => {
    expect(parseTopicsField({ 'Topics Covered': '42' })).toEqual(['42']);
  });
});
