import { describe, it, expect } from 'vitest';
import { sanitizeSubmitFailure, shouldNotifySubmitFailure, submitFailureLine, SUBMIT_FAILURE_NOTIFY_WINDOW_MS } from './submit-failure';

describe('sanitizeSubmitFailure — the phone\'s report, bounded', () => {
  it('keeps a well-formed report', () => {
    expect(sanitizeSubmitFailure({ stage: 'upload', reason: 'Load failed', pages: 6, uploaded: 4, paperName: 'am tys 2022 p1', attempts: 3 }))
      .toEqual({ stage: 'upload', reason: 'Load failed', pages: 6, uploaded: 4, paperName: 'am tys 2022 p1', attempts: 3 });
  });
  it('rejects anything that is not a failure report', () => {
    expect(sanitizeSubmitFailure(null)).toBeNull();
    expect(sanitizeSubmitFailure('x')).toBeNull();
    expect(sanitizeSubmitFailure({ stage: 'party' })).toBeNull();
  });
  it('clips text, bounds numbers, and never reports more uploaded than pages', () => {
    const f = sanitizeSubmitFailure({ stage: 'send', reason: 'x'.repeat(500), pages: 9999, uploaded: 12, paperName: '  spaced   name ' })!;
    expect(f.reason.length).toBe(200);
    expect(f.pages).toBe(200);
    expect(f.uploaded).toBe(12);
    expect(f.paperName).toBe('spaced name');
    expect(sanitizeSubmitFailure({ stage: 'rejected', pages: 2, uploaded: 5 })!.uploaded).toBe(2);
    expect(sanitizeSubmitFailure({ stage: 'rejected' })!.reason).toBe('unknown');
    expect(sanitizeSubmitFailure({ stage: 'rejected', attempts: 'abc' })!.attempts).toBe(3);
  });
});

describe('shouldNotifySubmitFailure — one line per student per hour', () => {
  const now = new Date('2026-09-07T05:00:00Z');
  it('notifies with no earlier failure, or one older than the window', () => {
    expect(shouldNotifySubmitFailure(null, now)).toBe(true);
    expect(shouldNotifySubmitFailure(new Date(now.getTime() - SUBMIT_FAILURE_NOTIFY_WINDOW_MS).toISOString(), now)).toBe(true);
    expect(shouldNotifySubmitFailure('garbage', now)).toBe(true);
  });
  it('stays quiet inside the window', () => {
    expect(shouldNotifySubmitFailure(new Date(now.getTime() - 10 * 60_000).toISOString(), now)).toBe(false);
  });
});

describe('submitFailureLine', () => {
  it('reads as one sentence Adrian can act on, with HTML escaped', () => {
    const line = submitFailureLine('Rainie <Cheng>', { stage: 'upload', reason: 'Load failed & gone', pages: 6, uploaded: 4, paperName: 'AM TYS 2022 P1', attempts: 3 });
    expect(line).toContain('<b>Rainie &lt;Cheng&gt;</b>');
    expect(line).toContain('a page would not upload after 3 tries');
    expect(line).toContain('<i>Load failed &amp; gone</i>');
    expect(line).toContain('4 of 6 pages uploaded');
    expect(line).toContain('“AM TYS 2022 P1”');
    expect(line).toContain('They were told to try again.');
  });
  it('names the other two stages and copes with no name', () => {
    expect(submitFailureLine(null, { stage: 'send', reason: 'no reply', pages: 1, uploaded: 1, paperName: null, attempts: 3 }))
      .toMatch(/^⚠️ <b>A student<\/b>'s hand-in failed on their phone — the last step could not reach us after 3 tries/);
    expect(submitFailureLine('X', { stage: 'rejected', reason: '500', pages: 1, uploaded: 1, paperName: null, attempts: 1 })).toContain('we rejected it after 1 tries');
  });
});
