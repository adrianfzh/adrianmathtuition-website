import { describe, it, expect } from 'vitest';
import { lostTopics, parsePracticeKind, sciencePracticeHref, topicsForKind } from './science-practice';

describe('science practice — the pure rules (1 Oct 2026)', () => {
  it('lostTopics: live mistakes of that science only, most first, capped, matched to the bank names', () => {
    const rows = [
      { subject: 'Physics', topic: 'Kinematics', state: 'dark' },
      { subject: 'Physics', topic: 'kinematics', state: 'light' },
      { subject: 'Physics', topic: 'Moments', state: 'dark' },
      { subject: 'Physics', topic: 'Waves', state: 'fixed' },            // done with
      { subject: 'Chemistry', topic: 'Acids and bases', state: 'dark' },  // another science
      { subject: 'Physics', topic: 'Not in bank', state: 'dark' },
      { subject: 'Physics', topic: 'Electricity', state: 'dark' },
      { subject: 'Physics', topic: null, state: 'dark' },
    ];
    expect(lostTopics(rows, 'physics', ['Kinematics', 'Moments', 'Electricity', 'Waves'])).toEqual([
      { topic: 'Kinematics', lost: 2 }, { topic: 'Electricity', lost: 1 }, { topic: 'Moments', lost: 1 },
    ]);
    expect(lostTopics(rows, 'physics', ['Kinematics', 'Moments', 'Electricity'], 1)).toEqual([{ topic: 'Kinematics', lost: 2 }]);
    expect(lostTopics(rows, 'chemistry')).toEqual([{ topic: 'Acids and bases', lost: 1 }]);
    expect(lostTopics(rows, 'biology')).toEqual([]);
  });
  it('topicsForKind: MCQ needs lettered answers, structured needs the rest; no counts leak', () => {
    const counts = [{ topic: 'A', n: 10, mcq_count: 10 }, { topic: 'B', n: 5, mcq_count: 0 }, { topic: 'C', n: 8, mcq_count: 3 }];
    expect(topicsForKind(counts, 'mcq')).toEqual(['A', 'C']);
    expect(topicsForKind(counts, 'structured')).toEqual(['B', 'C']);
  });
  it('parsePracticeKind + the run href', () => {
    expect(parsePracticeKind('structured')).toBe('structured');
    expect(parsePracticeKind('anything')).toBe('mcq');
    expect(sciencePracticeHref('PHY', 'Current electricity', 'mcq')).toBe('/app/science/practice/run?level=PHY&topic=Current%20electricity&mode=mcq');
  });
});
