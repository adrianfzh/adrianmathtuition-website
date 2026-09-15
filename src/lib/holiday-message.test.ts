import { describe, it, expect } from 'vitest';
import { stepUpParagraph, takesAMath, wantsHolidayNote, withName, holidayNoteHtml, invoiceMonthNumber } from './holiday-message';

describe('stepUpParagraph — who gets the ⬇ bullet', () => {
  it('Sec 2 gets the A-Math-next-year version', () => {
    const out = stepUpParagraph({ level: 'Sec 2', subjects: ['Math'] });
    expect(out).toContain('two maths subjects instead of one');
  });

  it('Sec 2 IP gets it too — Zane Ngo is filed IP but is still going into Sec 3', () => {
    expect(stepUpParagraph({ level: 'Sec 2', subjects: ['Math'] })).toBeTruthy();
  });

  it('Sec 3 taking A Math + E Math gets the O-Level-year version', () => {
    const out = stepUpParagraph({ level: 'Sec 3', subjects: ['E Math', 'A Math'] });
    expect(out).toContain('Sec 4 is the O-Level year');
  });

  it('Sec 3 taking E Math only gets NOTHING — Adrian, 15 Sep 2026', () => {
    expect(stepUpParagraph({ level: 'Sec 3', subjects: ['E Math'] })).toBeNull();
  });

  it("Sec 3 filed as plain 'Math' gets nothing — Bhanu Naga Shreyas must not be told the work doubles", () => {
    expect(stepUpParagraph({ level: 'Sec 3', subjects: ['Math'] })).toBeNull();
  });

  it('Sec 1 gets NOTHING — Adrian, 15 Sep 2026', () => {
    expect(stepUpParagraph({ level: 'Sec 1', subjects: ['Math'] })).toBeNull();
  });

  it('JC1 gets the JC2-pace version', () => {
    expect(stepUpParagraph({ level: 'JC1', subjects: ['H2 Math'] })).toContain('pace in JC2');
  });

  it('exam years and unknown levels get nothing — they have their own note', () => {
    for (const level of ['Sec 4', 'Sec 5', 'JC2', '', null, 'Primary 6']) {
      expect(stepUpParagraph({ level, subjects: ['E Math', 'A Math'] })).toBeNull();
    }
  });

  it('missing subjects never crashes and never invents A Math', () => {
    expect(stepUpParagraph({ level: 'Sec 3' })).toBeNull();
    expect(stepUpParagraph({ level: 'Sec 3', subjects: null })).toBeNull();
  });
});

describe('takesAMath', () => {
  it('needs A Math listed literally', () => {
    expect(takesAMath({ subjects: ['E Math', 'A Math'] })).toBe(true);
    expect(takesAMath({ subjects: [' A Math '] })).toBe(true);
    expect(takesAMath({ subjects: ['E Math'] })).toBe(false);
    expect(takesAMath({ subjects: ['Math'] })).toBe(false);
    expect(takesAMath({ subjects: ['IP Math'] })).toBe(false);
  });
});

describe('wantsHolidayNote', () => {
  it('is Oct/Nov/Dec only', () => {
    expect(wantsHolidayNote({ level: 'Sec 2' }, 10)).toBe(true);
    expect(wantsHolidayNote({ level: 'Sec 2' }, 12)).toBe(true);
    expect(wantsHolidayNote({ level: 'Sec 2' }, 9)).toBe(false);
    expect(wantsHolidayNote({ level: 'Sec 2' }, 1)).toBe(false);
  });

  it('never goes to an exam year', () => {
    for (const level of ['Sec 4', 'Sec 5', 'JC2']) expect(wantsHolidayNote({ level }, 10)).toBe(false);
  });

  it('DOES go to Sec 1 and E-Math-only Sec 3 — they get the note, just not the bullet', () => {
    expect(wantsHolidayNote({ level: 'Sec 1' }, 10)).toBe(true);
    expect(wantsHolidayNote({ level: 'Sec 3', subjects: ['E Math'] }, 10)).toBe(true);
  });
});

