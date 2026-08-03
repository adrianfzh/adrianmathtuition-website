import { describe, expect, it } from 'vitest';
import { resolveInboxFileName } from './inbox-filename';

describe('resolveInboxFileName', () => {
  it('keeps a well-formed name with a valid extension', () => {
    expect(resolveInboxFileName('2025 TKGS EM P1 (Solns).pdf', 'pdf')).toBe('2025 TKGS EM P1 (Solns).pdf');
  });
  it('appends the sniffed extension when the name has none (Shortcuts Name token strips it)', () => {
    expect(resolveInboxFileName('2025 TKGS EM P1 (Solns)', 'pdf')).toBe('2025 TKGS EM P1 (Solns).pdf');
  });
  it('replaces a wrong extension with the sniffed one', () => {
    expect(resolveInboxFileName('scan.docx', 'jpg')).toBe('scan.jpg');
  });
  it('missing/empty header falls back to shared.<ext>', () => {
    expect(resolveInboxFileName(null, 'pdf')).toBe('shared.pdf');
    expect(resolveInboxFileName(undefined, 'jpg')).toBe('shared.jpg');
    expect(resolveInboxFileName('   ', 'pdf')).toBe('shared.pdf');
  });
  it('strips path separators and unsafe characters (Blob pathname bound)', () => {
    expect(resolveInboxFileName('../../etc/passwd.pdf', 'pdf')).toBe('etcpasswd.pdf');
    expect(resolveInboxFileName('a/b\\c:d*e?.pdf', 'pdf')).toBe('abcde.pdf');
  });
  it('never yields a dot-file or bare dots', () => {
    expect(resolveInboxFileName('...', 'pdf')).toBe('shared.pdf');
    expect(resolveInboxFileName('.hidden', 'pdf')).toBe('hidden.pdf');
  });
  it('caps absurdly long names at 120 chars before the extension fix-up', () => {
    const long = 'x'.repeat(300) + '.pdf';
    const out = resolveInboxFileName(long, 'pdf');
    expect(out.length).toBeLessThanOrEqual(124);
    expect(out.endsWith('.pdf')).toBe(true);
  });
});

// ── share-time kind tags (Shortcut "Attach as?" menu, 3 Aug 2026) ────────────
import { inboxKindFrom, parseInboxPath } from './inbox-filename';

describe('inboxKindFrom', () => {
  it('safelists the two kinds, case-insensitively', () => {
    expect(inboxKindFrom('working')).toBe('working');
    expect(inboxKindFrom('Paper')).toBe('paper');
  });
  it('anything else means untagged — a header can say anything', () => {
    expect(inboxKindFrom('solutions')).toBeNull();
    expect(inboxKindFrom('../../etc')).toBeNull();
    expect(inboxKindFrom('')).toBeNull();
    expect(inboxKindFrom(null)).toBeNull();
  });
});

describe('parseInboxPath', () => {
  it('reads the kind segment and strips it with the timestamp', () => {
    expect(parseInboxPath('working/1754000000-xinmin em p2.pdf'))
      .toEqual({ kind: 'working', name: 'xinmin em p2.pdf' });
    expect(parseInboxPath('paper/1754000000-tkgs prelim.pdf'))
      .toEqual({ kind: 'paper', name: 'tkgs prelim.pdf' });
  });
  it('untagged root files parse exactly as before', () => {
    expect(parseInboxPath('1754000000-shared.pdf')).toEqual({ kind: null, name: 'shared.pdf' });
  });
  it('a filename that merely CONTAINS a kind word is not a tag', () => {
    expect(parseInboxPath('1754000000-working notes.pdf')).toEqual({ kind: null, name: 'working notes.pdf' });
  });
});
