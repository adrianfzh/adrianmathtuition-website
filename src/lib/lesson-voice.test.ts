import { describe, expect, it } from 'vitest';
import {
  ackText, buildNotePrompt, mergeCorrection, groupKey, lastTimeLine, logAfterNote, matchLoose, mayWriteVoice, noteFor, noteSummary,
  parseNoteModel, parseNotePlain, pingDue, pingText, planLog, voiceFields, EMPTY_READ, VOICE_PREFIX,
} from './lesson-voice';
import { composeAutoLog } from './lesson-autolog';

const CANON = ['Trigonometry', 'Trigonometry (Identities)', 'Quadratic Equations', 'Coordinate Geometry', 'Bearings', 'Differentiation', 'Indices'];

describe('the ping', () => {
  const printed = composeAutoLog({ printed: [{ title: 'Sine rule', topic: 'Trigonometry', kind: 'practice', label: 'Sine rule practice' }] });
  it("one student, something printed", () => {
    const t = pingText([{ first: 'Eva', log: printed, plan: ['Sine rule and cosine rule'] }]);
    expect(t).toBe("📒 Eva's lesson just ended — how did it go?\nPrinted: sine rule practice (printed pack).\nHold 🎤 and talk, or tap ✓ if the plan was followed.");
  });
  it('nothing printed shows the plan', () => {
    const t = pingText([{ first: 'Eva', log: composeAutoLog({ printed: [] }), plan: ['Sine rule and cosine rule'] }]);
    expect(t).toContain('Plan was: Sine rule and cosine rule.');
    expect(t).not.toContain('Printed');
  });
  it('no plan and nothing printed: no ✓ promise', () => {
    const t = pingText([{ first: 'Eva', log: null, plan: [] }]);
    expect(t).toBe("📒 Eva's lesson just ended — how did it go?\nHold 🎤 and talk about it.");
  });
  it('a group lesson is one message naming everyone', () => {
    const t = pingText([
      { first: 'Eva', log: printed, plan: [] },
      { first: 'Ryan', log: composeAutoLog({ printed: [], handins: [{ name: 'Bukit Panjang Prelim P1' }] }), plan: ['Indices'] },
      { first: 'Jun Wei', log: null, plan: [] },
    ]);
    expect(t.split('\n')[0]).toBe("📒 Eva, Ryan and Jun Wei's lesson just ended — how did it go?");
    expect(t).toContain('Printed: Eva — sine rule practice (printed pack).');
    expect(t).toContain('Handed in: Ryan — Bukit Panjang Prelim P1.');
    expect(t).toContain('Plan was: Ryan — Indices.');
  });
  it('a lesson pings within two hours of its end, never before', () => {
    expect(pingDue('19:00', '19:02')).toBe(true);
    expect(pingDue('19:00', '18:58')).toBe(false);
    expect(pingDue('13:00', '15:00')).toBe(true);
    expect(pingDue('13:00', '15:01')).toBe(false);
    expect(pingDue(null, '15:00')).toBe(false);
  });
  it('same date and slot = one lesson', () => {
    expect(groupKey({ date: '2026-10-06', time: '5-7pm', end: '19:00' })).toBe(groupKey({ date: '2026-10-06', time: '5-7pm', end: '19:00' }));
    expect(groupKey({ date: '2026-10-06', time: '5-7pm', end: '19:00' })).not.toBe(groupKey({ date: '2026-10-06', time: '7-9pm', end: '21:00' }));
  });
  it('✓ with nothing printed logs the plan', () => {
    const l = planLog({ courses: [{ next: { label: 'Sine rule and cosine rule', step: { t: 'Trigonometry' } } }] });
    expect(l?.topics).toEqual(['Trigonometry']);
    expect(l?.phrases).toEqual(['sine rule and cosine rule (as planned)']);
    expect(planLog({ courses: [] })).toBeNull();
    expect(planLog({ courses: [], exam: { label: 'Prelim', subject: 'E Math' } })?.phrases[0]).toBe('revision for E Math Prelim (as planned)');
  });
});

