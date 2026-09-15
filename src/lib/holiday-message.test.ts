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
