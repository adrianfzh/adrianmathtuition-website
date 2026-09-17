import { describe, it, expect } from 'vitest';
import { normalizeStudentLabel, studentPaperName, MAX_LABEL_LENGTH } from './paper-label';

describe('normalizeStudentLabel', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeStudentLabel('  My   AM  P1 ')).toEqual({ ok: true, label: 'My AM P1' });
  });
  it('an empty or missing name clears the label', () => {
    expect(normalizeStudentLabel('   ')).toEqual({ ok: true, label: null });
    expect(normalizeStudentLabel(null)).toEqual({ ok: true, label: null });
    expect(normalizeStudentLabel(undefined)).toEqual({ ok: true, label: null });
  });
  it('refuses non-text, over-long and control-character names', () => {
    expect(normalizeStudentLabel(42).ok).toBe(false);
    expect(normalizeStudentLabel('x'.repeat(MAX_LABEL_LENGTH + 1)).ok).toBe(false);
    expect(normalizeStudentLabel('x'.repeat(MAX_LABEL_LENGTH)).ok).toBe(true);
    expect(normalizeStudentLabel('bad' + String.fromCharCode(7) + 'name').ok).toBe(false);
  });
});

describe('studentPaperName', () => {
  it('the label wins when set, else the display name', () => {
    expect(studentPaperName('Mock 1', 'A Math · GCE 2022 · Paper 1')).toBe('Mock 1');
    expect(studentPaperName('  ', 'A Math · GCE 2022 · Paper 1')).toBe('A Math · GCE 2022 · Paper 1');
    expect(studentPaperName(null, 'A Math · GCE 2022 · Paper 1')).toBe('A Math · GCE 2022 · Paper 1');
  });
});
