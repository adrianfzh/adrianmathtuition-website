import { describe, it, expect } from 'vitest';
import { POLICY_VERSION, PRIVACY_UPDATED, privacyUpdatedTag } from './portal-consent';

describe('the privacy page version and its "updated" tag', () => {
  it('the version tag is the October 2026 one', () => {
    expect(POLICY_VERSION).toBe('v3-2026-10');
  });
  it('the tag shows up to and on its last day, then is gone', () => {
    expect(privacyUpdatedTag('2026-10-07')).toBe(PRIVACY_UPDATED.label);
    expect(privacyUpdatedTag(PRIVACY_UPDATED.until)).toBe(PRIVACY_UPDATED.label);
    expect(privacyUpdatedTag('2026-11-08')).toBeNull();
  });
});
