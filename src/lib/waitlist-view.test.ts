import { describe, expect, it } from 'vitest';
import { countdownLine, joinedLine, offerEnded, placeLine } from './waitlist-view';

const NOW = Date.parse('2026-10-13T21:50:00+08:00');
const MIN = 60000;

describe('countdownLine', () => {
  it('reads hours and minutes, then the end time', () => {
    expect(countdownLine(NOW + (11 * 60 + 40) * MIN, NOW, '9:30pm Wed 14 Oct')).toBe('11 h 40 min left — until 9:30pm Wed 14 Oct');
  });
  it('drops "0 min" on the hour, and hours under one', () => {
    expect(countdownLine(NOW + 120 * MIN, NOW, null)).toBe('2 h left');
    expect(countdownLine(NOW + 45 * MIN, NOW, null)).toBe('45 min left');
  });
  it('never shows less than 1 min while the offer is open', () => {
    expect(countdownLine(NOW + 10_000, NOW, null)).toBe('1 min left');
    expect(countdownLine(NOW - MIN, NOW, null)).toBe('1 min left');
  });
});

describe('offerEnded', () => {
  it('is false before the end and true at or after it, or with no end', () => {
    expect(offerEnded(new Date(NOW + MIN).toISOString(), NOW)).toBe(false);
    expect(offerEnded(new Date(NOW).toISOString(), NOW)).toBe(true);
    expect(offerEnded(null, NOW)).toBe(true);
  });
});

describe('words', () => {
  it('places and joins never name the tutor', () => {
    expect(placeLine(2)).toBe("You're #2 in line.");
    expect(joinedLine(1, false)).toBe("You're #1 on the waiting list.");
    expect(joinedLine(3, true)).toBe("You're already #3 on the waiting list.");
  });
});