describe('reading the note — the model', () => {
  it('the prompt carries the names, the list and an earlier note', () => {
    const p = buildNotePrompt({ text: 'did sine rule', source: 'voice', students: ['Eva', 'Ryan'], canonical: CANON, previous: { ...EMPTY_READ, homework: 'ex 5' } });
    expect(p).toContain('GROUP lesson with Eva and Ryan');
    expect(p).toContain('Trigonometry (Identities)');
    expect(p).toContain('CORRECTS or ADDS');
  });
  it('keeps only real topics and the lesson\'s own students', () => {
    const r = parseNoteModel(`Sure! {"all": {"topics": ["trigonometry", "Sine Rule Stuff"], "struggled": "which angle goes with which side", "homework": "exercise 5", "next": null, "attendance": "null", "mastery": "Slow", "other": null},
      "by": {"Ryan": {"homework": "TYS Q3-6"}, "Stranger": {"homework": "x"}}}`, CANON, ['Eva', 'Ryan']);
    expect(r?.all.topics).toEqual(['Trigonometry']);
    expect(r?.all.attendance).toBeNull();
    expect(r?.all.mastery).toBe('Slow');
    expect(Object.keys(r!.by)).toEqual(['Ryan']);
    expect(noteFor(r!, 'Ryan').homework).toBe('TYS Q3-6');
    expect(noteFor(r!, 'Ryan').struggled).toBe('which angle goes with which side');
    expect(noteFor(r!, 'Eva').homework).toBe('exercise 5');
  });
  it('unreadable → null', () => {
    expect(parseNoteModel('sorry I cannot', CANON, ['Eva'])).toBeNull();
    expect(parseNoteModel('{not json', CANON, ['Eva'])).toBeNull();
  });
  it('a mastery word the list does not hold is dropped', () => {
    expect(parseNoteModel('{"all": {"mastery": "Great"}}', CANON, ['Eva'])?.all.mastery).toBeNull();
  });
});

describe('reading the note — without the model', () => {
  it('a voice note, Singapore-tutor style', () => {
    const r = parseNotePlain('Ok Eva today we did trigonometry, sine rule lah. She kept mixing up the angles and the sides. Homework exercise 5 page 112. Next time do cosine rule.', CANON).all;
    expect(r.topics).toEqual(['Trigonometry']);
    expect(r.struggled).toBe('the angles and the sides');
    expect(r.homework).toBe('exercise 5 page 112');
    expect(r.next).toBe('do cosine rule');
  });
  it('late, and hw:', () => {
    const r = parseNotePlain('Ryan came 15 min late. quadratic equations, completing the square. hw: TYS 2019 P1 Q3-6', CANON).all;
    expect(r.topics).toEqual(['Quadratic Equations']);
    expect(r.homework).toBe('TYS 2019 P1 Q3-6');
    expect(r.attendance).toBe('Ryan came 15 min late');
  });
  it('nothing recognisable is an empty read, not an error', () => {
    const r = parseNotePlain('ok lor', CANON).all;
    expect(r.topics).toEqual([]);
    expect(r.homework).toBeNull();
  });
});

