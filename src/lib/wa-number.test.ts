import { describe, it, expect } from 'vitest';
import { waDigits, waDisplay, WA_NUMBER_FALLBACK } from './wa-number';

describe('waDigits', () => {
  it('keeps the country code for the wa.me link', () => {
    expect(waDigits('6580164142')).toBe('6580164142');
  });

  it('strips whatever punctuation the env value carries', () => {
    expect(waDigits('+65 8016 4142')).toBe('6580164142');
  });
});

describe('waDisplay', () => {
  it('renders the assistant line as "8016 4142"', () => {
    expect(waDisplay(WA_NUMBER_FALLBACK)).toBe('8016 4142');
  });

  it('accepts an already-formatted env value', () => {
    expect(waDisplay('+65 8016 4142')).toBe('8016 4142');
  });

  // ── Regression, 10–15 Aug 2026 ──────────────────────────────────────────────
  // The replacement string '$1 $2' was mangled into '1ドル 2ドル', so the regex
  // swallowed the eight digits and emitted that literal instead. One parent was
  // emailed "WhatsApp our assistant at 1ドル 2ドル". The shape assertion is the
  // guard: any replacement string that loses its backreferences fails it.
  it('emits four digits, one space, four digits — nothing else', () => {
    expect(waDisplay(WA_NUMBER_FALLBACK)).toMatch(/^\d{4} \d{4}$/);
  });

  it('never leaks a literal backreference or a currency mojibake', () => {
    const out = waDisplay(WA_NUMBER_FALLBACK);
    expect(out).not.toContain('$');
    expect(out).not.toContain('ドル');
  });
});
