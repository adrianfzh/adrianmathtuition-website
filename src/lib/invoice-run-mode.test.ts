import { describe, it, expect } from 'vitest';
import {
  resolveRunMode,
  resolveTargetMonthLabel,
  jobNameFor,
  buildPaymentReminderMessage,
} from './invoice-run-mode';

const q = (s: string) => new URLSearchParams(s);

describe('resolveRunMode', () => {
  it('reads arrears from the query string (how the Vercel cron fires it)', () => {
    expect(resolveRunMode(q('mode=arrears'))).toBe('arrears');
    expect(resolveRunMode(q('mode=ARREARS'))).toBe('arrears');
  });

  it('reads arrears from a manual JSON body', () => {
    expect(resolveRunMode(q(''), { mode: 'arrears' })).toBe('arrears');
    expect(resolveRunMode(null, { mode: 'arrears' })).toBe('arrears');
  });

  it('defaults to advance — no query, no body, blank or unknown mode', () => {
    expect(resolveRunMode()).toBe('advance');
    expect(resolveRunMode(q(''), {})).toBe('advance');
    expect(resolveRunMode(q('mode='), {})).toBe('advance');
    expect(resolveRunMode(q('mode=advance'), {})).toBe('advance');
    expect(resolveRunMode(q('mode=weekly'), { mode: 42 })).toBe('advance');
  });
});

describe('resolveTargetMonthLabel', () => {
  const advanceLabel = 'December 2026';

  it('advance mode keeps the caller’s getInvoiceMonth() label', () => {
    expect(resolveTargetMonthLabel({ mode: 'advance', todayISO: '2026-11-01', advanceLabel }))
      .toBe(advanceLabel);
  });

  it('1 Nov bills October in arrears', () => {
    expect(resolveTargetMonthLabel({ mode: 'arrears', todayISO: '2026-11-01', advanceLabel }))
      .toBe('October 2026');
    // the 2nd (the send run) targets the same month
    expect(resolveTargetMonthLabel({ mode: 'arrears', todayISO: '2026-11-02', advanceLabel }))
      .toBe('October 2026');
  });

  it('1 Dec bills November in arrears', () => {
    expect(resolveTargetMonthLabel({ mode: 'arrears', todayISO: '2026-12-01', advanceLabel }))
      .toBe('November 2026');
  });

  it('1 Jan targets the COMBINED December+January invoice, filed under January', () => {
    expect(resolveTargetMonthLabel({ mode: 'arrears', todayISO: '2027-01-01', advanceLabel }))
      .toBe('January 2027');
    expect(resolveTargetMonthLabel({ mode: 'arrears', todayISO: '2027-01-02', advanceLabel }))
      .toBe('January 2027');
  });

  it('an explicit month overrides both modes; a malformed one is ignored', () => {
    expect(resolveTargetMonthLabel({
      mode: 'arrears', todayISO: '2026-12-02', advanceLabel, explicitMonth: 'October 2026',
    })).toBe('October 2026');
    expect(resolveTargetMonthLabel({
      mode: 'advance', todayISO: '2026-12-02', advanceLabel, explicitMonth: 'March 2027',
    })).toBe('March 2027');
    expect(resolveTargetMonthLabel({
      mode: 'arrears', todayISO: '2026-11-02', advanceLabel, explicitMonth: 'Octobre 26',
    })).toBe('October 2026');
    expect(resolveTargetMonthLabel({
      mode: 'arrears', todayISO: '2026-11-02', advanceLabel, explicitMonth: 99,
    })).toBe('October 2026');
  });
});

describe('jobNameFor', () => {
  it('advance keeps the existing logbook names', () => {
    expect(jobNameFor('send-invoices', 'advance')).toBe('send-invoices');
    expect(jobNameFor('payment-reminder', 'advance')).toBe('payment-reminder');
  });

  it('arrears stamps the -arrears twins (JOB_RHYTHMS names)', () => {
    expect(jobNameFor('send-invoices', 'arrears')).toBe('send-invoices-arrears');
    expect(jobNameFor('payment-reminder', 'arrears')).toBe('payment-reminder-arrears');
    expect(jobNameFor('generate-invoices', 'arrears')).toBe('generate-invoices-arrears');
  });
});

describe('buildPaymentReminderMessage', () => {
  // Pins the long-standing advance text byte-for-byte — the arrears build must
  // not drift it.
  it('advance mode is the unchanged 14th-of-month reminder', () => {
    expect(buildPaymentReminderMessage('advance', 'December 2026')).toBe(
      '💰 <b>Payment Reminder</b>\n\n' +
      'Remember to check payments received and update Airtable before invoices generate tomorrow at 7am.\n\n' +
      'Go to Airtable → Invoices → tick Is Paid for received payments.'
    );
  });

  it('arrears mode names the month and the 2nd-at-10am auto-send', () => {
    const msg = buildPaymentReminderMessage('arrears', 'October 2026');
    expect(msg).toContain('October 2026');
    expect(msg).toContain('generated this morning');
    expect(msg).toContain('tomorrow (the 2nd) at 10am SGT');
    expect(msg).toContain('unless paused');
    expect(msg).not.toContain('7am');
  });
});
