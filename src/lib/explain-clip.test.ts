import { describe, expect, it } from 'vitest';
import { buildExplainScript, canExplain, explainHref, isProse, spokenMath, speakable } from './explain-clip';
import { validateLessonScript, type CaptionScene, type EquationStepsScene } from './lesson-script';
import type { StudentQuestion } from './portal-marking';

const base: StudentQuestion = {
  questionNumber: '6', awarded: 1, max: 4, topic: 'Quadratic Equations', comment: 'Sign slip when moving the term.',
  slips: ['(a) You moved $3x$ across without changing its sign.'], full: false, prompt: 'Solve $x^2 + 3x = 4$.',
  schemes: [], solution: null, revise: null,
};

describe('speakable', () => {
  it('says a fraction, a power and a root in words and leaves no TeX behind', () => {
    expect(spokenMath('\\frac{3}{2}')).toBe('3 over 2');
    expect(spokenMath('x^2 + 3x')).toBe('x squared plus 3x');
    expect(spokenMath('\\sqrt{x} - 1')).toBe('root x minus 1');
    const out = speakable('Halve it: $-\\tfrac{3}{2}$, then square: $\\left(\\tfrac{3}{2}\\right)^2 = \\tfrac{9}{4}$.');
    expect(out).not.toMatch(/[$\\^_{}]/);
    expect(out).toContain('3 over 2');
    expect(out).toContain('9 over 4');
  });
  it('falls back when the reason is empty and caps a long one', () => {
    expect(speakable('', 'Then this.')).toBe('Then this.');
    expect(speakable('word '.repeat(80)).length).toBeLessThanOrEqual(220);
  });
});

describe('buildExplainScript', () => {
  it('replays a continuation: your lines, the boxed ✗, the pen steps with their reasons, the Answer', () => {
    const q: StudentQuestion = { ...base, fixes: [{ label: '(a)', yours: ['x^2 + 3x = 4', 'x^2 + 3x + 4 = 0'], steps: [{ latex: 'x^2 + 3x - 4 = 0', why: 'Bring $4$ across: it becomes $-4$.' }, { latex: '(x + 4)(x - 1) = 0', why: 'Factorise.' }], final: 'x = -4 \\text{ or } x = 1', at: 1 }] };
    const script = buildExplainScript(q, '9ab6da10-0000-0000-0000-000000000000');
    expect(script).not.toBeNull();
    const v = validateLessonScript(script);
    expect(v.ok, JSON.stringify(v)).toBe(true);
    expect(script!.theme).toBe('chalk');
    expect(script!.minutes).toBe(1);
    const scene = script!.scenes[0] as EquationStepsScene;
    expect(scene.heading).toBe('Q6(a) · where the mark went');
    expect(scene.steps.map(st => st.tokens[0].tex)).toEqual(['x^2 + 3x = 4', 'x^2 + 3x + 4 = 0', 'x^2 + 3x - 4 = 0', '(x + 4)(x - 1) = 0', '\\textbf{Answer:}\\; x = -4 \\text{ or } x = 1']);
    expect(scene.steps[1].tokens[0].hl).toBe('rose');
    expect(scene.steps[2].note).toBe('Bring $4$ across: it becomes $-4$.');
    const beats = scene.beats!;
    expect(beats).toHaveLength(5);
    expect(beats[1].say).toBe('You moved 3x across without changing its sign.');
    expect(beats[1].do.some(a => a.do === 'mark')).toBe(true);
    expect(beats[2].say).toBe('Bring 4 across: it becomes minus 4.');
    expect(beats[4].say).toBe('And that is the answer.');
  });
  it('falls back to the ✗ line + fix pairs when no part has a continuation (science)', () => {
    const q: StudentQuestion = { ...base, corrections: [{ yours: 'F = ma = 2 \\times 3 = 5', fix: 'F = ma = 2 \\times 3 = 6\\ \\text{N}' }] };
    const script = buildExplainScript(q, 'run');
    expect(validateLessonScript(script).ok).toBe(true);
    const scene = script!.scenes[0] as EquationStepsScene;
    expect(scene.steps).toHaveLength(2);
    expect(scene.beats!.map(b => b.say)).toEqual(['You wrote this line.', 'The fix: You moved 3x across without changing its sign.']);
  });
  it('sets a science SENTENCE as written words, not maths (Adrian, 1 Oct 2026: the spaces vanished)', () => {
    expect(isProse('As black is a better emitter of heat, it cools faster.')).toBe(true);
    expect(isProse('F = ma = 2 \\times 3 = 5')).toBe(false);
    expect(isProse('hence proved')).toBe(false);
    const q: StudentQuestion = { ...base, questionNumber: '10', topic: 'Thermal properties', slips: ['black is a better emitter of radiation'], corrections: [
      { yours: 'As black is a better emitter of heat, it cools faster.', fix: 'black is a better emitter of radiation: pan B radiates infra-red faster, so it cools faster' },
      { yours: 'Q = mc\\Delta T = 2 \\times 4200 \\times 5', fix: 'Q = mc\\Delta T = 2 \\times 4200 \\times 50' },
    ] };
    const script = buildExplainScript(q, 'run')!;
    expect(validateLessonScript(script).ok, JSON.stringify(validateLessonScript(script))).toBe(true);
    expect(script.scenes.map(sc => sc.type)).toEqual(['caption', 'equation-steps']);
    const cap = script.scenes[0] as CaptionScene;
    expect(cap.text).toBe('✗ You wrote: As black is a better emitter of heat, it cools faster.\n\n✓ Write instead: black is a better emitter of radiation: pan B radiates infra-red faster, so it cools faster');
    expect(cap.beats!.map(b => b.say)).toEqual([
      'You wrote: As black is a better emitter of heat, it cools faster.',
      'Write instead: black is a better emitter of radiation: pan B radiates infra-red faster, so it cools faster. black is a better emitter of radiation',
    ]);
    const board = script.scenes[1] as EquationStepsScene;
    expect(board.steps[0].tokens[0].tex).toBe('Q = mc\\Delta T = 2 \\times 4200 \\times 5');
  });
  it('is null with nothing to replay, and canExplain agrees', () => {
    expect(buildExplainScript(base, 'run')).toBeNull();
    expect(canExplain(base)).toBe(false);
    expect(canExplain({ fixes: [{ label: null, yours: ['a'], steps: [{ latex: 'b', why: '' }], final: null, at: 0 }] })).toBe(true);
    expect(canExplain({ corrections: [{ yours: 'a', fix: '' }] })).toBe(false);
  });
  it('caps the clip at two parts and six pen steps, and never writes an empty tex', () => {
    const fix = { label: null, yours: [''], steps: Array.from({ length: 9 }, (_, i) => ({ latex: `s${i}`, why: '' })), final: null, at: 0 };
    const q: StudentQuestion = { ...base, fixes: [{ ...fix, label: '(a)' }, { ...fix, label: '(b)' }, { ...fix, label: '(c)' }] };
    const script = buildExplainScript(q, 'run')!;
    expect(validateLessonScript(script).ok).toBe(true);
    expect(script.scenes).toHaveLength(2);
    expect((script.scenes[0] as EquationStepsScene).steps).toHaveLength(7);
    expect((script.scenes[0] as EquationStepsScene).steps[0].tokens[0].tex).toBe('\\;');
  });
  it('names the route', () => {
    expect(explainHref('abc', '6(a)')).toBe('/app/marking/abc/explain/6(a)');
  });
});
