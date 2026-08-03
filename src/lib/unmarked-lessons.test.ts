import { describe, it, expect } from 'vitest';
import { unmarkedLessonsFilterFormula } from './unmarked-lessons';

describe('unmarkedLessonsFilterFormula', () => {
  it('selects past Scheduled non-Trial lessons, strictly before today', () => {
    expect(unmarkedLessonsFilterFormula('2026-08-04')).toBe(
      "AND({Status}='Scheduled',{Type}!='Trial',{Date}<'2026-08-04')"
    );
  });

  it("uses an exclusive < bound (today's lessons are not yet unmarked)", () => {
    // The schedule chip's rule is lesson.date < today — a lesson happening
    // today must not be flagged. `<=` is also the known Airtable boundary
    // trap; the formula must never use it.
    const f = unmarkedLessonsFilterFormula('2026-01-01');
    expect(f).toContain("{Date}<'2026-01-01'");
    expect(f).not.toContain('<=');
  });
});
