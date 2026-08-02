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
