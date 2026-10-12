import { describe, expect, it } from 'vitest';
import {
  checkTap, fixCount, lastNight, latestRequests, nightStart, openProposals, parseLedger, parsePlainLine,
  proposalRequestRow, requestWords, waitingWords, weekHistory, type RunRow,
} from './overnight';

const LEDGER = `
# Proposals

| slug | branch | date | gate | status |
|---|---|---|---|---|
| old-one | proposal/2026-10-01-old-one | 2026-10-01 | \`npm test\` | shipped 2026-10-02 |
| doc-sweep-1 | proposal/2026-10-11-doc-sweep-1 (website) | 2026-10-11 | \`npx tsc --noEmit && npm test\` | open |
| three-parts | proposal/2026-10-12-three-parts | 2026-10-12 | \`npm test\` | open |
| old-style | proposal/2026-10-08-old-style | 2026-10-08 | \`npm test\` | open |
| no-line | proposal/2026-10-09-no-line | 2026-10-09 | \`npm test\` | open |

### In plain words

- old-one — shipped long ago.
- doc-sweep-1 — "Fix the switches table" — Problem: the table says the oral page is shut. Fix: it says open.
- three-parts — "Notes start with the step" — Problem: a note says "The marks are for …". Solution: start with the step she needed. Fix: she reads what to do first.
- old-style — on a marked page, a fraction in a power is written small.
`;

describe('the ledger', () => {
  it('reads the table rows', () => {
    const rows = parseLedger(LEDGER);
    expect(rows.map((r) => r.slug)).toEqual(['old-one', 'doc-sweep-1', 'three-parts', 'old-style', 'no-line']);
    expect(rows[1].gate).toBe('npx tsc --noEmit && npm test');
  });

  it('lists open proposals, longest waiting first, with their parts', () => {
    const open = openProposals(LEDGER, '2026-10-12');
    expect(open.map((p) => p.slug)).toEqual(['old-style', 'no-line', 'doc-sweep-1', 'three-parts']);
    const three = open.find((p) => p.slug === 'three-parts')!;
    expect(three).toMatchObject({ title: 'Notes start with the step', days: 0, repo: 'bot', solution: 'start with the step she needed.' });
    expect(three.problem).toContain('The marks are for');
    expect(three.fix).toBe('she reads what to do first.');
    const two = open.find((p) => p.slug === 'doc-sweep-1')!;
    expect(two).toMatchObject({ repo: 'website', days: 1, solution: null, fix: 'it says open.' });
    const old = open.find((p) => p.slug === 'old-style')!;
    expect(old).toMatchObject({ title: 'Old style', problem: null, text: 'on a marked page, a fraction in a power is written small.' });
    const none = open.find((p) => p.slug === 'no-line')!;
    expect(none.text).toBeNull();
  });

  it('drops the APPROVED marker and reads a line without a name', () => {
    expect(parsePlainLine('"No paid re-read" — APPROVED — Problem: costs money. Fix: nothing is paid.'))
      .toMatchObject({ name: 'No paid re-read', problem: 'costs money.', fix: 'nothing is paid.' });
    expect(parsePlainLine('Problem: a. Fix: b.')).toMatchObject({ name: null, problem: 'a.', fix: 'b.' });
  });

  it('words the wait', () => {
    expect(waitingWords(0)).toBe('new today');
    expect(waitingWords(1)).toBe('waiting 1 day');
    expect(waitingWords(4)).toBe('waiting 4 days');
  });
});

describe('a tap from the page', () => {
  const open = ['three-parts', 'doc-sweep-1'];
  it('accepts ship and drop for an open proposal', () => {
    expect(checkTap({ slug: 'three-parts', action: 'ship' }, open)).toEqual({ ok: true, slug: 'three-parts', action: 'ship', note: null });
    expect(checkTap({ slug: 'Doc-Sweep-1', action: 'DROP', note: 'ignored' }, open)).toEqual({ ok: true, slug: 'doc-sweep-1', action: 'drop', note: null });
  });
  it('refuses a closed proposal, an unknown action, and a change with no note', () => {
    expect(checkTap({ slug: 'old-one', action: 'ship' }, open).ok).toBe(false);
    expect(checkTap({ slug: 'three-parts', action: 'merge' }, open).ok).toBe(false);
    expect(checkTap({ slug: 'three-parts', action: 'change', note: '  ' }, open).ok).toBe(false);
    expect(checkTap({ slug: '../etc', action: 'ship' }, ['../etc']).ok).toBe(false);
  });
  it('builds the same row the Telegram button writes, answered in his own chat', () => {
    const tap = checkTap({ slug: 'three-parts', action: 'change', note: 'say it shorter' }, open);
    if (!tap.ok) throw new Error('expected ok');
    expect(proposalRequestRow(tap, '1435385402\n')).toEqual({
      slug: 'three-parts', action: 'change', requested_by: 1435385402, chat_id: 1435385402,
      thread_id: null, message_id: null, note: 'say it shorter',
    });
    expect(proposalRequestRow({ slug: 'a-b', action: 'ship', note: null }, undefined).chat_id).toBeNull();
  });
  it('shows the newest request per proposal in plain words', () => {
    const latest = latestRequests([
      { slug: 'a-b', action: 'ship', status: 'failed', requested_at: '2026-10-10T00:00:00Z' },
      { slug: 'a-b', action: 'ship', status: 'running', requested_at: '2026-10-11T00:00:00Z' },
    ]);
    expect(latest['a-b'].status).toBe('running');
    expect(requestWords(latest['a-b'])).toMatch(/^⏳ Shipping/);
    expect(requestWords({ slug: 'a-b', action: 'drop', status: 'done', requested_at: '' })).toBe('✅ Dropped');
  });
});

