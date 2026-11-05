import { describe, expect, it } from 'vitest';
import { formatDays, formatTime, isQuiet, lastSentForNewTime, readReminder, TIME_OPTIONS } from './study-settings';

describe('study settings (practice reminder on /app/settings)', () => {
  it('offers only times outside quiet hours, 7 am to 10 pm', () => {
    expect(TIME_OPTIONS[0]).toBe('07:00');
    expect(TIME_OPTIONS[TIME_OPTIONS.length - 1]).toBe('22:00');
    expect(TIME_OPTIONS.some(isQuiet)).toBe(false);
  });
  it('refuses quiet hours and no days, like the bot', () => {
    expect(readReminder({ enabled: true, time: '23:00', days: [1] })).toHaveProperty('error');
    expect(readReminder({ enabled: true, time: '06:30', days: [1] })).toHaveProperty('error');
    expect(readReminder({ enabled: true, time: '20:00', days: [] })).toHaveProperty('error');
    expect(readReminder({ enabled: true, time: '20:00', days: [5, 1, 1, 9] })).toEqual({ ok: { enabled: true, time: '20:00', days: [1, 5] } });
    expect(readReminder({ enabled: false, time: '20:00', days: [] })).toEqual({ ok: { enabled: false, time: '20:00', days: [0, 1, 2, 3, 4, 5, 6] } });
  });
  it('reads like the bot', () => {
    expect(formatTime('19:30')).toBe('7:30 pm');
    expect(formatDays([1, 2, 3, 4, 5])).toBe('Monday–Friday');
    expect(formatDays([4, 1])).toBe('Mon, Thu');
  });
  it('a time already past today starts tomorrow', () => {
    const at2002 = Date.parse('2026-11-05T12:02:00Z'); // 20:02 SGT
    expect(lastSentForNewTime('20:00', at2002)).toBe('2026-11-05');
    expect(lastSentForNewTime('21:00', at2002)).toBeNull();
  });
});
