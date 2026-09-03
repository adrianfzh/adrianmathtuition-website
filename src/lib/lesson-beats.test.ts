import { describe, it, expect } from 'vitest';
import {
  resolveActionTimes, firedCountAt, beatAutoMs, boardStateAt, emptyBoard, sceneTargets, sceneNotes,
  targetKeys, tokenShown, tokenWritten, lineOn, elementShown, elementStatic, proseGroup, beatTimeline,
  sceneTokens, paragraphCount, tokKey, lineKey, FOCUS_HOLD_S,
} from './lesson-beats';
import { validateLessonScript, sceneStepCount, narrationAt, narrationLayout, lessonHasAudio, sceneNarration, sceneAudio, beatClipPath, hasBeats, type Beat, type BeatAction, type EquationStepsScene, type PlayScene } from './lesson-script';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** The recipe scene of the quadratic lesson, cut into beats the way the proof lesson is. */
function recipe(beats: Beat[]): EquationStepsScene {
  return {
    type: 'equation-steps',
    heading: 'The recipe',
    intro: 'Express $y = x^2 - 3x + 2$ in the form $(x-h)^2 + k$.',
    steps: [
      { tokens: [
        { tex: 'x^2 - 3x + 2', id: 'lhs' }, { tex: '=', id: 'eq' },
        { tex: 'x^2 - 3x + (3/2)^2', id: 'sq' }, { tex: '- (3/2)^2', id: 'magic' }, { tex: '+ 2', id: 'tail' },
      ], note: 'Half it, square it, add and subtract.' },
      { tokens: [{ tex: '=' }, { tex: '(x - 3/2)^2', from: 'sq' }, { tex: '- 9/4', from: 'magic' }, { tex: '+ 2' }], note: 'A perfect square.' },
      { tokens: [{ tex: '=' }, { tex: '(x - 3/2)^2' }, { tex: '- 1/4', id: 'k' }], note: 'Read it off.' },
    ],
    beats,
  };
}

const W = (t: Record<string, unknown>): BeatAction => ({ do: 'write', ...t } as BeatAction);
const R = (t: Record<string, unknown>): BeatAction => ({ do: 'reveal', ...t } as BeatAction);

const RECIPE_BEATS: Beat[] = [
  { say: 'Copy the expression.', do: [W({ text: 'intro' }), W({ token: 'lhs', at: 0.5 })] },
  { say: 'Halve it, square it.', do: [{ do: 'note', text: 'half: $-3/2$', near: 'lhs', at: 0.25 }] },
  { say: 'Add it and subtract it.', do: [W({ token: 'sq', at: 0.05 }), W({ token: 'magic', at: 0.45 }), W({ token: 'tail', at: 0.7 }), { do: 'highlight', token: 'magic', at: 0.75 }] },
  { say: 'A perfect square.', do: [{ do: 'mark', kind: 'underline', token: 'sq', at: 0.1 }, { do: 'focus', token: 'sq', at: 0.15 }, { do: 'move', from: 'sq', at: 0.6 }] },
  { say: 'The leftovers.', do: [R({ step: 1, at: 0.02 }), { do: 'move', from: 'magic', at: 0.55 }] },
  { say: 'Tidy them.', do: [W({ step: 2, at: 0.05 }), { do: 'mark', kind: 'box', token: 'k', at: 0.6 }, { do: 'clear', at: 0.9 }] },
];

// ── Timing ───────────────────────────────────────────────────────────────────

describe('resolveActionTimes', () => {
  const a = (at?: number): BeatAction => ({ do: 'clear', ...(at === undefined ? {} : { at }) });

  it('keeps explicit fractions and clamps them to 0…1', () => {
    expect(resolveActionTimes([a(0.2), a(0.7), a(1.4)])).toEqual([0.2, 0.7, 1]);
  });

  it('spreads unspecified actions from the first frame across the first 70 %', () => {
    expect(resolveActionTimes([a()])).toEqual([0]);
    expect(resolveActionTimes([a(), a()])).toEqual([0, 0.35]);
    const three = resolveActionTimes([a(), a(), a()]);
    expect(three[0]).toBe(0);
    expect(three[1]).toBeCloseTo(0.7 / 3, 6);
    expect(three[2]).toBeCloseTo(1.4 / 3, 6);
  });

  it('interpolates a run strictly between its explicit neighbours', () => {
    expect(resolveActionTimes([a(0.2), a(), a(0.8)])).toEqual([0.2, 0.5, 0.8]);
    const t = resolveActionTimes([a(0.2), a(), a(), a(0.8)]);
    expect(t[1]).toBeCloseTo(0.4, 6);
    expect(t[2]).toBeCloseTo(0.6, 6);
    // trailing run after an explicit value heads for 0.7 (or stays put past it)
    expect(resolveActionTimes([a(0.4), a()])).toEqual([0.4, 0.55]);
    expect(resolveActionTimes([a(0.9), a()])).toEqual([0.9, 0.9]);
  });

  it('never runs backwards', () => {
    const t = resolveActionTimes([a(0.5), a(), a(0.3)]);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
  });
});