describe('withName', () => {
  it('uses the first name', () => {
    expect(withName('[Student] is away', 'Lucas Chiam Yee Yang')).toBe('Lucas is away');
  });
  it('falls back rather than printing a blank', () => {
    expect(withName('[Student] is away', '')).toBe('your child is away');
  });
});

describe('holidayNoteHtml', () => {
  it('is empty outside the holiday window', () => {
    expect(holidayNoteHtml({ level: 'Sec 2' }, 9, 'Kieran Lai')).toBe('');
  });

  it('renders four bullets for a student who gets the ⬇ one', () => {
    const html = holidayNoteHtml({ level: 'JC1', subjects: ['H2 Math'] }, 10, 'Ryder Heng');
    expect(html.match(/<li/g)?.length).toBe(4);
    expect(html).toContain('Next year is a step up.');
    expect(html).toContain('Ryder');
    expect(html).not.toContain('[Student]');
  });

  it('renders THREE bullets for an E-Math-only Sec 3 — the ⬇ one is absent, not blank', () => {
    const html = holidayNoteHtml({ level: 'Sec 3', subjects: ['E Math'] }, 11, 'Merseus Quek');
    expect(html.match(/<li/g)?.length).toBe(3);
    expect(html).not.toContain('Next year is a step up');
    expect(html).toContain('Merseus');
  });

  it('renders three bullets for Sec 1', () => {
    const html = holidayNoteHtml({ level: 'Sec 1', subjects: ['Math'] }, 12, 'Adela Tan Jing Qi');
    expect(html.match(/<li/g)?.length).toBe(3);
    expect(html).not.toContain('Next year is a step up');
  });

  it('names both away windows', () => {
    const html = holidayNoteHtml({ level: 'Sec 2' }, 10, 'Alven Seah');
    expect(html).toContain('Wed 28 October – Sun 1 November');
    expect(html).toContain('Sat 5 December – Sat 12 December');
  });

  it('escapes a name that carries markup', () => {
    const html = holidayNoteHtml({ level: 'Sec 2' }, 10, '<script>x</script>');
    expect(html).not.toContain('<script>');
  });
});

describe('invoiceMonthNumber', () => {
  it('reads the stored month', () => {
    expect(invoiceMonthNumber('October 2026')).toBe(10);
    expect(invoiceMonthNumber('december 2026')).toBe(12);
  });
  it('takes the FIRST month of a combined invoice, and is 0 when unreadable', () => {
    expect(invoiceMonthNumber('December–January 2027')).toBe(12);
    expect(invoiceMonthNumber('')).toBe(0);
    expect(invoiceMonthNumber(null)).toBe(0);
    expect(invoiceMonthNumber('Octobre 2026')).toBe(0);
  });
  it('0 means no holiday note rather than a wrong one', () => {
    expect(wantsHolidayNote({ level: 'Sec 2' }, invoiceMonthNumber('nonsense'))).toBe(false);
  });
});

