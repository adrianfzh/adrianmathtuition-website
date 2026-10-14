import { describe, expect, it } from 'vitest';
import { ipContentAllowed, isIpOnlyRow, syllabusAllows } from './ip-content';

const PREVIEW = ['recPreview'];

describe('syllabusAllows — the legacy × ip_syllabus rule', () => {
  it('a current-syllabus row passes for everyone', () => {
    for (const ip of [false, true, null, undefined]) {
      expect(syllabusAllows({ legacy_syllabus: false, ip_syllabus: ip }, false)).toBe(true);
      expect(syllabusAllows({ legacy_syllabus: null, ip_syllabus: ip }, false)).toBe(true);
      expect(syllabusAllows({ ip_syllabus: ip }, true)).toBe(true);
    }
  });

  it('an IP-only row (both flags) passes only with IP content allowed', () => {
    const row = { legacy_syllabus: true, ip_syllabus: true };
    expect(isIpOnlyRow(row)).toBe(true);
    expect(syllabusAllows(row, true)).toBe(true);
    expect(syllabusAllows(row, false)).toBe(false);
  });

  it('an old-O-Level-syllabus row (legacy, not IP) never passes — not even for IP students', () => {
    for (const ip of [false, null, undefined]) {
      const row = { legacy_syllabus: true, ip_syllabus: ip };
      expect(isIpOnlyRow(row)).toBe(false);
      expect(syllabusAllows(row, true)).toBe(false);
      expect(syllabusAllows(row, false)).toBe(false);
    }
  });
});

describe('ipContentAllowed — who gets IP-only content', () => {
  const base = { admin: false, isIp: false, switchOpen: false, identity: 'recSomeone', previewIdentities: PREVIEW };

  it('switch closed: only admin and the preview student', () => {
    expect(ipContentAllowed({ ...base, admin: true })).toBe(true);
    expect(ipContentAllowed({ ...base, identity: 'recPreview' })).toBe(true);
    expect(ipContentAllowed({ ...base, isIp: true })).toBe(false);
    expect(ipContentAllowed(base)).toBe(false);
  });

  it('switch open: IP students too, never a mainstream student', () => {
    expect(ipContentAllowed({ ...base, switchOpen: true, isIp: true })).toBe(true);
    expect(ipContentAllowed({ ...base, switchOpen: true, isIp: false })).toBe(false);
  });

  it('a missing identity is not the preview student', () => {
    expect(ipContentAllowed({ ...base, identity: null })).toBe(false);
    expect(ipContentAllowed({ ...base, identity: undefined })).toBe(false);
  });
});
