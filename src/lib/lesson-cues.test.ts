// Word cues, the brisk hand, the arc mark and the one-concept clip (8 Oct 2026):
// "The voice and the animation is not synchronized perfectly yet" — an action
// fires on the WORD it belongs to, not at a guessed fraction of the clip.
import { describe, it, expect } from 'vitest';
import { buildSpeechTrack, cueFraction, cueWordIndex, handWriteS, spokenWords, CUE_LEAD_S } from './lesson-speech';
import { estimateSayS, resolveActionTimes } from './lesson-beats';
import { validateLessonScript, hasBeats, type BeatAction, type LessonScript } from './lesson-script';
import { loadLessonScript } from './lesson-load';
import { lessonBySlug } from './lesson-catalog';
import { beatIssues, clipIssues, craftIssues, directIssues, motionIssues, narrationIssues, CLIP_MAX_WORDS } from './lesson-verify';

const SAY = 'Start with the first x. x times x is x squared.';

describe('cueWordIndex', () => {
  it('finds a word or a run of words, ignoring case and punctuation', () => {
    expect(spokenWords(SAY)).toHaveLength(11);
    expect(cueWordIndex(SAY, 'start')).toBe(0);
    expect(cueWordIndex(SAY, 'x times')).toBe(5);
    expect(cueWordIndex(SAY, 'X squared')).toBe(9);
    expect(cueWordIndex('The x-coordinate, then.', 'x-coordinate')).toBe(1);
  });
  it('searches from an index, so a repeated word resolves to its next use', () => {
    expect(cueWordIndex(SAY, 'x')).toBe(4);
    expect(cueWordIndex(SAY, 'x', 5)).toBe(5);
    expect(cueWordIndex(SAY, 'x', 7)).toBe(7);
  });
  it('is −1 for words the voice never says, and for an empty cue', () => {
    expect(cueWordIndex(SAY, 'cubed')).toBe(-1);
    expect(cueWordIndex(SAY, 'x cubed')).toBe(-1);
    expect(cueWordIndex(SAY, ' , ')).toBe(-1);
  });
});

describe('cueFraction + resolveActionTimes with word cues', () => {
  // A sidecar that says the second sentence late: "x times" starts at 3.0 s of a 6 s clip.
  const words = spokenWords(SAY).map((text, i) => ({ text, start: i < 5 ? i * 0.3 : 3 + (i - 5) * 0.5, end: i < 5 ? i * 0.3 + 0.25 : 3 + (i - 5) * 0.5 + 0.4 }));
  const exact = buildSpeechTrack(SAY, 6, { words, sentences: null });
  const actions: BeatAction[] = [
    { do: 'mark', kind: 'arc', token: ['a', 'c'], on: 'x times' },
    { do: 'write', token: 'p1', on: 'x squared' },
  ];

  it('with a sidecar the action fires a short lead before the word itself', () => {
    expect(cueFraction(exact, 5)).toBeCloseTo((3 - CUE_LEAD_S) / 6, 5);
    const t = resolveActionTimes(actions, SAY, exact);
    expect(t[0] * 6).toBeCloseTo(3 - CUE_LEAD_S, 5);
    expect(t[1] * 6).toBeCloseTo(5 - CUE_LEAD_S, 5);
  });
  it('without a sidecar it lands on the word’s share of the sentence — in order, inside the clip', () => {
    const t = resolveActionTimes(actions, SAY);
    expect(t[0]).toBeGreaterThan(0.3);
    expect(t[1]).toBeGreaterThan(t[0]);
    expect(t[1]).toBeLessThan(1);
  });
  it('a first-word cue clamps to the clip’s first frame, and never runs backwards', () => {
    expect(resolveActionTimes([{ do: 'write', step: 0, on: 'Start' }], SAY, exact)[0]).toBe(0);
    const mixed = resolveActionTimes([{ do: 'reveal', step: 1, at: 0.9 }, { do: 'write', token: 'p1', on: 'x times' }], SAY, exact);
    expect(mixed[1]).toBeGreaterThanOrEqual(mixed[0]);
  });
  it('actions without a cue resolve exactly as before', () => {
    const old: BeatAction[] = [{ do: 'write', text: 'intro' }, { do: 'write', token: 'lhs', at: 0.5 }];
    expect(resolveActionTimes(old)).toEqual([0, 0.5]);
    expect(resolveActionTimes(old, SAY)).toEqual([0, 0.5]);
  });
  it('estimates a beat’s spoken length from its words', () => {
    expect(estimateSayS(SAY)).toBeCloseTo(11 / 2.6, 5);
    expect(estimateSayS('Hi.')).toBe(1);
  });
});