describe('firedCountAt', () => {
  it('counts the prefix of actions whose time has come', () => {
    const times = [0, 0.25, 0.5, 0.9];
    expect(firedCountAt(times, 0)).toBe(1);
    expect(firedCountAt(times, 0.24)).toBe(1);
    expect(firedCountAt(times, 0.25)).toBe(2);
    expect(firedCountAt(times, 0.6)).toBe(3);
    expect(firedCountAt(times, 1)).toBe(4);
    expect(firedCountAt([], 1)).toBe(0);
  });
});

describe('beatAutoMs', () => {
  it('paces a silent beat to its words, with a floor and a ceiling', () => {
    expect(beatAutoMs({ say: 'Two words.', do: [] })).toBe(1600);
    expect(beatAutoMs({ say: 'one two three four five six seven eight nine ten', do: [] })).toBe(900 + 10 * 340);
    expect(beatAutoMs({ say: Array(80).fill('w').join(' '), do: [] })).toBe(16000);
  });
});

// ── Addressing ───────────────────────────────────────────────────────────────

describe('targetKeys / sceneTokens', () => {
  const scene = recipe(RECIPE_BEATS);
  it('resolves every target shape to canonical keys', () => {
    expect(targetKeys(scene, { step: 1 })).toEqual(['line:1']);
    expect(targetKeys(scene, { token: 'magic' })).toEqual(['tok:0:3']);
    expect(targetKeys(scene, { token: 'nope' })).toEqual([]);
    expect(targetKeys(scene, { text: 'intro' })).toEqual(['text:intro']);
    const caption: PlayScene = { type: 'caption', text: 'One.\n\nTwo.\n\nThree.' };
    expect(paragraphCount(caption)).toBe(3);
    expect(targetKeys(caption, { text: 'text' })).toEqual(['para:0', 'para:1', 'para:2']);
    expect(targetKeys(caption, { text: 'text', para: 1 })).toEqual(['para:1']);
    const annotate: PlayScene = { type: 'annotate', tokens: [{ tex: 'a', id: 'a' }], callouts: [{ target: 'a', label: 'l' }] };
    expect(targetKeys(annotate, { text: 'expression' })).toEqual(['line:0']);
    expect(targetKeys(annotate, { callout: 0 })).toEqual(['callout:0']);
    expect(targetKeys(annotate, { token: 'a' })).toEqual(['tok:0:0']);
  });
  it('lists tokens in writing order with their ids and from', () => {
    const toks = sceneTokens(scene);
    expect(toks).toHaveLength(12);
    expect(toks[2]).toEqual({ line: 0, index: 2, id: 'sq', from: undefined });
    expect(toks[6]).toEqual({ line: 1, index: 1, id: undefined, from: 'sq' });
    expect(sceneTokens({ type: 'caption', text: 't' })).toEqual([]);
  });
});

// ── Board state ──────────────────────────────────────────────────────────────

