import { describe, it, expect } from 'vitest';
import { linkedStudentNameFilter, narrowToStudent } from './airtable';

describe('linkedStudentNameFilter', () => {
  it('matches a plain name exactly on the linked display name', () => {
    expect(linkedStudentNameFilter('Rainie Cheng')).toBe("ARRAYJOIN({Student})='Rainie Cheng'");
  });
  it("escapes an apostrophe so O'Neil does not break the formula", () => {
    expect(linkedStudentNameFilter("Sean O'Neil")).toBe("ARRAYJOIN({Student})='Sean O\\'Neil'");
  });
  it('trims and returns nothing for a blank name (callers fall back to the full pull)', () => {
    expect(linkedStudentNameFilter('  ')).toBe('');
    expect(linkedStudentNameFilter(null)).toBe('');
    expect(linkedStudentNameFilter(' Ava ')).toBe("ARRAYJOIN({Student})='Ava'");
  });
  it('narrowToStudent ANDs a formula, or passes it through when the name is blank', () => {
    expect(narrowToStudent("{Date}>='2026-03-12'", 'Rainie Cheng')).toBe("AND({Date}>='2026-03-12', ARRAYJOIN({Student})='Rainie Cheng')");
    expect(narrowToStudent("{Date}>='2026-03-12'", '')).toBe("{Date}>='2026-03-12'");
  });
});
