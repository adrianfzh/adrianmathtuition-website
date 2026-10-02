import { describe, it, expect } from 'vitest';
import { leaverNotice } from './leaver-notice';

describe('leaverNotice', () => {
  it('names the student, counts the papers, and says when the account is deactivated', () => {
    const t = leaverNotice('download', { name: 'Joey <Tan>', email: 'j@x.com', papers: 11, left: true });
    expect(t).toContain('<b>Joey &lt;Tan&gt;</b> (j@x.com) downloaded all their marked papers — 11 papers.');
    expect(t).toContain('deactivated');
    expect(leaverNotice('download', { email: 'j@x.com', papers: 1 })).toBe('⬇️ <b>j@x.com</b> downloaded all their marked papers — 1 paper.');
  });
  it('a deletion says whether it was a tuition student', () => {
    expect(leaverNotice('delete', { name: 'Joey', tuition: true })).toContain('Lessons and billing records are untouched');
    expect(leaverNotice('delete', {})).toBe('🗑 <b>A student</b> deleted their app account.');
  });
});
