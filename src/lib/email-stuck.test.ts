import { describe, it, expect } from 'vitest';
import { stuckEmails, stuckAlertText, type EmailLogRow } from './email-stuck';

const NOW = Date.parse('2026-10-16T01:00:00Z');
const row = (hoursAgo: number, status: string, resendId = 'r1'): EmailLogRow => ({
  id: `rec${hoursAgo}${status}`, sentAt: new Date(NOW - hoursAgo * 3600_000).toISOString(),
  status, resendId, to: 'p@example.com', subject: 'Invoice',
});

describe('stuckEmails', () => {
  it('picks sent / delayed emails 24–48 hours old', () => {
    expect(stuckEmails([row(30, 'sent'), row(40, 'delayed')], NOW)).toHaveLength(2);
  });
  it('ignores delivered, bounced, complained and failed', () => {
    expect(stuckEmails(['delivered', 'bounced', 'complained', 'failed'].map(s => row(30, s)), NOW)).toEqual([]);
  });
  it('waits a full day, and alerts only once (not again after 48 hours)', () => {
    expect(stuckEmails([row(23, 'sent'), row(49, 'sent')], NOW)).toEqual([]);
  });
  it('skips rows that never got a Resend id', () => {
    expect(stuckEmails([row(30, 'sent', '')], NOW)).toEqual([]);
  });
});

describe('stuckAlertText', () => {
  it('names each address and says it is not delivered', () => {
    const t = stuckAlertText([{ to: 'a@x.com', subject: 'Invoice', event: 'delivery_delayed' }]);
    expect(t).toContain('1 email not delivered');
    expect(t).toContain('a@x.com');
    expect(t).toContain('still being retried');
  });
});
