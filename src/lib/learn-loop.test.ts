import { describe, it, expect } from 'vitest';
import { loopProgress, currentType, showClipFirst, loopLevelFor, loopTopic, readLoopMeta, type LoopAttempt } from './learn-loop';

const TYPES = [
  { id: 605, name: 'General term', order: 2 },
  { id: 604, name: 'First few terms', order: 1 },
  { id: 610, name: 'Harder mixed', order: null },
];
const att = (qid: string, sg: number, verdict: string, topic = 'am-binomial'): LoopAttempt =>
  ({ question_id: qid, marking_verdict: verdict, marking_json: { loop: { topic, subgroupId: sg } } });

describe('loopProgress — where a student stands, from their own loop answers', () => {
  it('orders the types the way they are taught, unordered ones last', () => {
    expect(loopProgress('am-binomial', TYPES, []).map(p => p.id)).toEqual([604, 605, 610]);
  });
  it('clears a type on one full-marks answer, after any number of misses ("until okay")', () => {
    const p = loopProgress('am-binomial', TYPES, [att('q1', 604, 'wrong'), att('q2', 604, 'partial'), att('q3', 604, 'correct')]);
    expect(p[0]).toMatchObject({ id: 604, tries: 3, misses: 2, done: true, seen: ['q1', 'q2', 'q3'] });
    expect(currentType(p)?.id).toBe(605);
  });
  it('a partial answer is not okay — the type stays open', () => {
    const p = loopProgress('am-binomial', TYPES, [att('q1', 604, 'partial')]);
    expect(currentType(p)?.id).toBe(604);
  });
  it('ignores answers from another topic and from outside the loop', () => {
    const p = loopProgress('am-binomial', TYPES, [
      att('q1', 604, 'correct', 'em-other'),
      { question_id: 'q2', marking_verdict: 'correct', marking_json: { source: 'photo' } },
    ]);
    expect(p[0]).toMatchObject({ tries: 0, done: false });
  });
  it('the topic is finished when every type is done', () => {
    const p = loopProgress('am-binomial', TYPES, [att('a', 604, 'correct'), att('b', 605, 'correct'), att('c', 610, 'correct')]);
    expect(currentType(p)).toBeNull();
  });
  it('shows the clip first only before anything is answered', () => {
    expect(showClipFirst(loopProgress('am-binomial', TYPES, []))).toBe(true);
    expect(showClipFirst(loopProgress('am-binomial', TYPES, [att('q1', 604, 'wrong')]))).toBe(false);
  });
});

describe('the loop topic and level', () => {
  it('a Sec 3 practises from the Sec 3 bank, a Sec 4 from the Sec 4 bank, others not at all', () => {
    const t = loopTopic('am-binomial')!;
    expect(loopLevelFor(t, ['S3_EM', 'S3_AM', 'EM', 'AM'])).toBe('S3_AM');
    expect(loopLevelFor(t, ['EM', 'AM'])).toBe('AM');
    expect(loopLevelFor(t, ['JC2'])).toBeNull();
  });
  it('an unknown topic key is refused', () => {
    expect(loopTopic('nope')).toBeNull();
    expect(loopTopic(undefined)).toBeNull();
  });
  it('reads only a well-formed loop tag', () => {
    expect(readLoopMeta({ loop: { topic: 'am-binomial', subgroupId: 604 } })).toEqual({ topic: 'am-binomial', subgroupId: 604 });
    expect(readLoopMeta({ loop: { topic: 'am-binomial', subgroupId: '604' } })).toBeNull();
    expect(readLoopMeta(null)).toBeNull();
  });
});
