import { describe, expect, it } from 'vitest';
import { deriveIsIp } from './portal-ip';

describe('deriveIsIp — Airtable Students → portal_accounts.is_ip', () => {
  it("'IP' Subject Level is the only true", () => {
    expect(deriveIsIp({ 'Subject Level': 'IP' })).toBe(true);
    expect(deriveIsIp({ 'Subject Level': ' ip ' })).toBe(true);
  });

  it('every other stream, blank, missing or malformed → false', () => {
    for (const v of ['G1', 'G2', 'G3', 'H1', 'H2', '', null, undefined, 7, ['IP']]) {
      expect(deriveIsIp({ 'Subject Level': v })).toBe(false);
    }
    expect(deriveIsIp({})).toBe(false);
    expect(deriveIsIp(null)).toBe(false);
    expect(deriveIsIp(undefined)).toBe(false);
  });

  it("'IP Math' in Subjects alone does not make an account IP — Subject Level decides", () => {
    expect(deriveIsIp({ Subjects: ['IP Math'], 'Subject Level': 'G3' })).toBe(false);
  });

  it("'IP Math' in Subjects counts when Subject Level is blank (15 Oct 2026)", () => {
    expect(deriveIsIp({ Subjects: ['IP Math'] })).toBe(true);
    expect(deriveIsIp({ Subjects: ['A Math', 'IP Math'], 'Subject Level': '' })).toBe(true);
    expect(deriveIsIp({ Subjects: ['A Math'] })).toBe(false);
  });
});
