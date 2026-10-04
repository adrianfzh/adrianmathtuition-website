import { describe, it, expect } from 'vitest';
import {
  buildPaperNotice, parsePaperNotice, activePaperNotice, parseNoticeKind, NOTICE_DAYS,
  READ_ONCE_DAYS, isReadOnce, noticeView, readOnceToStamp,
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

describe('marks-recalibrated (29 Sep 2026)', () => {
  it('is a notice kind whose words never name Adrian', () => {
    expect(parseNoticeKind('marks-recalibrated')).toBe('marks-recalibrated');
  });
});

describe('pages-added notice', () => {
  it('is a notice kind with its own words', () => {
    expect(parseNoticeKind('pages-added')).toBe('pages-added');
    expect(buildPaperNotice('pages-added').kind).toBe('pages-added');
  });
});

describe('missing-questions notice', () => {
  it('names the questions and offers the door', () => {
    const n = buildPaperNotice('missing-questions', { at: '2026-09-30T00:00:00Z', missing: [{ q: 4 }, { q: 7, part: 'b' }] });
    const t = activePaperNotice({ student_notice: n }, new Date('2026-10-01T00:00:00Z'));
    expect(t?.title).toBe("We can't see Q4 and Q7(b) in your photos");
    expect(t?.addPages).toBe(true);
    expect(activePaperNotice({ student_notice: n }, new Date('2026-10-04T00:00:00Z'))).toBeNull();
  });
});

// 🔢 Six E Math papers shown out of 90 (5 Oct 2026). Adrian: "put a small note
// that disappears upon first read … do not mention adrian".
describe('total-corrected — a read-once notice', () => {
  const at = '2026-10-05T04:00:00.000Z';
  const fresh = { student_notice: buildPaperNotice('total-corrected', { at, fromMax: 90, toMax: 80 }) };
  const seen = { student_notice: { ...fresh.student_notice, seen_at: '2026-10-05T09:00:00.000Z' } };
  const now = new Date('2026-10-06T00:00:00Z');

  it('names both totals, says the marks stand, and names nobody', () => {
    const t = activePaperNotice(fresh, now)!;
    expect(t.kind).toBe('total-corrected');
    expect(t.title).toBe('Total marks corrected');
    expect(t.body).toBe("This paper's total was shown as out of 90 by mistake. It is now out of 80. Your marks did not change.");
    expect(`${t.title} ${t.body}`).not.toMatch(/adrian|tutor|re-?mark|checked/i);
  });

  it('stands for a 30-day safety net, not three days', () => {
    expect(fresh.student_notice.until).toBe('2026-11-04T04:00:00.000Z');
    expect(READ_ONCE_DAYS).toBe(30);
    expect(isReadOnce('total-corrected')).toBe(true);
    expect(isReadOnce('pages-recovered')).toBe(false);
  });

  it('unseen + the student → shown, and this render stamps it', () => {
    const v = noticeView(fresh, { viewer: 'student', now });
    expect(v.text?.kind).toBe('total-corrected');
    expect(v.stampSeen).toBe(true);
    expect(readOnceToStamp([{ id: 'r1', notice: v.text }], 'student')).toEqual(['r1']);
  });

  it('seen → gone, and nothing to stamp', () => {
    expect(activePaperNotice(seen, now)).toBeNull();
    expect(noticeView(seen, { viewer: 'student', now })).toEqual({ text: null, stampSeen: false });
    // The record stays on the run.
    expect(parsePaperNotice(seen.student_notice)?.seen_at).toBe('2026-10-05T09:00:00.000Z');
  });

  it("Adrian's view (his cookie, view-as included) shows it but never counts as the read", () => {
    const v = noticeView(fresh, { viewer: 'admin', now });
    expect(v.text?.kind).toBe('total-corrected');
    expect(v.stampSeen).toBe(false);
    expect(readOnceToStamp([{ id: 'r1', notice: v.text }], 'admin')).toEqual([]);
  });

  it('past the safety expiry → gone even unseen', () => {
    expect(noticeView(fresh, { viewer: 'student', now: new Date('2026-11-04T04:00:00Z') })).toEqual({ text: null, stampSeen: false });
  });

  it('the timed kinds are untouched: a seen_at does not hide them, and they are never stamped', () => {
    const p = { student_notice: { ...buildPaperNotice('pages-recovered', { at }), seen_at: at } };
    const v = noticeView(p, { viewer: 'student', now });
    expect(v.text?.kind).toBe('pages-recovered');
    expect(v.stampSeen).toBe(false);
    expect(readOnceToStamp([{ id: 'r1', notice: v.text }], 'student')).toEqual([]);
  });

  it('without both totals it falls back to the plain line', () => {
    const t = activePaperNotice({ student_notice: buildPaperNotice('total-corrected', { at, fromMax: 90 }) }, now)!;
    expect(t.body).toBe("This paper's total was shown wrongly. It is correct now. Your marks did not change.");
    expect(parseNoticeKind('total-corrected')).toBe('total-corrected');
  });
});
