import { describe, it, expect } from 'vitest';
import {
  tutorPapersToRelease, capState, sgtMonthKey, weakTopics, hashPassword, verifyPassword,
  signTutorSession, verifyTutorSession, tutorRunStudentId, isTutorRunStudentId, tutorRunStudentName,
  cleanEmail, cleanName, tutorPaperState, newInviteToken, hashToken, MAX_TUTOR_IN_QUEUE, DAILY_TUTOR_RELEASES,
} from './tutor-portal';

const W = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

describe('tutorPapersToRelease — Adrian\'s students first', () => {
  it('sends nothing while any student paper waits', () => {
    expect(tutorPapersToRelease({ studentWaiting: 1, tutorInQueue: 0, releasedToday: 0, waiting: W(3) })).toEqual([]);
  });
  it('sends the oldest one when the queue is quiet', () => {
    expect(tutorPapersToRelease({ studentWaiting: 0, tutorInQueue: 0, releasedToday: 0, waiting: W(3) })).toEqual(['p0'].slice(0, MAX_TUTOR_IN_QUEUE));
  });
  it('one tutor paper in the queue at a time', () => {
    expect(tutorPapersToRelease({ studentWaiting: 0, tutorInQueue: MAX_TUTOR_IN_QUEUE, releasedToday: 0, waiting: W(3) })).toEqual([]);
  });
  it('stops at the daily ceiling', () => {
    expect(tutorPapersToRelease({ studentWaiting: 0, tutorInQueue: 0, releasedToday: DAILY_TUTOR_RELEASES, waiting: W(3) })).toEqual([]);
  });
  it('nothing waiting → nothing sent', () => {
    expect(tutorPapersToRelease({ studentWaiting: 0, tutorInQueue: 0, releasedToday: 0, waiting: [] })).toEqual([]);
  });
});

describe('the monthly cap', () => {
  it('counts what is left', () => {
    expect(capState(3, 20)).toEqual({ used: 3, cap: 20, left: 17, full: false });
    expect(capState(20, 20).full).toBe(true);
    expect(capState(25, 20)).toEqual({ used: 25, cap: 20, left: 0, full: true });
    expect(capState(0, 0).full).toBe(true);
  });
  it('the month is Singapore time', () => {
    // 31 Oct 2026 17:00 UTC = 1 Nov 01:00 SGT
    expect(sgtMonthKey(Date.UTC(2026, 9, 31, 17))).toBe('2026-11');
    expect(sgtMonthKey(Date.UTC(2026, 9, 31, 15))).toBe('2026-10');
  });
});

describe('names stay off the marking run', () => {
  it('student id carries no name', () => {
    const sid = tutorRunStudentId('0b6f5f7e-0000-4000-8000-000000000001');
    expect(sid).toBe('tutor:0b6f5f7e-0000-4000-8000-000000000001');
    expect(isTutorRunStudentId(sid)).toBe(true);
    expect(isTutorRunStudentId('acct:abc')).toBe(false);
    expect(isTutorRunStudentId('recABC')).toBe(false);
    expect(isTutorRunStudentId(null)).toBe(false);
  });
  it('student name is the tutor', () => {
    expect(tutorRunStudentName('Ms Tan')).toBe('Tutor: Ms Tan');
  });
});

describe('weak topics', () => {
  it('adds up lost marks per topic, biggest first', () => {
    expect(weakTopics([
      { topic: 'Logarithms', awarded: 1, max: 5 },
      { topic: 'Calculus', awarded: 0, max: 3 },
      { topic: 'Logarithms', awarded: 2, max: 4 },
      { topic: null, awarded: 0, max: 1 },
      { topic: 'Trig', awarded: 4, max: 4 },
    ])).toEqual([{ topic: 'Logarithms', lost: 6 }, { topic: 'Calculus', lost: 3 }, { topic: 'Other', lost: 1 }]);
  });
});

describe('passwords and sessions', () => {
  it('a password checks against its own hash only', () => {
    const h = hashPassword('correct horse battery');
    expect(verifyPassword('correct horse battery', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
    expect(verifyPassword('x', null)).toBe(false);
    expect(verifyPassword('x', 'garbage')).toBe(false);
  });
  const id = '0b6f5f7e-0000-4000-8000-000000000001';
  it('a session round-trips, and fails on another secret, expiry or tampering', () => {
    const now = Date.UTC(2026, 10, 5);
    const t = signTutorSession(id, 's1', now);
    expect(verifyTutorSession(t, 's1', now)).toBe(id);
    expect(verifyTutorSession(t, 's2', now)).toBeNull();
    expect(verifyTutorSession(t, 's1', now + 31 * 86_400_000)).toBeNull();
    expect(verifyTutorSession(t.replace(id, '0b6f5f7e-0000-4000-8000-000000000002'), 's1', now)).toBeNull();
    expect(verifyTutorSession(t, null, now)).toBeNull();
    expect(verifyTutorSession('a.b', 's1', now)).toBeNull();
  });
  it('an admin-shaped token is never a tutor session', () => {
    expect(verifyTutorSession(`${Date.now() + 1e6}.abc`, 's1')).toBeNull();
  });
  it('invite tokens are stored as a hash', () => {
    const { token, hash } = newInviteToken();
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
  });
});

describe('inputs and states', () => {
  it('cleans names and emails', () => {
    expect(cleanName('  Wei   Jie ')).toBe('Wei Jie');
    expect(cleanName('   ')).toBeNull();
    expect(cleanEmail(' Tutor@Example.com ')).toBe('tutor@example.com');
    expect(cleanEmail('nope')).toBeNull();
  });
  it('paper state words', () => {
    expect(tutorPaperState({ status: 'waiting', marked: false })).toBe('waiting');
    expect(tutorPaperState({ status: 'queued', marked: false })).toBe('marking');
    expect(tutorPaperState({ status: 'queued', marked: true })).toBe('marked');
    expect(tutorPaperState({ status: 'failed', marked: false })).toBe('failed');
  });
});