describe('writing it', () => {
  const log = composeAutoLog({ printed: [{ title: 'Sine rule', topic: 'Trigonometry', kind: 'practice', label: 'Sine rule practice' }] });
  const r = { ...EMPTY_READ, topics: ['Trigonometry'], struggled: 'which angle goes where', homework: 'exercise 5', next: 'cosine rule', mastery: 'Slow' as const };
  it('the Lessons fields', () => {
    const f = voiceFields(r, log, 'voice');
    expect(f['Topics Covered']).toBe('Trigonometry');
    expect(f['Homework Assigned']).toBe('exercise 5');
    expect(f['Next Lesson Plan']).toBe('cosine rule');
    expect(f['Mastery']).toBe('Slow');
    expect(f['Progress Logged']).toBe(true);
    expect(String(f['Lesson Notes'])).toBe('Voice note: struggled with which angle goes where. Printed/handed in: sine rule practice (printed pack). — from your voice note');
    expect('Status' in f).toBe(false);
  });
  it('no topics said → the printed topics stand', () => {
    expect(voiceFields({ ...EMPTY_READ, homework: 'ex 2' }, log, 'text')['Topics Covered']).toBe('Trigonometry');
    expect(logAfterNote(log, { ...EMPTY_READ }).topics).toEqual(['Trigonometry']);
    expect(logAfterNote(null, r).topics).toEqual(['Trigonometry']);
  });
  it('never over a hand-written log; over an auto log or an earlier voice note', () => {
    expect(mayWriteVoice({})).toBe(true);
    expect(mayWriteVoice({ 'Progress Logged': true, 'Lesson Notes': 'Auto log: x — auto (not confirmed)' })).toBe(true);
    expect(mayWriteVoice({ 'Progress Logged': true, 'Lesson Notes': `${VOICE_PREFIX} x` })).toBe(true);
    expect(mayWriteVoice({ 'Progress Logged': true, 'Lesson Notes': 'Good lesson, did vectors' })).toBe(false);
  });
  it('the ack', () => {
    expect(ackText([noteSummary('Eva', r, log)])).toBe('📒 Got it — Eva: Trigonometry; struggled with which angle goes where; homework exercise 5; next time cosine rule; same step again next time.\nReply to this to change anything.');
    expect(ackText(['Eva: x', 'Ryan: y'], true)).toBe('📒 Fixed — \n• Eva: x.\n• Ryan: y.\nReply to this to change anything.');
  });
});

describe('a correction', () => {
  it('changes what it says, keeps the rest', () => {
    const prev = { ...EMPTY_READ, topics: ['Trigonometry'], struggled: 'angles', homework: 'ex 5', next: 'bearings' };
    expect(mergeCorrection(prev, { ...EMPTY_READ, homework: 'ex 6' })).toEqual({ ...prev, homework: 'ex 6' });
    expect(mergeCorrection(null, { ...EMPTY_READ, homework: 'ex 6' }).topics).toEqual([]);
  });
});

describe('a voice note sent without replying', () => {
  const C = [
    { packId: 'a', name: 'Eva Tan', end: '19:00', date: '2026-10-06' },
    { packId: 'b', name: 'Lim Jun Wei', end: '19:00', date: '2026-10-06' },
    { packId: 'c', name: 'Ryan Ong', end: '13:00', date: '2026-10-06' },
  ];
  it('names a student who just finished', () => {
    expect(matchLoose('eva did sine rule today', C, '2026-10-06', '19:20').map((c) => c.packId)).toEqual(['a']);
  });
  it('a lesson that ended too long ago is not matched', () => {
    expect(matchLoose('Ryan was ok', C, '2026-10-06', '19:20')).toEqual([]);
  });
  it('no name → nothing (never a guess)', () => {
    expect(matchLoose('did sine rule, homework exercise 5', C, '2026-10-06', '19:20')).toEqual([]);
  });
  it('a full name squashed by the transcriber', () => {
    expect(matchLoose('LimJunWei struggled with bearings', C, '2026-10-06', '19:05').map((c) => c.packId)).toEqual(['b']);
  });
  it('a first name inside another word does not count', () => {
    expect(matchLoose('evaluate the integral', C, '2026-10-06', '19:05')).toEqual([]);
  });
});

describe('on the card', () => {
  it('Last time', () => {
    expect(lastTimeLine({ topics: ['Trigonometry'], struggled: 'angles in the sine rule', homework: 'ex 5', next: null })).toBe('Last time: struggled with angles in the sine rule. Homework: ex 5.');
    expect(lastTimeLine({ topics: ['Trigonometry'], struggled: null, homework: null, next: null })).toBe('Last time: Trigonometry.');
    expect(lastTimeLine(null)).toBeNull();
  });
});
