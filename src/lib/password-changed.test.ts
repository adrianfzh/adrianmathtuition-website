import { describe, expect, it } from 'vitest';
import { changedRecently, passwordChangedLine } from './password-changed';

describe('changedRecently', () => {
  const now = Date.parse('2026-10-13T10:00:00Z');
  it('accepts a change a minute ago', () => expect(changedRecently('2026-10-13T09:59:00Z', now)).toBe(true));
  it('refuses a change an hour ago', () => expect(changedRecently('2026-10-13T09:00:00Z', now)).toBe(false));
  it('refuses nothing or junk', () => {
    expect(changedRecently(null, now)).toBe(false);
    expect(changedRecently('not a date', now)).toBe(false);
  });
});

describe('passwordChangedLine', () => {
  it('names the student and the door', () =>
    expect(passwordChangedLine({ name: 'Teste Echo', where: 'reset' })).toBe('🔑 <b>Teste Echo</b> changed their password (from the reset email).'));
  it('falls back to the email, and escapes it', () =>
    expect(passwordChangedLine({ name: ' ', email: 'a<b>@x.com', where: 'settings' })).toBe('🔑 <b>a&lt;b&gt;@x.com</b> changed their password (in Settings).'));
});