describe('last night from the logbook', () => {
  // 12 Oct 2026, 11:00 SGT = 03:00Z
  const NOW = Date.parse('2026-10-12T03:00:00Z');

  it('starts at 6 pm Singapore time yesterday', () => {
    expect(nightStart(NOW).toISOString()).toBe('2026-10-11T10:00:00.000Z');
    // just after midnight SGT the night is still the one that began the evening before
    expect(nightStart(Date.parse('2026-10-11T16:30:00Z')).toISOString()).toBe('2026-10-11T10:00:00.000Z');
  });

  it('counts what each job fixed', () => {
    expect(fixCount('marking-fix', '2026-10-12: 2 of Adrian\'s own reports done, 5 classes fixed (6 pages)')).toBe(7);
    expect(fixCount('bot-review', 'shipped d345f08 — … also shipped 1a2b3c4')).toBe(2);
    expect(fixCount('bot-review', 'proposed paper-marked-question')).toBe(0);
    expect(fixCount('day-review', '14 rows, 1 label fixed (Physics→Math)')).toBe(1);
    expect(fixCount('day-review', '49 rows · labels fixed 7 · judged 49')).toBe(7);
    expect(fixCount('doc-sweep', '128 sure, 194 look · fixed 22 · proposed 2')).toBe(22);
    expect(fixCount('extraction-learn', 'read 398 papers; applied 1, proposed 0')).toBe(1);
    expect(fixCount('nightly-builder', 'nothing approved to build')).toBe(0);
    expect(fixCount('marking-review', '~103 findings')).toBe(0);
  });

  const rows: RunRow[] = [
    { job: 'marking-fix', ran_at: '2026-10-11T23:56:00Z', ok: true, summary: '5 classes fixed' },
    { job: 'marking-fix', ran_at: '2026-10-11T00:32:00Z', ok: true, summary: '3 classes fixed' },   // the night before
    { job: 'bot-review', ran_at: '2026-10-11T22:02:00Z', ok: true, summary: 'shipped d345f08' },
    { job: 'day-review', ran_at: '2026-10-11T21:02:00Z', ok: true, summary: '1 label fixed' },
    { job: 'day-review', ran_at: '2026-10-11T21:03:00Z', ok: false, summary: '1 label fixed, Fly log unreadable' },   // the same night, a second writer
    { job: 'twin-batch', ran_at: '2026-10-11T18:00:00Z', ok: true, summary: 'x', meta: { published: 2, looked: 3 } },
    { job: 'twin-batch', ran_at: '2026-10-11T19:00:00Z', ok: true, summary: 'x', meta: { published: 1, looked: 2 } },
    { job: 'health-check', ran_at: '2026-10-11T22:00:00Z', ok: true, summary: 'not a night job' },
  ];

  it('gives one line per night job and adds up the fixes', () => {
    const n = lastNight(rows, NOW);
    expect(n.fixed).toBe(7);   // 5 + 1 + the day-review's ONE label, not two
    const by = Object.fromEntries(n.lines.map((l) => [l.job, l]));
    expect(by['marking-fix']).toMatchObject({ ok: true, summary: '5 classes fixed', runs: 1, fixed: 5 });
    expect(by['day-review']).toMatchObject({ ok: false, runs: 2, fixed: 1 });
    expect(by['twin-batch'].summary).toBe('3 written and checked (of 5 tried) in 2 runs');
    expect(by['doc-sweep']).toMatchObject({ at: null, ok: null, runs: 0 });
    expect(n.lines.some((l) => l.job === 'health-check')).toBe(false);
  });

  it('keeps seven Singapore days per job, newest first', () => {
    const h = weekHistory(rows, NOW);
    const mf = h.find((j) => j.job === 'marking-fix')!;
    expect(mf.days).toHaveLength(7);
    expect(mf.days[0]).toMatchObject({ date: '2026-10-12', runs: 1, fixed: 5 });
    expect(mf.days[1]).toMatchObject({ date: '2026-10-11', runs: 1, fixed: 3 });
    expect(mf.days[2]).toMatchObject({ runs: 0, summary: null });
  });
});
