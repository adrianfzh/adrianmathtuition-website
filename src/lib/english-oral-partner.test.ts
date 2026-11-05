import { describe, it, expect } from 'vitest';
import { askedPrompts, buildFollowUpPrompt, isFollowUpTurn, isPartnerAttempt, mainIndex, parseFollowUp, standInFollowUp, turnCount, STAND_IN_FOLLOW_UPS } from './english-oral-partner';
import { buildOralPrompt } from './english-oral';
import { oralById } from './english-speaking-data';
import { screen, readConcern, helpLines, alertText, HELP_LINES } from './wellbeing';

const set = () => oralById('or01')!;

describe('the speaking partner: turns', () => {
  it('each of the three set prompts is followed by one question about the answer — six turns', () => {
    expect(turnCount(set())).toBe(6);
    expect([0, 1, 2, 3, 4, 5].map(isFollowUpTurn)).toEqual([false, true, false, true, false, true]);
    expect([0, 1, 2, 3, 4, 5].map(mainIndex)).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it('what was asked: the set prompts, and each follow-up kept on the answer it reacts to', () => {
    const asked = askedPrompts(set(), [{ q: 0, followUp: 'You said nobody cares. Why do you think so?' }, { q: 1 }, { q: 2 }]);
    expect(asked).toHaveLength(6);
    expect(asked[0]).toBe(set().interaction[0]);
    expect(asked[1]).toBe('You said nobody cares. Why do you think so?');
    expect(asked[2]).toBe(set().interaction[1]);
    expect(asked[3]).toBe('');
  });
  it('an attempt made before the partner (three fixed prompts) is still read as three', () => {
    expect(isPartnerAttempt({ part: 'interaction', status: 'done', answers: [{ q: 0 }, { q: 1 }, { q: 2 }] })).toBe(false);
    expect(isPartnerAttempt({ part: 'interaction', status: 'done', answers: [{ q: 0, followUp: 'Why?' }] })).toBe(true);
    expect(isPartnerAttempt({ part: 'interaction', status: 'recording', answers: [] })).toBe(true);
    expect(isPartnerAttempt({ part: 'planned', status: 'recording', answers: [] })).toBe(false);
  });
});

describe('the follow-up prompt', () => {
  const talk = [{ asked: set().interaction[0], said: 'I think many young people care, like my CCA did a beach clean-up last month.' }];
  it('carries the answer just given and does not let the partner jump ahead to later prompts', () => {
    const p = buildFollowUpPrompt(set(), talk);
    expect(p).toContain('my CCA did a beach clean-up');
    expect(p).toContain('QUESTIONS STILL TO COME');
    expect(p).toContain(set().interaction[2]);
    expect(p).toContain('"risk"');
  });
  it('after the last set prompt there is nothing still to come', () => {
    const t = [0, 1, 2, 3, 4].map(i => ({ asked: `q${i}`, said: 'something' }));
    expect(buildFollowUpPrompt(set(), t)).not.toContain('QUESTIONS STILL TO COME');
  });
  it('the partner never names itself and never gives feedback', () => {
    const p = buildFollowUpPrompt(set(), talk);
    expect(p).toMatch(/Never give a name/);
    expect(p).toMatch(/No praise, no feedback/);
  });
});

describe('the follow-up, through the checks', () => {
  it('a good question passes', () => {
    expect(parseFollowUp('{"risk": false, "say": "I see. You mentioned your CCA. What made you join that clean-up?"}')).toEqual({ say: 'I see. You mentioned your CCA. What made you join that clean-up?', risk: false });
  });
  it('a thinking preamble before the JSON is fine', () => {
    expect(parseFollowUp('Here it is:\n{"risk": false, "say": "Why do you think schools should lead this?"}').say).toBe('Why do you think schools should lead this?');
  });
  it('no question mark, too long, a name, or feedback → not used', () => {
    expect(parseFollowUp('{"risk": false, "say": "Tell me more about that."}').say).toBeNull();
    expect(parseFollowUp(`{"risk": false, "say": "${'very '.repeat(50)}long?"}`).say).toBeNull();
    expect(parseFollowUp('{"risk": false, "say": "As an AI examiner, I wonder why you think so?"}').say).toBeNull();
    expect(parseFollowUp('{"risk": false, "say": "Great answer! Why do you think so?"}').say).toBeNull();
    expect(parseFollowUp('{"risk": false, "say": "Watch your grammar. Why do you think so?"}').say).toBeNull();
    expect(parseFollowUp('nonsense')).toEqual({ say: null, risk: null });
  });
  it('topic words stay allowed — a question may be about teachers or apps', () => {
    expect(parseFollowUp('{"risk": false, "say": "Should teachers use apps to remind students to keep the school clean?"}').say).not.toBeNull();
  });
  it('the risk judgement comes through even when the question is unusable', () => {
    expect(parseFollowUp('{"risk": true, "say": ""}')).toEqual({ say: null, risk: true });
  });
  it('a stand-in question is always there and passes the same checks', () => {
    for (const q of [0, 2, 4]) expect(STAND_IN_FOLLOW_UPS).toContain(standInFollowUp(q));
    for (const s of STAND_IN_FOLLOW_UPS) expect(parseFollowUp(JSON.stringify({ risk: false, say: s })).say).toBe(s);
  });
});

describe('the report reads all six turns', () => {
  it('the follow-ups are in the reading, and engagement with them counts', () => {
    const asked = askedPrompts(set(), [0, 1, 2, 3, 4].map(q => ({ q, followUp: q % 2 === 0 ? `Follow-up ${q}?` : null })));
    const p = buildOralPrompt(set(), 'interaction', asked.map((_, i) => `answer ${i}`), asked);
    expect(p).toContain('Follow-up 2?');
    expect(p).toContain('PROMPT 6');
    expect(p).toContain('answer each follow-up question itself');
  });
  it('a three-prompt attempt reads as before', () => {
    const p = buildOralPrompt(set(), 'interaction', ['a', 'b', 'c']);
    expect(p).not.toContain('follow-up');
    expect(p).not.toContain('PROMPT 4');
  });
});

describe('wellbeing — the bot\'s word check, for a student speaking', () => {
  it('clear first-person words are serious at once', () => {
    expect(screen('honestly sometimes I want to kill myself because of exams')).toEqual({ level: 'serious', kind: 'self_harm' });
  });
  it('words that are often about other people go to a small check, with the bot\'s fallback', () => {
    expect(screen('Many students are getting bullied online these days')).toMatchObject({ level: 'check', kind: 'bullying', fallback: 'serious' });
    expect(screen('my mum is going to kill me if I come home late')).toMatchObject({ level: 'check', kind: 'danger', fallback: 'none' });
  });
  it('an ordinary oral answer is left alone, stress included', () => {
    for (const t of ['I think the government should do more to keep Singapore clean.', "I'm so stressed about my exams but volunteering helps me relax.", 'We picked up plastic that could kill sea turtles.'])
      expect(screen(t), t).toEqual({ level: 'none' });
  });
  it('the small check answers RISK or SAFE; anything else is unknown', () => {
    expect(readConcern('RISK')).toBe(true);
    expect(readConcern(' safe.')).toBe(false);
    expect(readConcern('maybe')).toBeNull();
  });
  it('the help lines are the official ones, and nothing names a person or a model', () => {
    for (const k of ['self_harm', 'abuse', 'danger', 'bullying'] as const) {
      const h = helpLines(k);
      const all = [h.lead, ...h.lines].join(' ');
      expect(all).toContain(HELP_LINES.mindline.call);
      expect(all).not.toMatch(/adrian|claude|ai model|gemini/i);
    }
    expect(helpLines('abuse').lines.join(' ')).toContain('999');
  });
  it('Adrian\'s alert quotes the words and says where', () => {
    const t = alertText({ kind: 'bullying', who: 'student@x', where: 'English oral practice (Part 2, or01)', words: 'they bully me every day', source: 'model' });
    expect(t).toContain('🆘 student@x may need help: bullying');
    expect(t).toContain('they bully me every day');
    expect(t).toContain('English oral practice');
  });
});