describe('boardStateAt — the recipe scene', () => {
  const scene = recipe(RECIPE_BEATS);

  it('starts empty: lines hidden, targeted prose hidden, untargeted prose static', () => {
    const b = boardStateAt(scene, 0, 0);
    expect(lineOn(b, 0)).toBe(false);
    expect(elementShown(b, 'text:intro')).toBe(false);   // targeted by beat 0 → waits
    expect(elementStatic(b, 'text:intro')).toBe(false);
    expect(elementShown(b, 'text:heading')).toBe(true);  // no action ever targets it → static
    expect(elementStatic(b, 'text:heading')).toBe(true);
    expect(b.state).toBe(0);
  });

  it('write text then write token: the line turns on, the pen writes left to right', () => {
    let b = boardStateAt(scene, 0, 1); // intro written
    expect(elementShown(b, 'text:intro')).toBe(true);
    expect(b.written.has('text:intro')).toBe(true);
    expect(lineOn(b, 0)).toBe(false);
    b = boardStateAt(scene, 0, 2);     // lhs written
    expect(lineOn(b, 0)).toBe(true);
    expect(tokenShown(b, scene, 0, 0)).toBe(true);   // lhs (written)
    expect(tokenWritten(b, 0, 0)).toBe(true);
    expect(tokenShown(b, scene, 0, 1)).toBe(true);   // "=" untargeted, everything targeted before it is written
    expect(tokenShown(b, scene, 0, 2)).toBe(false);  // sq waits for its own write
    expect(tokenShown(b, scene, 0, 4)).toBe(false);  // "+ 2" waits behind the unwritten square
  });

  it('earlier beats are cumulative; a beat in progress applies only its fired actions', () => {
    const b = boardStateAt(scene, 2, 2); // beat 2: sq + magic written, tail not yet
    expect(tokenShown(b, scene, 0, 2)).toBe(true);
    expect(tokenShown(b, scene, 0, 3)).toBe(true);
    expect(tokenShown(b, scene, 0, 4)).toBe(false);
    expect(b.notes).toHaveLength(1);                  // beat 1's note carried over
    expect(b.notes[0]).toMatchObject({ id: 'note:1:0', text: 'half: $-3/2$', near: 'lhs' });
    expect(b.shown.has('note:1:0')).toBe(true);
    expect(b.written.has('note:1:0')).toBe(true);
    expect(sceneNotes(scene)).toEqual([{ id: 'note:1:0', text: 'half: $-3/2$', near: 'lhs', line: 0 }]);
    expect(elementShown(boardStateAt(scene, 1, 0), 'note:1:0')).toBe(false); // a slot waits for its action
    expect(b.pulses).toHaveLength(0);
    const all = boardStateAt(scene, 2, 4);
    expect(tokenShown(all, scene, 0, 4)).toBe(true);
    expect(all.pulses).toEqual([{ tokens: ['magic'], seq: 6 }]);
  });

  it('a from-token with a move action waits for the move; an explicit reveal of its line does not fly it', () => {
    let b = boardStateAt(scene, 3, 2); // mark + focus fired, move not yet
    expect(b.marks).toEqual([{ kind: 'underline', tokens: ['sq'], seq: 7 }]);
    expect(b.focus).toMatchObject({ key: 'tok:0:2', hold: FOCUS_HOLD_S });
    expect(lineOn(b, 1)).toBe(false);
    b = boardStateAt(scene, 3, 3);     // move sq
    expect(b.moved.has('sq')).toBe(true);
    expect(lineOn(b, 1)).toBe(true);
    expect(tokenShown(b, scene, 1, 0)).toBe(true);   // "="
    expect(tokenShown(b, scene, 1, 1)).toBe(true);   // the landed square
    expect(tokenShown(b, scene, 1, 2)).toBe(false);  // -9/4 waits for ITS move
    expect(tokenShown(b, scene, 1, 3)).toBe(false);  // "+ 2" behind it
    b = boardStateAt(scene, 4, 1);     // reveal step 1 — magic still movable, still waiting
    expect(b.moved.has('magic')).toBe(false);
    expect(tokenShown(b, scene, 1, 2)).toBe(false);
    b = boardStateAt(scene, 4, 2);
    expect(b.moved.has('magic')).toBe(true);
    expect(tokenShown(b, scene, 1, 2)).toBe(true);
    expect(tokenShown(b, scene, 1, 3)).toBe(true);
  });

  it('a from-token WITHOUT a move flies with its line (the original behaviour)', () => {
    const s = recipe([{ say: 'Reveal it all.', do: [R({ step: 0 }), R({ step: 1, at: 0.5 })] }]);
    const b = boardStateAt(s, 0, 2);
    expect(b.moved).toEqual(new Set(['sq', 'magic']));
    expect(tokenShown(b, s, 1, 1)).toBe(true);
    expect(tokenShown(b, s, 1, 2)).toBe(true);
  });

  it('write step marks every untargeted token of the line as written; clear wipes the pen layer, board wipes everything', () => {
    let b = boardStateAt(scene, 5, 2);
    expect(b.written.has('line:2')).toBe(true);
    expect(tokenWritten(b, 2, 0)).toBe(true);
    expect(b.marks).toHaveLength(2);
    b = boardStateAt(scene, 5, 3); // clear (pen)
    expect(b.marks).toEqual([]);
    expect(b.notes).toEqual([]);
    expect(b.focus).toBeNull();
    expect(lineOn(b, 2)).toBe(true); // the working stays
    const wipe = recipe([{ say: 'Wipe.', do: [W({ step: 0 }), { do: 'clear', what: 'board' }] }]);
    const w = boardStateAt(wipe, 0, 2);
    expect(w.shown.size).toBe(0);
    expect(w.moved.size).toBe(0);
  });

  it('a scene without beats has an empty board', () => {
    const plain = { ...scene, beats: undefined } as unknown as EquationStepsScene;
    expect(boardStateAt(plain, 0, 0)).toEqual(emptyBoard(plain));
    expect(sceneTargets(plain)).toEqual({ targeted: new Set(), movable: new Set() });
  });

  it('graph morph: state 0 until a morph, then the morphed state', () => {
    const g: PlayScene = {
      type: 'graph-morph',
      states: [{ label: 'a', coeffs: [0, 0, 1] }, { label: 'b', coeffs: [4, -4, 1] }],
      window: { xMin: -2, xMax: 6, yMin: -6, yMax: 8 },
      beats: [{ say: 'Start here.', do: [] }, { say: 'Slide it right.', do: [{ do: 'morph', state: 1, at: 0.2 }] }],
    };
    expect(boardStateAt(g, 1, 0).state).toBe(0);
    expect(boardStateAt(g, 1, 1).state).toBe(1);
  });

  it('caption paragraphs: written ones wait for their beat, an untargeted one is static', () => {
    const c: PlayScene = {
      type: 'caption', text: 'One.\n\nTwo.\n\nThree.',
      beats: [{ say: 'The first.', do: [W({ text: 'text', para: 0 })] }, { say: 'The second.', do: [W({ text: 'text', para: 1 })] }],
    };
    const b = boardStateAt(c, 1, 0);
    expect(elementShown(b, 'para:0')).toBe(true);
    expect(elementShown(b, 'para:1')).toBe(false);
    expect(elementShown(b, 'para:2')).toBe(true); // never targeted → on the board from entry
  });
});