describe('handWriteS — the hand is brisk and then done', () => {
  it('about twenty letters a second, never under half a second', () => {
    expect(handWriteS(4)).toBe(0.5);
    expect(handWriteS(40)).toBeCloseTo(2, 5);
  });
});

describe('validator: on, arcs, kind', () => {
  const script = (doList: unknown[], extra: Record<string, unknown> = {}) => ({
    slug: 't', title: 'T', level: 'S2', topic: 'Algebra (Expansion)', minutes: 1, theme: 'chalk', ...extra,
    scenes: [{ type: 'equation-steps', steps: [{ tokens: [{ tex: 'x', id: 'a' }, { tex: '+3', id: 'b' }, { tex: 'x', id: 'c' }] }], beats: [{ say: SAY, do: doList }] }],
  });
  const errs = (r: ReturnType<typeof validateLessonScript>) => (r.ok ? '' : r.errors.join(' | '));

  it('accepts a cue the beat says, an arc between two tokens, and kind: clip', () => {
    expect(validateLessonScript(script([{ do: 'write', step: 0 }, { do: 'mark', kind: 'arc', token: ['a', 'c'], on: 'x times' }, { do: 'mark', kind: 'arc-under', token: ['b', 'c'], on: 'x squared' }], { kind: 'clip' })).ok).toBe(true);
  });
  it('refuses a cue the voice never says', () => {
    expect(errs(validateLessonScript(script([{ do: 'write', step: 0, on: 'cubed' }])))).toMatch(/not said in this beat/);
  });
  it('refuses cues out of spoken order', () => {
    expect(errs(validateLessonScript(script([{ do: 'write', step: 0, on: 'squared' }, { do: 'highlight', token: 'a', on: 'Start' }])))).toMatch(/BEFORE the cue/);
  });
  it('refuses on together with at', () => {
    expect(errs(validateLessonScript(script([{ do: 'write', step: 0, on: 'Start', at: 0.2 }])))).toMatch(/never both/);
  });
  it('refuses an arc that does not join exactly two tokens, and an unknown kind', () => {
    expect(errs(validateLessonScript(script([{ do: 'mark', kind: 'arc', token: 'a' }])))).toMatch(/exactly two tokens/);
    expect(errs(validateLessonScript(script([], { kind: 'reel' })))).toMatch(/kind must be one of/);
  });
});

