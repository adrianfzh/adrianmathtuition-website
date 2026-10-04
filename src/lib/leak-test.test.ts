import { describe, it, expect } from 'vitest';
import { judgeTableRead, judgeProbe, leakTestLine } from './leak-test';

const self = { uid: 'u-1', identity: 'recSELF' };

describe('judgeTableRead', () => {
  it('nothing back is always fine', () => {
    expect(judgeTableRead('paper_marking_runs', [], null)).toBeNull();
  });
  it('public content may be read by anyone', () => {
    expect(judgeTableRead('subgroups', [{ id: 1 }], null)).toBeNull();
  });
  it('any student row readable signed out is a leak', () => {
    expect(judgeTableRead('student_attempts', [{ user_id: 'u-2' }], null)).toMatch(/signed-out visitor/);
  });
  it('the student reading only their own rows is fine', () => {
    expect(judgeTableRead('student_attempts', [{ user_id: 'u-1' }], self)).toBeNull();
    expect(judgeTableRead('portal_assignments', [{ airtable_student_id: 'recSELF' }], self)).toBeNull();
    expect(judgeTableRead('portal_accounts', [{ id: 'u-1' }], self)).toBeNull();
    expect(judgeTableRead('notebook_mistakes', [{ airtable_student_id: 'acct:u-1' }], self)).toBeNull();
  });
  it('another student\'s row is a leak', () => {
    expect(judgeTableRead('portal_assignments', [{ airtable_student_id: 'recSELF' }, { airtable_student_id: 'recOTHER' }], self))
      .toMatch(/1 row\(s\) of someone else/);
    expect(judgeTableRead('portal_accounts', [{ id: 'u-2' }], self)).toMatch(/someone else/);
  });
  it('a readable table with no owner column is a leak (it should not be readable)', () => {
    expect(judgeTableRead('job_runs', [{ job: 'x' }], self)).toMatch(/someone else/);
  });
});

describe('judgeProbe', () => {
  const api = { label: 'their PDF', path: '/api/portal/marking-pdf?run=B' };
  it('401 / 403 / 404 / redirects are safe', () => {
    for (const s of [401, 403, 404, 307, 400]) expect(judgeProbe(api, s, true)).toBeNull();
  });
  it('an API route answering 200 for another student is a leak', () => {
    expect(judgeProbe(api, 200, true)).toMatch(/opened for the test student/);
  });
  it('a page answering 200 is a leak only when the other student\'s text is in it', () => {
    const page = { label: 'their paper page', path: '/app/marking/B', page: true, marker: 'Prelim 2025 Paper 2 Bukit' };
    expect(judgeProbe(page, 200, true, '<html>This page could not be found</html>')).toBeNull();
    expect(judgeProbe(page, 200, false, '<h1>Prelim 2025 Paper 2 Bukit</h1>')).toMatch(/signed-out visitor/);
  });
});

describe('leakTestLine', () => {
  it('says ok in one plain line', () => expect(leakTestLine([], 150, 20)).toMatch(/^Leak test: ok/));
  it('leads with the failure', () => expect(leakTestLine(['a', 'b'], 1, 1)).toMatch(/^🚨 Leak test FAILED \(2\): a; b/));
});