describe('the opt-out button (Adrian, 15 Sep 2026: "build the opt-out button")', () => {
  const sec2 = { level: 'Sec 2', subjects: ['Math'] };
  const URL = 'https://www.adrianmathtuition.com/holiday-optout?t=recABC12345678901.abc.sig';

  it('renders the button when a link was minted', () => {
    const html = holidayNoteHtml(sec2, 10, 'Alven', URL);
    expect(html).toContain('Choose which months to skip');
    expect(html).toContain(`href="${URL.replace(/&/g, '&amp;')}"`);
  });

  it('says nothing changes until Confirm — the page, not the link, is the action', () => {
    expect(holidayNoteHtml(sec2, 10, 'Alven', URL)).toContain('Nothing changes until you press Confirm');
  });

  it('leaves the button out entirely when no link could be signed, and still offers the reply route', () => {
    const html = holidayNoteHtml(sec2, 10, 'Alven', null);
    expect(html).not.toContain('Choose which months to skip');
    expect(html).toContain('reply to this email');
  });

  it('is omitted the same way when the argument is simply absent', () => {
    expect(holidayNoteHtml(sec2, 10, 'Alven')).not.toContain('<a href');
  });

  it('escapes the URL — it is interpolated into an href', () => {
    const html = holidayNoteHtml(sec2, 10, 'Alven', 'https://x.test/?t=a"onmouseover="alert(1)');
    expect(html).not.toContain('onmouseover="alert');
    expect(html).toContain('&quot;');
  });

  it('gives no button to a student who gets no holiday note at all', () => {
    expect(holidayNoteHtml({ level: 'Sec 4', subjects: ['E Math'] }, 10, 'Kayla', URL)).toBe('');
  });
});

describe('tone — Adrian, 15 Sep 2026: "not pushy - just word of advice"', () => {
  const sec2 = { level: 'Sec 2', subjects: ['Math'] };

  // My first pass replaced Adrian's own heading with a flatter one and added a
  // reassurance paragraph after the bullets. He reversed both on the same day:
  // 'keep "that said..."' / 'remove "either way is completely fine.."'. The
  // recommendation is his to make, in his own words — these two tests exist to
  // stop a later tone pass from softening it back out.
  it("keeps Adrian's own heading over the reasons", () => {
    const html = holidayNoteHtml(sec2, 10, 'Alven');
    expect(html).toContain('That said, I would encourage students to keep attending regular lessons if they can.');
    expect(html).not.toContain('A word of advice');
  });

  it('carries no reassurance paragraph after the bullets', () => {
    const html = holidayNoteHtml(sec2, 10, 'Alven');
    expect(html).not.toContain('Either way is completely fine');
    expect(html).not.toContain('makes no difference to how');
    // The opt-out still stands on its own at both ends of the block, which is
    // what stops the reasons reading as something to be talked out of.
    expect(html).toContain('they are optional over these two months');
    expect(html).toContain('Anything you do not tell me about stays as it is.');
  });

  it('claims no superlatives and promises no outcome', () => {
    const html = holidayNoteHtml(sec2, 10, 'Alven');
    expect(html).not.toContain('the best time');
    expect(html).not.toContain('far easier');
    expect(html).toContain('a good time to learn ahead');
    expect(html).toContain('tend to come back ahead');
  });

  it('softens the step-up bullet to "can make a real difference"', () => {
    expect(stepUpParagraph(sec2)).toContain('can make a real difference');
  });

  it("fixes Adrian's dangling clause on the Sec 3 bullet", () => {
    const p = stepUpParagraph({ level: 'Sec 3', subjects: ['E Math', 'A Math'] });
    expect(p).toContain('so that next year is a good deal easier');
    expect(p).not.toContain('easier on next year');
  });
});

describe('the October block tells parents how November and December are billed (15 Sep 2026)', () => {
  const sec3 = { level: 'Sec 3', subjects: ['E Math', 'A Math'] };
  it('October: exam-prep reminder, then the billing-after-the-month paragraph', () => {
    const html = holidayNoteHtml(sec3, 10, 'Gavin Ng', null);
    expect(html).toContain('Exams coming up?');
    expect(html).toContain('How November and December are billed.');
    expect(html).toContain('billed in advance like any other month');
    expect(html).toContain('by 13 October for November');
    expect(html).toContain('like Gavin to skip a month');
    expect(html.indexOf('Exams coming up?')).toBeLessThan(html.indexOf('Lessons carry on as usual'));
  });
  it('a later month carries neither — the invoice itself explains what it is for', () => {
    const html = holidayNoteHtml(sec3, 11, 'Gavin Ng', null);
    expect(html).not.toContain('Exams coming up?');
    expect(html).not.toContain('How November and December are billed');
  });
});
