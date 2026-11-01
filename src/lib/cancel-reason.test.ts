import { describe, it, expect } from 'vitest';
import { cancelReason } from './cancel-reason';

describe('cancelReason', () => {
  it('a year-end opt-out says which month is skipped, not "holiday"', () => {
    expect(cancelReason('Holiday opt-out — November 2026').label).toBe('skipping Nov');
    expect(cancelReason('Holiday opt-out — December 2026 (auto-created)').label).toBe('skipping Dec');
  });

  it('says who made the opt-out when the note records it', () => {
    expect(cancelReason('Holiday opt-out — November 2026 · by parent (email button) (auto-created)').detail).toMatch(/Family pressed/);
    expect(cancelReason('Holiday opt-out — December 2026 · by Adrian (student page)').detail).toMatch(/You skipped/);
    expect(cancelReason('Holiday opt-out — November 2026 · by a Claude session').detail).toMatch(/Claude session/);
    expect(cancelReason('Holiday opt-out — November 2026').detail).toMatch(/not recorded/);
  });

  it('a student who has left reads graduated / discontinued', () => {
    expect(cancelReason('Holiday opt-out — November 2026 (auto-created)', 'Graduated')).toEqual({ label: 'graduated', detail: null });
    expect(cancelReason('', 'Inactive')).toEqual({ label: 'discontinued', detail: null });
    expect(cancelReason('Public Holiday', 'Active').label).toBe('public holiday');
  });

  it('a public holiday stays a public holiday', () => {
    expect(cancelReason('Public Holiday')).toEqual({ label: 'public holiday', detail: null });
  });

  it('a hand-written cancellation shows its reason and the rest underneath', () => {
    expect(cancelReason('Cancelled 15 Oct 2026 (Adrian): tutor away 28 Oct–1 Nov — NO make-up for Sing Zun; not charged (credit on Dec invoice)'))
      .toEqual({ label: 'tutor away 28 Oct–1 Nov', detail: 'NO make-up for Sing Zun; not charged (credit on Dec invoice)' });
    expect(cancelReason('Cancelled 15 Oct 2026 (Adrian): travelling 28 Nov–10 Dec; not charged (credit on Dec invoice)'))
      .toEqual({ label: 'travelling 28 Nov–10 Dec', detail: 'not charged (credit on Dec invoice)' });
  });

  it('a short free note is the label; a long one goes underneath', () => {
    expect(cancelReason('Away for a wedding')).toEqual({ label: 'Away for a wedding', detail: null });
    const long = 'Family overseas for the whole of the school holidays, back in January';
    expect(cancelReason(long)).toEqual({ label: 'cancelled', detail: long });
  });

  it('no note says so', () => {
    expect(cancelReason('')).toEqual({ label: 'cancelled', detail: 'No reason written down' });
    expect(cancelReason(undefined).label).toBe('cancelled');
  });

  it('a revision move reads "on revision"', () => {
    expect(cancelReason('Moved to Revision Sprint').label).toBe('on revision');
  });
});