describe('the verifier’s new rules', () => {
  const clip = (beats: { say: string; do: BeatAction[] }[]): LessonScript => ({
    slug: 't', title: 'T', level: 'S2', topic: 'Algebra (Expansion)', minutes: 1, kind: 'clip', theme: 'chalk',
    scenes: [{ type: 'equation-steps', steps: [{ tokens: [{ tex: 'x', id: 'a' }, { tex: '+3', id: 'b' }] }, { tokens: [{ tex: '=', id: 'c' }] }], beats }],
  });
  it('directIssues: a question, a warm-up, a cheer and pointing at the screen are all flagged', () => {
    const msgs = directIssues(clip([
      { say: 'So, where is its lowest point?', do: [] },
      { say: 'Hi. Today we learn one rewrite.', do: [] },
      { say: 'The curve drops by four. See? That\'s all it is.', do: [] },
      { say: 'As you can see on the board, x is two.', do: [] },
      { say: 'Multiply x by x to get x squared.', do: [] },
    ]));
    expect(msgs.filter(m => m.where.endsWith('beats[0].say')).length).toBeGreaterThan(0);
    expect(msgs.filter(m => m.where.endsWith('beats[1].say')).length).toBeGreaterThan(0);
    expect(msgs.filter(m => m.where.endsWith('beats[2].say')).length).toBeGreaterThan(0);
    expect(msgs.filter(m => m.where.endsWith('beats[3].say')).length).toBeGreaterThan(0);
    expect(msgs.filter(m => m.where.endsWith('beats[4].say'))).toEqual([]);
    expect(msgs.every(m => m.severity === 'warn')).toBe(true);
  });
  it('motionIssues: three things in one beat, two at the same word, and a guessed fraction on a clip', () => {
    const msgs = motionIssues(clip([
      { say: SAY, do: [{ do: 'write', token: 'a', on: 'Start' }, { do: 'write', token: 'b', on: 'first' }, { do: 'write', token: 'c', on: 'squared' }] },
      { say: SAY, do: [{ do: 'write', token: 'a', on: 'x times' }, { do: 'mark', kind: 'underline', token: 'a', on: 'x times' }] },
      { say: SAY, do: [{ do: 'write', token: 'a', at: 0.5 }] },
    ])).map(m => m.message).join(' | ');
    expect(msgs).toMatch(/3 things appear in one beat/);
    expect(msgs).toMatch(/two things would move at once/);
    expect(msgs).toMatch(/guessed fraction/);
  });
  it('clipIssues: nothing for a long lesson; a check or too many words on a clip', () => {
    expect(clipIssues(loadLessonScript('quadratic-functions-am')!)).toEqual([]);
    const long = clip(Array.from({ length: 12 }, () => ({ say: 'Multiply the first term by the second term and write the product down on the next line now.', do: [] })));
    expect(clipIssues(long).map(m => m.message).join(' | ')).toMatch(/over about a minute/);
  });
});

describe('expand-two-brackets-s2 — the first one-concept clip', () => {
  const script = loadLessonScript('expand-two-brackets-s2')!;
  const beats = script.scenes.flatMap(s => (hasBeats(s) ? s.beats : []));

  it('is registered as a one-minute clip on the chalk board', () => {
    expect(script.kind).toBe('clip');
    expect(script.theme).toBe('chalk');
    expect(script.scenes).toHaveLength(1);
    expect(lessonBySlug('expand-two-brackets-s2')?.minutes).toBe(1);
  });
  it('passes every verifier rule with no warning', () => {
    const all = [...craftIssues(script), ...narrationIssues(script, { require: true }), ...beatIssues(script), ...directIssues(script), ...motionIssues(script), ...clipIssues(script)];
    expect(all.filter(i => i.severity !== 'info')).toEqual([]);
  });
  it('says each step plainly: short beats, no question, about a minute in all', () => {
    const words = beats.reduce((n, b) => n + b.say.split(/\s+/).length, 0);
    expect(words).toBeLessThanOrEqual(CLIP_MAX_WORDS);
    for (const b of beats) expect(b.say).not.toContain('?');
  });
  it('cues every action after a beat’s first to a spoken word — no guessed fraction anywhere', () => {
    for (const b of beats) b.do.forEach((a, j) => {
      expect(a.at, b.say).toBeUndefined();
      if (j > 0) expect(typeof a.on, b.say).toBe('string');
    });
  });
  it('names no person and no model', () => {
    expect(JSON.stringify(script)).not.toMatch(/adrian|claude|opus|sonnet|haiku|gemini|minimax/i);
  });
});

describe('quadratic-functions-am — re-cued to the voice', () => {
  const script = loadLessonScript('quadratic-functions-am')!;
  it('most timed actions now fire on a word, each with a timing sidecar declared', () => {
    const actions = script.scenes.flatMap(s => (hasBeats(s) ? s.beats.flatMap(b => b.do) : []));
    expect(actions.filter(a => typeof a.on === 'string').length).toBeGreaterThanOrEqual(60);
    expect(actions.filter(a => typeof a.at === 'number' && a.at > 0.05).length).toBeLessThanOrEqual(4);
  });
});
