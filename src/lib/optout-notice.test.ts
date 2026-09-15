import { describe, it, expect } from 'vitest';
import {
  escapeHtml, shortMonth, money, joinList, levelTag,
  shouldSendRollup, pressNotice, rollupMessage,
} from './optout-notice';

const after = (rows: { label: string; lessonCount: number; skipped?: boolean; partial?: boolean }[]) =>
  rows.map((r) => ({ skipped: false, partial: false, ...r }));

describe('shouldSendRollup', () => {
  // Singapore dates, not UTC ones: the cron fires at 23:30 UTC, which is
  // already 07:30 on the NEXT day in Singapore.
  it('fires on 1 Nov, 1 Dec and 1 Jan SGT', () => {
    expect(shouldSendRollup(new Date('2026-10-31T23:30:00Z'))).toBe(true);  // 1 Nov SGT
    expect(shouldSendRollup(new Date('2026-11-30T23:30:00Z'))).toBe(true);  // 1 Dec SGT
    expect(shouldSendRollup(new Date('2026-12-31T23:30:00Z'))).toBe(true);  // 1 Jan SGT
  });
  it('stays quiet on every other morning', () => {
    expect(shouldSendRollup(new Date('2026-11-01T23:30:00Z'))).toBe(false); // 2 Nov SGT
    expect(shouldSendRollup(new Date('2026-09-30T23:30:00Z'))).toBe(false); // 1 Oct SGT — October is billed in advance
    expect(shouldSendRollup(new Date('2027-01-31T23:30:00Z'))).toBe(false); // 1 Feb SGT
  });
  it('does not fire on the UTC 1st that is still the 31st in Singapore', () => {
    // 1 Nov 00:30 UTC is 08:30 SGT on 1 Nov — that IS the day. But 1 Nov
    // 16:00 UTC is already 2 Nov in Singapore.
    expect(shouldSendRollup(new Date('2026-11-01T00:30:00Z'))).toBe(true);
    expect(shouldSendRollup(new Date('2026-11-01T16:30:00Z'))).toBe(false);
  });
});

describe('the small pieces', () => {
  it('escapes a name before it goes into HTML', () => {
    expect(escapeHtml('Tan <b>&</b>')).toBe('Tan &lt;b&gt;&amp;&lt;/b&gt;');
  });
  it('shortens a stored month label', () => {
    expect(shortMonth('November 2026')).toBe('Nov');
    expect(shortMonth('Dec')).toBe('Dec');
  });
  it('states money only when the rate is known', () => {
    expect(money(9, 70)).toBe('$630');
    expect(money(4, 87.5)).toBe('$350');
    expect(money(3, 72.5)).toBe('$217.50');
    expect(money(4, null)).toBeNull();
    expect(money(4, undefined)).toBeNull();
    expect(money(0, 70)).toBeNull();
  });
  it('joins a list the way a sentence would', () => {
    expect(joinList(['Nov'])).toBe('Nov');
    expect(joinList(['Nov', 'Dec'])).toBe('Nov and Dec');
    expect(joinList(['Nov', 'Dec', 'Jan'])).toBe('Nov, Dec and Jan');
  });
  it('marks IP only on Sec 4 and Sec 5', () => {
    expect(levelTag('Sec 4', true)).toBe('Sec 4 IP');
    expect(levelTag('Sec 2', true)).toBe('Sec 2');
    expect(levelTag('', true)).toBe('');
  });
});

