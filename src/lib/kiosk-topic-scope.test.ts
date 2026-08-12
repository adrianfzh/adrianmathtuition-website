import { describe, it, expect } from 'vitest';
import { topicNumber, secYear, inScope, scopeToStudent, SEC3_LAST_TOPIC } from './kiosk-topic-scope';

describe('topicNumber', () => {
  it('reads the leading number off a real filename', () => {
    expect(topicNumber('04 Nature of Roots Practice (S4 Prelim)')).toBe(4);
    expect(topicNumber('12 Circles Practice')).toBe(12);
    expect(topicNumber('31 Plane Geometry')).toBe(31);
  });

  it('does not read a number that is part of a word', () => {
    expect(topicNumber('2024 Prelim Practice')).toBe(null); // 4 digits, not a topic number
    expect(topicNumber('R formula practice')).toBe(null);
  });

  it('returns null for the old scheme and for unnumbered sheets', () => {
    expect(topicNumber('REV S4_AM Circles (Notes)')).toBe(null);
    expect(topicNumber('Quadratic Functions Practice')).toBe(null);
  });
});

describe('secYear', () => {
  it('parses the Airtable Level string', () => {
    expect(secYear('Sec 3')).toBe(3);
    expect(secYear('Sec 4')).toBe(4);
    expect(secYear(' Sec 3 ')).toBe(3);
  });
  it('returns null for JC and junk', () => {
    expect(secYear('JC2')).toBe(null);
    expect(secYear('')).toBe(null);
    expect(secYear(undefined)).toBe(null);
  });
});

describe('inScope — the AM Sec 3 cutoff', () => {
  it('shows a Sec 3 student topics up to the boundary', () => {
    expect(inScope('01 Quadratic Functions Practice', 'am', 'Sec 3')).toBe(true);
    expect(inScope('20 Applications of Trigonometry', 'am', 'Sec 3')).toBe(true);
  });

  it('hides topics past it', () => {
    expect(inScope('21 Differentiation Basic Techniques', 'am', 'Sec 3')).toBe(false);
    expect(inScope('31 Plane Geometry', 'am', 'Sec 3')).toBe(false);
  });

  // The superset rule: Sec 4 sits the O-Level on the whole syllabus.
  it('gives a Sec 4 student everything, early topics included', () => {
    expect(inScope('01 Quadratic Functions Practice', 'am', 'Sec 4')).toBe(true);
    expect(inScope('31 Plane Geometry', 'am', 'Sec 4')).toBe(true);
  });

  // This is the case that stopped us baking S3/S4 into the filename: an S3
  // topic whose questions come from an S4 prelim. Both years can use it.
  it('shows an S3-topic sheet built from S4 prelim questions to BOTH years', () => {
    const t = '04 Nature of Roots Practice (S4 Prelim)';
    expect(inScope(t, 'am', 'Sec 3')).toBe(true);
    expect(inScope(t, 'am', 'Sec 4')).toBe(true);
  });
});

describe('inScope — fails open', () => {
  it('does not narrow a level with no established boundary', () => {
    expect(SEC3_LAST_TOPIC.em).toBeUndefined();
    expect(inScope('31 Anything', 'em', 'Sec 3')).toBe(true);
    expect(inScope('31 Anything', 's1', 'Sec 3')).toBe(true);
  });

  it('shows sheets that carry no topic number', () => {
    expect(inScope('Quadratic Functions Practice', 'am', 'Sec 3')).toBe(true);
    expect(inScope('REV S4_AM Circles (Notes)', 'am', 'Sec 3')).toBe(true);
  });

  it('shows everything when the student level does not parse', () => {
    expect(inScope('31 Plane Geometry', 'am', 'JC2')).toBe(true);
    expect(inScope('31 Plane Geometry', 'am', '')).toBe(true);
  });
});

describe('scopeToStudent', () => {
  const listing = [
    { title: '01 Quadratic Functions Practice' },
    { title: '04 Nature of Roots Practice (S4 Prelim)' },
    { title: '12 Circles Practice' },
    { title: '25 Differentiation Maximum and Minimum' },
    { title: 'Unnumbered legacy sheet' },
  ];

  it('narrows a Sec 3 student and keeps unnumbered sheets', () => {
    expect(scopeToStudent(listing, 'am', 'Sec 3').map((e) => e.title)).toEqual([
      '01 Quadratic Functions Practice',
      '04 Nature of Roots Practice (S4 Prelim)',
      '12 Circles Practice',
      'Unnumbered legacy sheet',
    ]);
  });

  it('leaves a Sec 4 student untouched', () => {
    expect(scopeToStudent(listing, 'am', 'Sec 4')).toHaveLength(5);
  });

  // Admin has no student context; the route passes undefined.
  it('leaves admin listings untouched', () => {
    expect(scopeToStudent(listing, 'am', undefined)).toHaveLength(5);
    expect(scopeToStudent(listing, 'am', null)).toHaveLength(5);
  });
});
