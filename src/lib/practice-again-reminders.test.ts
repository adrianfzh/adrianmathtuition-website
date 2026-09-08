import { describe, it, expect } from 'vitest';
import { nudgeDue, pickDue, nudgeText, nudgePush, nudgeSummaryLine, MAX_NUDGES, type RequiredSheetRow } from './practice-again-reminders';

const NOW = new Date('2026-09-15T01:00:00Z'); // Tue 09:00 SGT
const base: RequiredSheetRow = {
  id: 'a1', airtable_student_id: 'recKass', title: 'Practice Again — A Math · GCE 2021 · Paper 1',
  source_run_id: '94da9689-ac42-457a-a696-e6cbfb49e67e', status: 'assigned',
  required_at: '2026-09-08T04:00:00Z', reminded_at: null, reminder_count: 0,
};
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000).toISOString();

describe('nudgeDue — day 3, then weekly, four at most, only while still to do', () => {
  it('is quiet for the first three days', () => {
    expect(nudgeDue({ ...base, required_at: daysAgo(2.9) }, NOW)).toBe(false);
    expect(nudgeDue({ ...base, required_at: daysAgo(3) }, NOW)).toBe(true);
  });
  it('waits a week between nudges', () => {
    expect(nudgeDue({ ...base, reminded_at: daysAgo(6), reminder_count: 1 }, NOW)).toBe(false);
    expect(nudgeDue({ ...base, reminded_at: daysAgo(7), reminder_count: 1 }, NOW)).toBe(true);
  });
  it('stops after MAX_NUDGES', () => {
    expect(nudgeDue({ ...base, reminded_at: daysAgo(30), reminder_count: MAX_NUDGES }, NOW)).toBe(false);
  });
  it('never nags a handed-in, marked, held or revoked sheet, nor one the student asked for (no required_at)', () => {
    for (const status of ['submitted', 'marked', 'held', 'revoked']) expect(nudgeDue({ ...base, status }, NOW)).toBe(false);
    expect(nudgeDue({ ...base, required_at: null }, NOW)).toBe(false);
  });
});

describe('pickDue — oldest obligation first, capped', () => {
  it('orders by required_at and applies the cap', () => {
    const rows = [
      { ...base, id: 'new', required_at: daysAgo(4) },
      { ...base, id: 'old', required_at: daysAgo(20) },
      { ...base, id: 'fresh', required_at: daysAgo(1) },
      { ...base, id: 'mid', required_at: daysAgo(9) },
    ];
    expect(pickDue(rows, NOW, 2).map(r => r.id)).toEqual(['old', 'mid']);
    expect(pickDue(rows, NOW).map(r => r.id)).toEqual(['old', 'mid', 'new']);
  });
});

describe('the wording', () => {
  it('names the sheet, says Adrian asked, counts the days, links to the paper in the app', () => {
    const t = nudgeText({ ...base, required_at: daysAgo(5) }, NOW, 'https://www.adrianmathtuition.com');
    expect(t).toContain('<b>Practice Again — A Math · GCE 2021 · Paper 1</b>');
    expect(t).toContain('Adrian asked you to do this one — it has been 5 days');
    expect(t).toContain('https://www.adrianmathtuition.com/app/marking/94da9689-ac42-457a-a696-e6cbfb49e67e');
    expect(t).not.toContain('portal');
  });
  it('the push lands on the same page', () => {
    expect(nudgePush(base).url).toBe('/app/marking/94da9689-ac42-457a-a696-e6cbfb49e67e');
    expect(nudgePush({ ...base, source_run_id: null }).url).toBe('/app/marking');
  });
  it("Adrian's summary is one line, null when quiet, and flags a student with no channel", () => {
    expect(nudgeSummaryLine([])).toBeNull();
    const line = nudgeSummaryLine([
      { who: 'Kassandra', title: base.title, nth: 1, channel: 'both' },
      { who: 'Denise', title: 'Practice Again — E Math · Prelim', nth: 2, channel: 'none' },
    ]);
    expect(line).toBe('📘 Practice Again reminders sent: Kassandra (A Math · GCE 2021 · Paper 1, nudge 1) · Denise (E Math · Prelim, nudge 2, NO CHANNEL)');
  });
});