describe('pressNotice', () => {
  it('says what is off, what it costs, and that nothing is waiting on Adrian', () => {
    const t = pressNotice({
      name: 'Jeanette Tan',
      level: 'Sec 2',
      nowSkipping: ['December 2026'],
      after: after([
        { label: 'November 2026', lessonCount: 4 },
        { label: 'December 2026', lessonCount: 4, skipped: true },
      ]),
      ratePerLesson: 70,
    });
    expect(t).toContain('<b>Jeanette Tan</b> (Sec 2) — skipping December');
    expect(t).toContain('Off: December (4 lessons) — $280 not billed');
    expect(t).toContain('Still on: November (4 lessons)');
    expect(t).toContain("December's invoice will come out at $0");
    expect(t).toContain('calendar is already updated');
  });

  // The rule that outranks every wording preference here: nothing in this
  // system knows a student's pronouns, and a name is not evidence of them.
  it('never reaches for a pronoun', () => {
    const t = pressNotice({
      name: 'Beryl Chen Guoer',
      level: 'Sec 4',
      ip: true,
      nowSkipping: ['November 2026', 'December 2026'],
      after: after([
        { label: 'November 2026', lessonCount: 5, skipped: true },
        { label: 'December 2026', lessonCount: 4, skipped: true },
      ]),
      ratePerLesson: 70,
    });
    expect(/\b(her|hers|his|him|she|he|they|them|their)\b/i.test(t)).toBe(false);
    expect(t).toContain('(Sec 4 IP)');
    expect(t).toContain('Off: November (5 lessons) · December (4 lessons) — $630 not billed');
    expect(t).toContain('November and December invoices will come out at $0');
  });

  it('drops the money when the rate is unknown rather than printing $0', () => {
    const t = pressNotice({
      name: 'A Student',
      nowSkipping: ['December 2026'],
      after: after([{ label: 'December 2026', lessonCount: 4, skipped: true }]),
    });
    expect(t).toContain('Off: December (4 lessons)');
    expect(t).not.toContain('not billed');
    // The only dollar sign left is the one in "$0" — never an invented total.
    expect(t.replace('$0', '')).not.toContain('$');
  });

  it('reports a month switched back on', () => {
    const t = pressNotice({
      name: 'Jeanette Tan',
      nowKeeping: ['December 2026'],
      after: after([{ label: 'December 2026', lessonCount: 4 }]),
      ratePerLesson: 70,
    });
    expect(t).toContain('December back on');
    expect(t).toContain('No months are being skipped now');
  });

  it("calls out a month Adrian had part-skipped by hand instead of claiming it is $0", () => {
    const t = pressNotice({
      name: 'Kayla',
      nowSkipping: ['November 2026'],
      after: after([{ label: 'November 2026', lessonCount: 4, partial: true }]),
      ratePerLesson: 70,
    });
    expect(t).toContain('Part-skipped: November');
    expect(t).not.toContain('will come out at $0');
  });

  it('names the dates that were left alone', () => {
    const t = pressNotice({
      name: 'Kayla',
      nowSkipping: ['November 2026'],
      after: after([{ label: 'November 2026', lessonCount: 3, skipped: true }]),
      leftAlone: ['2026-11-01 (Completed)'],
    });
    expect(t).toContain('⚠ Left alone: 2026-11-01 (Completed)');
  });

  it('carries the roster of everyone skipping so far', () => {
    const t = pressNotice({
      name: 'Jeanette Tan',
      nowSkipping: ['December 2026'],
      after: after([{ label: 'December 2026', lessonCount: 4, skipped: true }]),
      roster: [
        { name: 'Beryl Chen Guoer', months: ['Nov', 'Dec'] },
        { name: 'Jeanette Tan', months: ['Dec'] },
      ],
    });
    expect(t).toContain('Skipping so far: Beryl Chen Guoer (Nov, Dec) · Jeanette Tan (Dec)');
  });

  it('escapes a name with an ampersand in it', () => {
    const t = pressNotice({
      name: 'Tan & Co',
      nowSkipping: ['December 2026'],
      after: after([{ label: 'December 2026', lessonCount: 1, skipped: true }]),
    });
    expect(t).toContain('<b>Tan &amp; Co</b>');
  });
});

describe('rollupMessage', () => {
  const students = [
    { name: 'Beryl Chen Guoer', level: 'Sec 4', ip: true, ratePerLesson: 70,
      months: [{ label: 'November 2026', lessons: 5 }, { label: 'December 2026', lessons: 4 }] },
    { name: 'Jeanette Tan', level: 'Sec 2', ratePerLesson: 70,
      months: [{ label: 'December 2026', lessons: 4 }] },
  ];

  it('reads like the message Adrian approved', () => {
    const t = rollupMessage(students, {
      offered: 29,
      window: ['November 2026', 'December 2026'],
      now: new Date('2026-10-31T23:30:00Z'),
    });
    expect(t).toContain('🗓 <b>Holiday opt-outs</b> — 1 November');
    expect(t).toContain('2 of the 29 families with the button have chosen months off.');
    expect(t).toContain('• <b>Beryl Chen Guoer</b> (Sec 4 IP) — Nov, Dec · 9 lessons · $630');
    expect(t).toContain('• <b>Jeanette Tan</b> (Sec 2) — Dec · 4 lessons · $280');
    expect(t).toContain('November: 1 skipping, 28 on as usual');
    expect(t).toContain('December: 2 skipping, 27 on as usual');
  });

  // A message that arrives every month saying nothing is a message that stops
  // being read. The job_runs stamp is what proves the job ran.
  it('sends nothing when nobody has opted out', () => {
    expect(rollupMessage([])).toBe('');
    expect(rollupMessage([{ name: 'X', months: [{ label: 'November 2026', lessons: 0 }] }])).toBe('');
  });

  it('manages without a denominator', () => {
    const t = rollupMessage(students.slice(1), { window: ['December 2026'] });
    expect(t).toContain('1 family has chosen months off.');
    expect(t).toContain('December: 1 skipping');
    expect(t).not.toContain('on as usual');
  });

  it('omits money for a student whose rate we could not read', () => {
    const t = rollupMessage([{ name: 'X', level: 'Sec 1', months: [{ label: 'December 2026', lessons: 4 }] }]);
    expect(t).toContain('• <b>X</b> (Sec 1) — Dec · 4 lessons');
    expect(t).not.toContain('$');
  });
});
