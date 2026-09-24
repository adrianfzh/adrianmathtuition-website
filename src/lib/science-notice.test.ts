import { describe, it, expect } from 'vitest';
import { scienceNoticeState, SCIENCE_NOTICE_HOURS, SCIENCE_OPEN_NOTICE } from './science-notice';

const T0 = Date.parse('2026-09-25T02:00:00Z'); // 10:00 SGT
const H = 3600_000;

describe('scienceNoticeState — one day from the first visit', () => {
  it('first visit: shows and stamps now', () => {
    const s = scienceNoticeState(null, T0);
    expect(s.show).toBe(true);
    expect(s.stamp).toBe(new Date(T0).toISOString());
  });

  it('within the day: shows, leaves the stamp alone', () => {
    const stamp = new Date(T0).toISOString();
    expect(scienceNoticeState(stamp, T0 + 5 * H)).toEqual({ show: true, stamp: null });
    expect(scienceNoticeState(stamp, T0 + (SCIENCE_NOTICE_HOURS * H - 1))).toEqual({ show: true, stamp: null });
  });

  it('a day later: gone, and stays gone', () => {
    const stamp = new Date(T0).toISOString();
    expect(scienceNoticeState(stamp, T0 + SCIENCE_NOTICE_HOURS * H)).toEqual({ show: false, stamp: null });
    expect(scienceNoticeState(stamp, T0 + 30 * 24 * H)).toEqual({ show: false, stamp: null });
  });

  it('garbage in storage counts as unseen and is re-stamped', () => {
    const s = scienceNoticeState('not a date', T0);
    expect(s.show).toBe(true);
    expect(s.stamp).toBe(new Date(T0).toISOString());
  });

  it('a stamp from the future is treated as now, not as never-expiring', () => {
    const s = scienceNoticeState(new Date(T0 + 48 * H).toISOString(), T0);
    expect(s.show).toBe(true);
    expect(s.stamp).toBe(new Date(T0).toISOString());
  });
});

describe('the approved wording', () => {
  it('ends with the limit and never asks for feedback', () => {
    const all = [SCIENCE_OPEN_NOTICE.greeting, SCIENCE_OPEN_NOTICE.lead, ...SCIENCE_OPEN_NOTICE.paragraphs, SCIENCE_OPEN_NOTICE.limit].join(' ');
    expect(SCIENCE_OPEN_NOTICE.limit).toBe('Limit: two papers a day. Extra papers wait for the next day, up to three days ahead.');
    expect(all).not.toMatch(/tell me what you think/i);
    expect(all).toMatch(/consult your teacher or tutor/);
    expect(all).toMatch(/attach them for better results/);
  });
});
