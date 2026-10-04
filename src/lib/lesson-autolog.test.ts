import { describe, expect, it } from 'vitest';
import { autoLogFields, autoLogLine, autoNotes, composeAutoLog, mayWriteAutoLog, parseReplyPlain, slotEndHHMM } from './lesson-autolog';

describe('slot end', () => {
  it('reads every slot time', () => {
    expect(slotEndHHMM('9-11am')).toBe('11:00');
    expect(slotEndHHMM('11am-1pm')).toBe('13:00');
    expect(slotEndHHMM('1-3pm')).toBe('15:00');
    expect(slotEndHHMM('5-7pm')).toBe('19:00');
    expect(slotEndHHMM('7-9pm')).toBe('21:00');
    expect(slotEndHHMM('')).toBeNull();
    expect(slotEndHHMM('evening')).toBeNull();
  });
});

describe('compose', () => {
  const log = composeAutoLog({
    printed: [
      { title: 'Warm-up', topic: 'Trigonometry', label: 'Bearings', kind: 'warmup' },
      { title: 'E Math: Trigonometry', topic: 'Trigonometry', label: 'Sine rule and cosine rule', kind: 'practice' },
    ],
    handins: [{ name: 'Practice Again (EM 2022 P1)' }],
  });
  it("Adrian's line", () => {
    expect(autoLogLine('Eva', log)).toBe('📒 Eva today: sine rule and cosine rule (printed pack), warm-up on bearings, handed in Practice Again (EM 2022 P1).\nTap ✓ if right, or reply with what you did.');
  });
  it('topics: what was taught, not the warm-up', () => {
    expect(log.topics).toEqual(['Trigonometry']);
    const w = composeAutoLog({ printed: [{ title: 'Warm-up', topic: 'Vectors', kind: 'warmup' }] });
    expect(w.topics).toEqual([]);
  });
  it('nothing printed says so', () => {
    const e = composeAutoLog({ printed: [] });
    expect(e.empty).toBe(true);
    expect(autoLogLine('Ryan', e)).toMatch(/^📒 Ryan today: nothing was printed or handed in\./);
  });
  it('notes and fields', () => {
    expect(autoNotes(log, 'unconfirmed')).toMatch(/^Auto log: sine rule .* — auto \(not confirmed\)$/);
    expect(autoNotes(log, 'confirmed', 'did 3D trig too')).toMatch(/Adrian: did 3D trig too — confirmed by Adrian$/);
    expect(autoLogFields(log, 'unconfirmed')).toMatchObject({ 'Topics Covered': 'Trigonometry', 'Progress Logged': true });
  });
});

describe('never over a hand-written log', () => {
  it('writes an empty or auto-written lesson only', () => {
    expect(mayWriteAutoLog({})).toBe(true);
    expect(mayWriteAutoLog({ 'Progress Logged': true, 'Lesson Notes': 'Auto log: x — auto (not confirmed)' })).toBe(true);
    expect(mayWriteAutoLog({ 'Progress Logged': true, 'Lesson Notes': 'Great lesson' })).toBe(false);
    expect(mayWriteAutoLog({ 'Progress Logged': true })).toBe(false);
  });
});

describe('plain reply', () => {
  const canon = ['Trigonometry', 'Trigonometry (Identities)', 'Circular Measure', 'Vectors'];
  it('topics and homework', () => {
    const r = parseReplyPlain('did trigonometry identities and some circular measure. hw: ex 5b q1-10', canon);
    expect(r.topics.sort()).toEqual(['Circular Measure', 'Trigonometry (Identities)']);
    expect(r.homework).toBe('ex 5b q1-10');
    const r2 = parseReplyPlain('Trigonometry (Identities) then vectors, homework 10 questions', canon);
    expect(r2.topics).toEqual(['Trigonometry (Identities)', 'Vectors']);
    expect(r2.homework).toBe('10 questions');
  });
});

describe('reply read by the model', () => {
  it('keeps only real topics; his topics win', async () => {
    const { parseReplyModel, applyReply, composeAutoLog } = await import('./lesson-autolog');
    const r = parseReplyModel('{"topics":["circular measure","Calculus"],"homework":"ex 5b","note":null}', ['Circular Measure', 'Trigonometry'])!;
    expect(r).toEqual({ topics: ['Circular Measure'], homework: 'ex 5b', note: '' });
    const log = composeAutoLog({ printed: [{ title: 't', topic: 'Trigonometry', kind: 'practice' }] });
    expect(applyReply(log, r)).toMatchObject({ topics: ['Circular Measure'], homework: 'ex 5b' });
    expect(applyReply(log, { topics: [], homework: null, note: 'x' }).topics).toEqual(['Trigonometry']);
    expect(parseReplyModel('nope', [])).toBeNull();
  });
});
