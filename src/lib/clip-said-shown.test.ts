import { describe, expect, it } from 'vitest';
import { saidItems, saidNotShown } from './clip-said-shown';
import type { EquationStepsScene } from './lesson-script';

describe('saidItems — spoken maths to what the board must show', () => {
  it('turns number words into digits', () => {
    expect(saidItems('Sixty-two minus fifty is twelve.').map(i => i.want)).toEqual(['62', '50', '12']);
    expect(saidItems('About zero point six nine three.').map(i => i.want)).toEqual(['0.693']);
    expect(saidItems('At T equals seven point five, P is two hundred.').map(i => i.want)).toEqual(['7.5', '200']);
  });
  it('skips counts and words that are not numbers', () => {
    expect(saidItems('Four steps: first the asymptote.')).toEqual([]);
    expect(saidItems('Step one, the asymptote.')).toEqual([]);
    expect(saidItems('Subtracting joins the two logs into one.')).toEqual([]);
    expect(saidItems('Log is base ten, so un-log.')).toEqual([]);
  });
  it('reads letter pairs as names', () => {
    expect(saidItems('Call its intensity I P.').map(i => i.want)).toEqual(['I_p']);
    expect(saidItems('So P nought is one hundred.').map(i => i.want)).toEqual(['P_0', '100']);
  });
});

const scene = (beats: EquationStepsScene['beats']): EquationStepsScene => ({
  type: 'equation-steps',
  steps: [
    { tokens: [{ tex: 'N=10\\lg\\dfrac{I}{k}', id: 'f' }] },
    { tokens: [{ tex: '50=10\\lg\\dfrac{I_p}{k}', id: 'pump' }] },
    { tokens: [{ tex: '\\dfrac{I_d}{I_p}=\\;?', id: 'want' }] },
  ],
  beats,
});

describe('saidNotShown — the old cuts Adrian corrected are caught', () => {
  it('flags a reading said before it is on the board (Log scales, 18 Oct 2026)', () => {
    const s = scene([
      { say: 'The formula links two numbers.', do: [{ do: 'write', step: 0 }] },
      { say: 'The pump is fifty decibels.', do: [] },
      { say: 'Fifty equals ten log I P over K.', do: [{ do: 'write', step: 1 }] },
    ]);
    expect(saidNotShown(s).map(i => [i.beat, i.want])).toEqual([[1, '50']]);
  });
  it('flags "I D over I P" until the fraction is written', () => {
    const s = scene([
      { say: 'The formula.', do: [{ do: 'write', step: 0 }] },
      { say: 'We want I D over I P.', do: [{ do: 'write', step: 1 }] },
      { say: 'That is I D over I P.', do: [{ do: 'write', step: 2 }] },
    ]);
    expect(saidNotShown(s).map(i => [i.beat, i.want])).toEqual([[1, 'I_d'], [1, 'I_d/I_p']]);
  });
  it('passes when everything said is written by the end of its beat', () => {
    const s = scene([
      { say: 'The formula.', do: [{ do: 'write', step: 0 }] },
      { say: 'So fifty equals ten log I P over K.', do: [{ do: 'write', step: 1 }] },
    ]);
    expect(saidNotShown(s)).toEqual([]);
  });
});
