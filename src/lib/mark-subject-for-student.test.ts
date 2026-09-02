import { describe, it, expect } from 'vitest';
import { markSubjectOfLabel, markSubjectsFromEnrolment, resolveHandinSubject, pickableSubjects } from './mark-subject-for-student';

describe('markSubjectOfLabel', () => {
  it('folds every maths variant to math', () => {
    for (const l of ['Math', 'E Math', 'A Math', 'IP Math', 'H1 Math', 'H2 Math']) expect(markSubjectOfLabel(l)).toBe('math');
  });
  it('maps the sciences by their first word', () => {
    expect(markSubjectOfLabel('Physics')).toBe('physics');
    expect(markSubjectOfLabel('Pure Chemistry')).toBe('chemistry');
    expect(markSubjectOfLabel('Combined Science (Biology)')).toBe('biology');
  });
  it('is null for the unknown and the empty', () => {
    expect(markSubjectOfLabel('Geography')).toBeNull();
    expect(markSubjectOfLabel('')).toBeNull();
    expect(markSubjectOfLabel(null as unknown as string)).toBeNull();
  });
});

describe('markSubjectsFromEnrolment', () => {
  it('always includes math, math first, canonical order, de-duplicated', () => {
    expect(markSubjectsFromEnrolment(['A Math', 'Physics', 'E Math'])).toEqual(['math', 'physics']);
    expect(markSubjectsFromEnrolment(['Biology', 'Chemistry', 'Physics'])).toEqual(['math', 'physics', 'chemistry', 'biology']);
  });
  it('a maths-only or empty enrolment is just math — which is every student today', () => {
    expect(markSubjectsFromEnrolment(['E Math'])).toEqual(['math']);
    expect(markSubjectsFromEnrolment([])).toEqual(['math']);
    expect(markSubjectsFromEnrolment(null)).toEqual(['math']);
  });
});

describe('resolveHandinSubject — the gate', () => {
  const enrolled = ['math', 'physics'] as const;
  it('CLOSED forces math no matter what the browser sent', () => {
    expect(resolveHandinSubject({ requested: 'physics', enrolled: [...enrolled], access: 'closed' })).toBe('math');
    expect(resolveHandinSubject({ requested: 'biology', enrolled: ['math', 'biology'], access: 'closed' })).toBe('math');
  });
  it('OPEN honours only a subject the student is enrolled in', () => {
    expect(resolveHandinSubject({ requested: 'physics', enrolled: [...enrolled], access: 'open' })).toBe('physics');
    expect(resolveHandinSubject({ requested: 'biology', enrolled: [...enrolled], access: 'open' })).toBe('math');  // not enrolled
    expect(resolveHandinSubject({ requested: 'chemistry', enrolled: ['math'], access: 'open' })).toBe('math');
  });
  it('PREVIEW (admin) honours any valid subject', () => {
    expect(resolveHandinSubject({ requested: 'biology', enrolled: ['math'], access: 'preview' })).toBe('biology');
  });
  it('a junk or absent request is always math', () => {
    expect(resolveHandinSubject({ requested: 'nonsense', enrolled: [...enrolled], access: 'open' })).toBe('math');
    expect(resolveHandinSubject({ requested: undefined, enrolled: [...enrolled], access: 'preview' })).toBe('math');
    expect(resolveHandinSubject({ requested: 'physics', access: 'open' })).toBe('math');  // enrolled unknown → math-only
  });
});

describe('pickableSubjects', () => {
  it('preview offers everything; open offers the enrolment only when it has a choice; closed offers nothing', () => {
    expect(pickableSubjects({ enrolled: ['math'], access: 'preview' })).toEqual(['math', 'physics', 'chemistry', 'biology']);
    expect(pickableSubjects({ enrolled: ['math', 'physics'], access: 'open' })).toEqual(['math', 'physics']);
    expect(pickableSubjects({ enrolled: ['math'], access: 'open' })).toEqual([]);   // no real choice → no picker
    expect(pickableSubjects({ enrolled: ['math', 'physics'], access: 'closed' })).toEqual([]);
  });
});