// ── Prose groups (which beat reads which words) ──────────────────────────────

describe('proseGroup', () => {
  const scene = recipe(RECIPE_BEATS);
  it('maps prose to the beat that writes it, with the fraction it appears at', () => {
    expect(proseGroup(scene, 'text:intro')).toEqual({ beat: 0, at: 0 });
    expect(proseGroup(scene, 'text:heading')).toBeNull(); // static
  });
  it("a line's note belongs to the explicit reveal of the line, not the flight that showed it first", () => {
    // Line 1 first appears in beat 3 (the square flies in); beat 4 reveals it proper.
    expect(proseGroup(scene, 'line:1')).toEqual({ beat: 4, at: 0.02 });
    // Line 0 is only ever shown through its tokens: the first token write.
    expect(proseGroup(scene, 'line:0')).toEqual({ beat: 0, at: 0.5 });
    expect(proseGroup(scene, 'line:2')).toEqual({ beat: 5, at: 0.05 });
  });
  it('beatTimeline pairs each action with its resolved time', () => {
    const t = beatTimeline(scene, 2);
    expect(t.map(x => x.at)).toEqual([0.05, 0.45, 0.7, 0.75]);
    expect(t[3].action.do).toBe('highlight');
    expect(beatTimeline({ type: 'caption', text: 't' }, 0)).toEqual([]);
  });
});

// ── The schema side: a beat IS the sub-step, narration is derived ────────────

describe('beats as sub-steps (lesson-script)', () => {
  const scene = recipe(RECIPE_BEATS);
  it('sceneStepCount is the beat count; narration derives from say; clips from beat.audio', () => {
    expect(hasBeats(scene)).toBe(true);
    expect(sceneStepCount(scene)).toBe(6);
    expect(narrationLayout(scene)).toBe('steps');
    expect(sceneNarration(scene)).toEqual(RECIPE_BEATS.map(b => b.say));
    expect(sceneAudio(scene)).toEqual([null, null, null, null, null, null]);
    expect(narrationAt(scene, 1)).toEqual({ text: 'Halve it, square it.', audio: null, timing: null });
    expect(narrationAt(scene, 6)).toBeNull();
    expect(lessonHasAudio([scene])).toBe(false);
    const voiced = { ...scene, beats: scene.beats!.map((b, k) => ({ ...b, audio: beatClipPath('quadratic-functions-am', 5, k + 1) })) };
    expect(lessonHasAudio([voiced])).toBe(true);
    expect(narrationAt(voiced, 2)?.audio).toBe('/lessons/quadratic-functions-am/scene-05-b3.mp3');
  });
  it('beatClipPath names clips scene-NN-bK.mp3 (1-based, zero-padded)', () => {
    expect(beatClipPath('x-y', 1, 1)).toBe('/lessons/x-y/scene-01-b1.mp3');
    expect(beatClipPath('x-y', 12, 10)).toBe('/lessons/x-y/scene-12-b10.mp3');
  });
  it('validates the fixture as a whole script', () => {
    const r = validateLessonScript({ slug: 't', title: 'T', level: 'AM', topic: 'Quadratic Functions', minutes: 3, theme: 'chalk', scenes: [scene] });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });
  it('tok / line keys are stable strings', () => {
    expect(tokKey(0, 2)).toBe('tok:0:2');
    expect(lineKey(1)).toBe('line:1');
  });
});
