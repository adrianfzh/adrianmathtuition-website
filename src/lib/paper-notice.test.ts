import { describe, it, expect } from 'vitest';
import {
  buildPaperNotice, parsePaperNotice, activePaperNotice, parseNoticeKind, NOTICE_DAYS,
} from './paper-notice';

const AT = '2026-09-14T06:00:00.000Z';

describe('buildPaperNotice', () => {
  it('expires three days after the copy changed', () => {
    const n = buildPaperNotice('pages-recovered', { at: AT });
    expect(n.at).toBe(AT);
    expect(n.until).toBe('2026-09-17T06:00:00.000Z');
    expect(NOTICE_DAYS).toBe(3);
  });
});

describe('activePaperNotice', () => {
  const rj = { student_notice: buildPaperNotice('pages-recovered', { at: AT }) };

  it('shows while it stands', () => {
    const t = activePaperNotice(rj, new Date('2026-09-16T23:59:00Z'));
    expect(t?.kind).toBe('pages-recovered');
    // The wording never claims a re-mark or a new score — Adrian, 14 Sep 2026.
    expect(t!.body).toContain("didn't upload properly");
    expect(t!.body).toContain("mark hasn't changed");
    expect(t!.body).not.toMatch(/redraw|re-?mark/i);
  });

  it('stops on the third day, and the stamp stays on the run', () => {
    expect(activePaperNotice(rj, new Date('2026-09-17T06:00:00Z'))).toBeNull();
    expect(activePaperNotice(rj, new Date('2026-09-20T00:00:00Z'))).toBeNull();
    expect(parsePaperNotice(rj.student_notice)).not.toBeNull();
  });

  it("says what was wrong with Joey's copy, and not what wasn't", () => {
    const j = { student_notice: buildPaperNotice('marks-realigned', { at: AT }) };
    const t = activePaperNotice(j, new Date('2026-09-15T00:00:00Z'));
    expect(t?.kind).toBe('marks-realigned');
    expect(t!.title).toBe('A fix to your marked copy');
    expect(t!.body).toContain("didn't line up");
    // Her pages were all there — the pages story is Alexis Wong's, not hers.
    expect(t!.body).not.toMatch(/upload|missing/i);
    // The word that makes a student ask whether their score moved. It did not.
    expect(t!.body).not.toMatch(/redraw|re-?mark/i);
    expect(t!.body).toMatch(/neither did your mark/i);
    // No affected page is named: a list invites an audit of marking that stands.
    expect(t!.body).not.toMatch(/\b(p(age)?\s*)?\d+\b/);
  });

  it('is absent on a run that never had one, and on junk', () => {
    expect(activePaperNotice({})).toBeNull();
    expect(activePaperNotice(null)).toBeNull();
    expect(activePaperNotice({ student_notice: 'yes' })).toBeNull();
    expect(activePaperNotice({ student_notice: { kind: 'pages-recovered' } })).toBeNull();
    expect(activePaperNotice({ student_notice: { kind: 'something-else', until: '2099-01-01T00:00:00Z' } })).toBeNull();
    expect(activePaperNotice({ student_notice: { kind: 'pages-recovered', until: 'soon' } })).toBeNull();
  });
});

describe('parseNoticeKind', () => {
  it('takes only the kind it knows', () => {
    expect(parseNoticeKind('pages-recovered')).toBe('pages-recovered');
    expect(parseNoticeKind('marks-realigned')).toBe('marks-realigned');
    // A desk override is Adrian's own word and keeps its Telegram line.
    expect(parseNoticeKind('checked')).toBeNull();
    expect(parseNoticeKind('marks realigned')).toBeNull();
    expect(parseNoticeKind(true)).toBeNull();
    expect(parseNoticeKind(undefined)).toBeNull();
  });
});
