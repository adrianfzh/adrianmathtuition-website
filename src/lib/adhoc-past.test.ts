import { describe, it, expect } from 'vitest';
import { adhocIsPast, splitAdhoc } from './adhoc-past';

const TODAY = '2026-10-08';

describe('adhocIsPast — a session whose dates have all gone', () => {
  it('every date before today → past; today still counts as upcoming', () => {
    expect(adhocIsPast(['2026-08-19', '2026-08-20'], TODAY)).toBe(true);
    expect(adhocIsPast(['2026-10-08'], TODAY)).toBe(false);
    expect(adhocIsPast(['2026-08-19', '2026-10-16'], TODAY)).toBe(false);
  });
  it('an undated slot is never past — it shows every week until removed', () => {
    expect(adhocIsPast([], TODAY)).toBe(false);
  });
});

describe('splitAdhoc — what the panel shows, and what sits behind "Show past"', () => {
  const s = (id: string, ...dates: string[]) => ({ id, dates });
  it('upcoming soonest first with undated on top; past most recent first', () => {
    const { upcoming, past } = splitAdhoc([s('aug19', '2026-08-19'), s('oct23', '2026-10-23'), s('undated'), s('aug20', '2026-08-20'), s('oct16', '2026-08-01', '2026-10-16')], TODAY);
    expect(upcoming.map(x => x.id)).toEqual(['undated', 'oct16', 'oct23']);
    expect(past.map(x => x.id)).toEqual(['aug20', 'aug19']);
  });
  it('nothing past, nothing hidden', () => {
    expect(splitAdhoc([s('a', '2026-10-09')], TODAY).past).toEqual([]);
    expect(splitAdhoc([], TODAY)).toEqual({ upcoming: [], past: [] });
  });
});
