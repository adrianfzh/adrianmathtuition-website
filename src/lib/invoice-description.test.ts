import { describe, it, expect } from 'vitest';
import { parentFacingDescription, leaksInternalFlag } from './invoice-description';

describe('parentFacingDescription — a parent never reads an internal matching flag', () => {
  it('the row Adrian caught: Tan Sijia, August 2026', () => {
    // Stored verbatim in Airtable receMzNhypjLgwuB8 (17 Sep 2026).
    expect(parentFacingDescription('Referral reward ⚠ fuzzy match — referred Chloe Gng'))
      .toBe('Referral reward — referred Chloe Gng');
  });

  it('every flag the generator could have written', () => {
    expect(parentFacingDescription('Referral reward ⚠️ fuzzy match — referred Ian Chen'))
      .toBe('Referral reward — referred Ian Chen');
    expect(parentFacingDescription('Referral reward ✅ exact match — referred Chloe Gng'))
      .toBe('Referral reward — referred Chloe Gng');
    expect(parentFacingDescription('Referral reward ❌ no match — referred Chloe Gng'))
      .toBe('Referral reward — referred Chloe Gng');
    // …with no badge, and with the flag at the very end
    expect(parentFacingDescription('Referral reward fuzzy match — referred Chloe Gng'))
      .toBe('Referral reward — referred Chloe Gng');
    // …and a flag in brackets takes its brackets with it, never leaving "()"
    expect(parentFacingDescription('Referral reward — referred Chloe Gng (fuzzy match)'))
      .toBe('Referral reward — referred Chloe Gng');
  });

  it('leaves an honest description exactly as it is', () => {
    const untouched = [
      'Referral reward — referred Chloe Gng',
      'Sec 4 E Math & A Math — August 2026',
      'Remaining June overpayment credit',
      'Additional lesson — 12 August 2026',
      'Revision Sprint — 4 sessions',
    ];
    for (const d of untouched) expect(parentFacingDescription(d)).toBe(d);
  });

  it('nothing legible left, or nothing given, falls back', () => {
    expect(parentFacingDescription('')).toBe('Additional Item');
    expect(parentFacingDescription('   ')).toBe('Additional Item');
    expect(parentFacingDescription(null)).toBe('Additional Item');
    expect(parentFacingDescription(undefined)).toBe('Additional Item');
    expect(parentFacingDescription(42 as unknown as string)).toBe('Additional Item');
    expect(parentFacingDescription('⚠ fuzzy match')).toBe('Additional Item');
    expect(parentFacingDescription('fuzzy match', 'Credit')).toBe('Credit');
  });

  it('is stateless — the same input answers the same way every time', () => {
    const d = 'Referral reward ⚠ fuzzy match — referred Chloe Gng';
    const once = parentFacingDescription(d);
    expect(parentFacingDescription(d)).toBe(once);
    expect(parentFacingDescription(d)).toBe(once);
    expect(leaksInternalFlag(d)).toBe(true);
    expect(leaksInternalFlag(d)).toBe(true);
  });

  it('leaksInternalFlag names the rows worth cleaning at source', () => {
    expect(leaksInternalFlag('Referral reward ⚠ fuzzy match — referred Chloe Gng')).toBe(true);
    expect(leaksInternalFlag('Referral reward — referred Chloe Gng')).toBe(false);
    expect(leaksInternalFlag('Sec 4 E Math & A Math — August 2026')).toBe(false);
    expect(leaksInternalFlag(null)).toBe(false);
  });

  it('a cleaned description still answers the admin badge’s Referral-reward test', () => {
    // /admin/invoices finds the referral row by description.includes('Referral reward')
    // and reads the BADGE from item.matchConfidence — cleaning must not break that.
    const cleaned = parentFacingDescription('Referral reward ⚠ fuzzy match — referred Chloe Gng');
    expect(cleaned.includes('Referral reward')).toBe(true);
  });
});
