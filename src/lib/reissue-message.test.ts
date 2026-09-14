import { describe, it, expect } from 'vitest';
import { reissueLine, parseReissueReason } from './reissue-message';

const base = { paper: 'A Math • GCE 2022 • Paper 1', awarded: 77, max: 90, site: 'https://x.test' };

describe('reissueLine', () => {
  it("keeps the desk's wording for an override", () => {
    const s = reissueLine({ ...base, reason: 'checked', internal: false });
    expect(s).toContain('Adrian checked');
    expect(s).toContain('77/90');
  });

  it('tells a pages-recovered student the copy is complete, not re-marked', () => {
    const s = reissueLine({ ...base, reason: 'pages-recovered', internal: false });
    expect(s).toContain("didn't upload properly");
    expect(s).toContain('mark is unchanged');
    expect(s).not.toMatch(/Adrian checked|updated|re-?mark|redraw/i);
  });

  it('never blames the student for the missing pages', () => {
    const s = reissueLine({ ...base, reason: 'pages-recovered', internal: false });
    expect(s).not.toMatch(/you (?:did not|didn't|failed)|your upload|you sent/i);
  });

  it('reads as the first copy when the student never saw the predecessor', () => {
    for (const reason of ['checked', 'pages-recovered'] as const) {
      const s = reissueLine({ ...base, reason, internal: true });
      expect(s).toContain('is ready');
      expect(s).not.toContain('Adrian checked');
      expect(s).not.toContain("didn't upload");
    }
  });

  it('drops the score when the paper has no total', () => {
    const s = reissueLine({ ...base, max: 0, awarded: 0, reason: 'pages-recovered', internal: false });
    expect(s).not.toContain('/0');
    expect(s).not.toContain('unchanged');
  });

  it('escapes the paper name', () => {
    const s = reissueLine({ ...base, paper: 'A & B <script>', reason: 'checked', internal: false });
    expect(s).toContain('A &amp; B &lt;script&gt;');
  });

  it('reads the reason off a body and defaults to the desk', () => {
    expect(parseReissueReason('pages-recovered')).toBe('pages-recovered');
    expect(parseReissueReason('checked')).toBe('checked');
    expect(parseReissueReason(undefined)).toBe('checked');
    expect(parseReissueReason({ reason: 'pages-recovered' })).toBe('checked');
  });
});
